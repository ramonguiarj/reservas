-- Migração fluida_minha_pagina (20/11/2026)
-- Página pública do guia (/g/<endereço>) com roteiros, fotos, valores e reserva online.
-- public.guide_sites: uma página por conta (endereço, publicada, conteúdo em jsonb).
-- public.site_tours: configuração de cada roteiro na página (fotos, textos PT/EN/ES, preço, horários…).
-- Bucket público fluida-site: fotos da página, pasta = id da conta. Só quem tem acesso total edita.
-- RPCs públicas: fluida_site_public (dados da página) e fluida_site_start_booking (cria um link de reserva
--   com valor calculado no servidor; o cliente segue para /reservar, que já cria a reserva e cobra o sinal).
-- fluida_links_private.links.origin: 'manual' (criado no app) ou 'site'.

alter table fluida_links_private.links add column if not exists origin text not null default 'manual';

create table if not exists public.guide_sites (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  slug text not null unique,
  published boolean not null default false,
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint guide_sites_slug_ok check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' and slug !~ '--'),
  constraint guide_sites_content_size check (jsonb_typeof(content) = 'object' and octet_length(content::text) < 200000)
);

create table if not exists public.site_tours (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  itinerary_id uuid references public.itineraries(id) on delete set null,
  published boolean not null default false,
  sort integer not null default 0,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint site_tours_data_size check (jsonb_typeof(data) = 'object' and octet_length(data::text) < 60000)
);
create unique index if not exists site_tours_account_itinerary on public.site_tours(account_id, itinerary_id) where itinerary_id is not null;
create index if not exists site_tours_account on public.site_tours(account_id);

create or replace function public.fluida_site_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_table_name = 'guide_sites' then
    new.slug := lower(btrim(new.slug));
    if new.slug in ('admin','api','app','fluida','reservar','conheca','guias','g','www','suporte','login','ajuda','privacidade','termos','site','pagina') then
      raise exception 'Este endereço é reservado. Escolha outro.' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guide_sites_guard on public.guide_sites;
create trigger guide_sites_guard before insert or update on public.guide_sites for each row execute function public.fluida_site_guard();
drop trigger if exists site_tours_guard on public.site_tours;
create trigger site_tours_guard before insert or update on public.site_tours for each row execute function public.fluida_site_guard();

alter table public.guide_sites enable row level security;
alter table public.site_tours enable row level security;

drop policy if exists guide_sites_select on public.guide_sites;
create policy guide_sites_select on public.guide_sites for select to authenticated using (public.team_access_level(account_id) is not null);
drop policy if exists guide_sites_write on public.guide_sites;
create policy guide_sites_write on public.guide_sites for all to authenticated
  using (public.team_access_level(account_id) = 'total') with check (public.team_access_level(account_id) = 'total');

drop policy if exists site_tours_select on public.site_tours;
create policy site_tours_select on public.site_tours for select to authenticated using (public.team_access_level(account_id) is not null);
drop policy if exists site_tours_write on public.site_tours;
create policy site_tours_write on public.site_tours for all to authenticated
  using (public.team_access_level(account_id) = 'total') with check (public.team_access_level(account_id) = 'total');

revoke all on public.guide_sites, public.site_tours from anon;
grant select, insert, update, delete on public.guide_sites, public.site_tours to authenticated;

-- Fotos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fluida-site', 'fluida-site', true, 6291456, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.fluida_site_can_edit(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_acc uuid;
begin
  begin v_acc := split_part(coalesce(p_name,''), '/', 1)::uuid; exception when others then return false; end;
  return public.team_access_level(v_acc) = 'total';
end $$;
revoke all on function public.fluida_site_can_edit(text) from public, anon;
grant execute on function public.fluida_site_can_edit(text) to authenticated;

drop policy if exists fluida_site_insert on storage.objects;
create policy fluida_site_insert on storage.objects for insert to authenticated with check (bucket_id = 'fluida-site' and public.fluida_site_can_edit(name));
drop policy if exists fluida_site_update on storage.objects;
create policy fluida_site_update on storage.objects for update to authenticated using (bucket_id = 'fluida-site' and public.fluida_site_can_edit(name)) with check (bucket_id = 'fluida-site' and public.fluida_site_can_edit(name));
drop policy if exists fluida_site_delete on storage.objects;
create policy fluida_site_delete on storage.objects for delete to authenticated using (bucket_id = 'fluida-site' and public.fluida_site_can_edit(name));

-- Helpers (não expostos)
create or replace function fluida_links_private.num(p text, p_default numeric) returns numeric language plpgsql immutable set search_path = '' as $$
begin return coalesce(nullif(btrim(p),'')::numeric, p_default); exception when others then return p_default; end $$;

-- Dias sem vaga (bloqueados pelo guia ou com o limite diário atingido), próximos 240 dias
create or replace function fluida_links_private.site_busy_days(p_account uuid, p_content jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  with lim as (select greatest(0, fluida_links_private.num(p_content->>'daily_limit', 0))::int as n),
  today as (select (now() at time zone 'America/Sao_Paulo')::date as t0),
  blocked as (
    select x::date as d from jsonb_array_elements_text(case when jsonb_typeof(p_content->'blocked') = 'array' then p_content->'blocked' else '[]'::jsonb end) x
    where x ~ '^\d{4}-\d{2}-\d{2}$'
  ),
  full_days as (
    select b.tour_date as d from public.bookings b, lim, today
    where lim.n > 0 and b.account_id = p_account and b.status <> 'cancelada' and b.tour_date between today.t0 and today.t0 + 240
    group by b.tour_date having count(*) >= max(lim.n)
  )
  select coalesce(jsonb_agg(distinct to_char(d, 'YYYY-MM-DD')), '[]'::jsonb)
  from (select blocked.d from blocked, today where blocked.d >= today.t0 union select d from full_days) z
$$;

create or replace function public.fluida_site_public(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.guide_sites; a public.accounts;
begin
  if coalesce(p_slug,'') !~ '^[a-z0-9-]{3,40}$' then return null; end if;
  select * into s from public.guide_sites where slug = lower(p_slug) and published;
  if not found or not public.fluida_account_active(s.account_id) then return null; end if;
  select * into a from public.accounts where id = s.account_id;
  return jsonb_build_object(
    'slug', s.slug,
    'business', coalesce(nullif(a.branding->'voucher'->>'sender_name',''), a.name),
    'logo', case when length(coalesce(a.branding->>'logo','')) < 400000 then a.branding->>'logo' else null end,
    'color', coalesce(nullif(s.content->>'color',''), a.branding->>'primary_color'),
    'content', s.content - 'blocked' - 'daily_limit',
    'review_url', a.review_url,
    'cancel_policy', a.cancel_policy,
    'pay_mode', case when exists (select 1 from fluida_links_private.mp_accounts m where m.account_id = a.id) then 'mp'
                     when coalesce(a.branding->'voucher'->>'pix_key','') <> '' then 'key' else 'none' end,
    'busy', fluida_links_private.site_busy_days(a.id, s.content),
    'today', to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD'),
    'tours', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'data', t.data,
               'name', coalesce(i.name, ''), 'duration', coalesce(i.duration, ''), 'transport', coalesce(i.transport_included, false))
             order by t.sort, t.updated_at)
      from public.site_tours t left join public.itineraries i on i.id = t.itinerary_id
      where t.account_id = a.id and t.published and (t.itinerary_id is null or coalesce(i.active, false))
    ), '[]'::jsonb));
end $$;
revoke all on function public.fluida_site_public(text) from public;
grant execute on function public.fluida_site_public(text) to anon, authenticated;

create or replace function public.fluida_site_start_booking(p_slug text, p_tour uuid, p_date date, p_time text, p_pax integer, p_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.guide_sites; t public.site_tours; a public.accounts; it public.itineraries;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_price numeric; v_total numeric; v_dep numeric; v_pct numeric; v_min int; v_max int; v_adv int;
  v_owner uuid; v_time time; v_title text; v_times jsonb; v_days jsonb; v_msg text;
begin
  if coalesce(p_hash,'') !~ '^[a-f0-9]{64}$' or p_date is null or p_tour is null then raise exception 'Dados inválidos' using errcode = '22023'; end if;
  select * into s from public.guide_sites where slug = lower(coalesce(p_slug,'')) and published;
  if not found or not public.fluida_account_active(s.account_id) then raise exception 'Esta página não está disponível no momento.' using errcode = '22023'; end if;
  select * into a from public.accounts where id = s.account_id;
  select * into t from public.site_tours where id = p_tour and account_id = s.account_id and published;
  if not found then raise exception 'Este roteiro não está disponível.' using errcode = '22023'; end if;
  if t.itinerary_id is not null then
    select * into it from public.itineraries where id = t.itinerary_id;
    if not found or not coalesce(it.active, false) then raise exception 'Este roteiro não está disponível.' using errcode = '22023'; end if;
  end if;

  -- limite de pedidos (proteção contra abuso)
  if (select count(*) from fluida_links_private.links where account_id = a.id and origin = 'site' and created_at > now() - interval '10 minutes') >= 30
     or (select count(*) from fluida_links_private.links where origin = 'site' and created_at > now() - interval '10 minutes') >= 300 then
    raise exception 'Muitos pedidos agora. Tente de novo em alguns minutos.' using errcode = '22023';
  end if;

  v_adv := greatest(0, least(60, fluida_links_private.num(coalesce(t.data->>'min_advance_days', s.content->>'min_advance_days'), 1)::int));
  if p_date < v_today + v_adv or p_date > v_today + 365 then raise exception 'Escolha outra data.' using errcode = '22023'; end if;
  if fluida_links_private.site_busy_days(a.id, s.content) ? to_char(p_date, 'YYYY-MM-DD') then raise exception 'Data indisponível. Escolha outra data.' using errcode = '22023'; end if;
  v_days := case when jsonb_typeof(t.data->'weekdays') = 'array' then t.data->'weekdays' else '[]'::jsonb end;
  if jsonb_array_length(v_days) > 0 and not (v_days @> to_jsonb(extract(dow from p_date)::int)) then raise exception 'Este roteiro não acontece nesse dia da semana.' using errcode = '22023'; end if;

  v_times := case when jsonb_typeof(t.data->'times') = 'array' then t.data->'times' else '[]'::jsonb end;
  if coalesce(p_time,'') <> '' then
    if p_time !~ '^\d{2}:\d{2}$' then raise exception 'Horário inválido' using errcode = '22023'; end if;
    v_time := p_time::time;
  end if;
  if jsonb_array_length(v_times) > 0 and (p_time is null or not (v_times ? p_time)) then raise exception 'Escolha um dos horários disponíveis.' using errcode = '22023'; end if;

  v_min := greatest(1, fluida_links_private.num(t.data->>'min_pax', 1)::int);
  v_max := least(200, greatest(v_min, fluida_links_private.num(t.data->>'max_pax', 20)::int));
  if p_pax is null or p_pax < v_min or p_pax > v_max then raise exception 'Quantidade de pessoas fora do permitido (% a %).', v_min, v_max using errcode = '22023'; end if;

  v_price := round(fluida_links_private.num(t.data->>'price', 0), 2);
  if v_price <= 0 then raise exception 'Valor sob consulta. Fale com o guia no WhatsApp.' using errcode = '22023'; end if;
  v_total := case when t.data->>'mode' = 'group' then v_price else round(v_price * p_pax, 2) end;
  v_pct := greatest(10, least(100, fluida_links_private.num(coalesce(nullif(t.data->>'deposit_pct',''), s.content->>'deposit_pct'), 30)));
  v_dep := greatest(1, round(v_total * v_pct / 100, 2));
  if v_dep > v_total then v_dep := v_total; end if;

  v_title := left(coalesce(nullif(btrim(t.data->'title'->>'pt'),''), it.name, 'Passeio'), 200);
  v_msg := left(nullif(btrim(coalesce(t.data->'includes'->>'pt','')),''), 1000);
  v_owner := coalesce(a.primary_owner_user_id, (select m.user_id from public.members m where m.account_id = a.id and m.role = 'owner' limit 1));
  if v_owner is null then raise exception 'Esta página não está disponível no momento.' using errcode = '22023'; end if;

  insert into fluida_links_private.links (token_hash, account_id, created_by, itinerary, tour_date, tour_time, pax, total, deposit, pickup, message, expires_at, origin)
  values (p_hash, a.id, v_owner, v_title, p_date, v_time, p_pax, v_total, v_dep, null, v_msg,
          least(now() + interval '1 day', (p_date + 1)::timestamptz), 'site');
  return jsonb_build_object('ok', true, 'total', v_total, 'deposit', v_dep);
end $$;
revoke all on function public.fluida_site_start_booking(text, uuid, date, text, integer, text) from public;
grant execute on function public.fluida_site_start_booking(text, uuid, date, text, integer, text) to anon, authenticated;

-- /reservar: WhatsApp do guia e endereço da página (para voltar e avisar o guia)
create or replace function public.fluida_booking_link_info(p_hash text)
 returns jsonb language sql stable security definer set search_path to '' as $function$
  select jsonb_build_object(
    'business', coalesce(nullif(a.branding->'voucher'->>'sender_name',''), a.name),
    'logo', case when length(coalesce(a.branding->>'logo','')) < 400000 then a.branding->>'logo' else null end,
    'color', a.branding->>'primary_color',
    'itinerary', l.itinerary, 'tour_date', l.tour_date, 'tour_time', l.tour_time, 'pax', l.pax, 'total', l.total, 'deposit', l.deposit,
    'pickup', l.pickup, 'message', l.message, 'cancel_policy', a.cancel_policy,
    'status', case when l.status='open' and (l.expires_at <= now() or not public.fluida_account_active(a.id)) then 'expired' else l.status end,
    'pay_mode', case when exists (select 1 from fluida_links_private.mp_accounts m where m.account_id = a.id) then 'mp'
                     when coalesce(a.branding->'voucher'->>'pix_key','') <> '' then 'key' else 'none' end,
    'pix_key', a.branding->'voucher'->>'pix_key', 'pix_city', coalesce(nullif(a.branding->'voucher'->>'pix_city',''),'RIO DE JANEIRO'),
    'client_name', l.client->>'name', 'claimed', l.client_paid_claim_at is not null,
    'booking_code', (select b.booking_code from public.bookings b where b.id = l.booking_id),
    'origin', l.origin,
    'whatsapp', (select nullif(gs.content->>'whatsapp','') from public.guide_sites gs where gs.account_id = a.id and gs.published),
    'site', (select gs.slug from public.guide_sites gs where gs.account_id = a.id and gs.published))
  from fluida_links_private.links l join public.accounts a on a.id = l.account_id
  where l.token_hash = p_hash
$function$;

create or replace function public.fluida_list_booking_links(p_account uuid)
 returns jsonb language plpgsql stable security definer set search_path to '' as $function$
begin
  if public.team_access_level(p_account) is null then raise exception 'Sem permissão' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'itinerary', l.itinerary, 'tour_date', l.tour_date, 'tour_time', l.tour_time, 'pax', l.pax,
      'total', l.total, 'deposit', l.deposit, 'status', case when l.status='open' and l.expires_at <= now() then 'expired' else l.status end,
      'expires_at', l.expires_at, 'booking_id', l.booking_id, 'client_name', l.client->>'name', 'claimed', l.client_paid_claim_at is not null, 'created_at', l.created_at,
      'origin', l.origin) order by l.created_at desc)
    from (select * from fluida_links_private.links where account_id = p_account and (origin <> 'site' or status <> 'open') order by created_at desc limit 50) l), '[]'::jsonb);
end $function$;
