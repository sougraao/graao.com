-- P2.5, fatia 2 (D26): log de auditoria da agência em tabela própria.
-- Rodar inteiro, uma vez, no SQL Editor do projeto Supabase da graao (zlkhoucdqfxgiorujifj).
-- Só cria uma tabela nova; não altera nem apaga nada que já existe. Se algo falhar, tudo é desfeito.
-- Equivale a 20261124180000_go_agency_audit.sql + o trecho novo do provision-storage.sql. A condição de acesso é copiada
-- da política que já protege go_workspaces, então não é preciso informar o hash da GO_STORAGE_KEY.
begin;

create table public.go_agency_audit (
  agency text not null,
  id text not null,
  created_at timestamptz not null,
  target text not null default '',
  search text not null default '',
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  primary key (agency, id)
);

create index go_agency_audit_recent on public.go_agency_audit (agency, created_at desc, id desc);
create index go_agency_audit_target on public.go_agency_audit (agency, target, created_at desc, id desc);
create index go_agency_audit_age on public.go_agency_audit (created_at);

alter table public.go_agency_audit enable row level security;
revoke all on table public.go_agency_audit from public, anon, authenticated, service_role;
grant select, insert, delete on table public.go_agency_audit to service_role;
grant select, insert, delete on table public.go_agency_audit to anon;

do $$
declare
  regra text;
begin
  select p.qual into regra from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'go_workspaces' and p.policyname = 'go_storage_read' and p.cmd = 'SELECT';
  if regra is null or position('x-go-storage-key' in regra) = 0 or position('sha256' in regra) = 0 then
    raise exception 'A política go_storage_read não foi encontrada como esperado. Este é o projeto da graao?';
  end if;
  execute format('create policy go_audit_read on public.go_agency_audit for select to anon using (%s)', regra);
  execute format('create policy go_audit_insert on public.go_agency_audit for insert to anon with check (%s)', regra);
  execute format('create policy go_audit_delete on public.go_agency_audit for delete to anon using (%s)', regra);
end
$$;

notify pgrst, 'reload schema';
commit;

-- Conferência: rls deve ser true e politicas deve ser 3.
select c.relrowsecurity as rls, (select count(*) from pg_policies where tablename = 'go_agency_audit') as politicas
from pg_class c where c.oid = 'public.go_agency_audit'::regclass;
