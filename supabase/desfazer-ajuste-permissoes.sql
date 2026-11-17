-- Desfaz supabase/ajuste-permissoes.sql (recria exatamente as regras antigas, copiadas do banco em 17/11/2026).
begin;
create policy bk_ins on public.bookings for insert to public with check (account_id = my_account());
create policy bk_upd on public.bookings for update to public using ((account_id = my_account()) and ((my_role() = 'owner') or (status = 'aberta'))) with check (account_id = my_account());
create policy pay_ins on public.payments for insert to public with check (account_id = my_account());
create policy pay_upd on public.payments for update to public using ((account_id = my_account()) and (my_role() = 'owner'));
create policy itineraries_insert on public.itineraries for insert to authenticated with check (account_id = my_account());
create policy itineraries_update on public.itineraries for update to authenticated using (account_id = my_account()) with check (account_id = my_account());
grant update (id, primary_owner_user_id, created_at) on public.accounts to authenticated;
commit;
