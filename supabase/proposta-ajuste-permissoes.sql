-- PROPOSTA (NÃO APLICADA) — ajuste de permissões dentro de uma mesma conta.
-- Não apaga nem altera nenhuma reserva, pagamento, cliente ou valor: só remove regras antigas
-- que ficaram duplicadas e hoje deixam colaboradores fazerem mais do que o nível de acesso permite.
-- O isolamento ENTRE contas (um guia não vê outro) já está correto e não muda.

begin;

-- Reservas: as regras novas (team_bookings_*_level / fluida_v10_*) já cobrem inserir/editar por nível.
-- As antigas abaixo permitiam que um colaborador "visualizar" criasse reservas
-- e que qualquer colaborador editasse reservas abertas.
drop policy if exists bk_ins on public.bookings;
drop policy if exists bk_upd on public.bookings;

-- Pagamentos: idem (colaborador "visualizar" conseguia registrar pagamento).
drop policy if exists pay_ins on public.payments;
drop policy if exists pay_upd on public.payments;

-- Roteiros: a regra nova restringe ao responsável; a antiga deixava qualquer colaborador editar.
drop policy if exists itineraries_insert on public.itineraries;
drop policy if exists itineraries_update on public.itineraries;

-- Conta: o responsável não deve conseguir trocar o id nem o dono principal pelo app.
revoke update (id, primary_owner_user_id, created_at) on public.accounts from authenticated;

commit;
