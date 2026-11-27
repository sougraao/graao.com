-- Replace GO_STORAGE_KEY_SHA256 below with the hexadecimal SHA-256 of the
-- server's random 32-byte GO_STORAGE_KEY as stored in .env.local.
-- Apply after the storage migrations (go_workspaces, go_tracking_events and go_agency_audit). Reapply with a new hash to rotate the key.
begin;

grant select, insert, update, delete on table public.go_workspaces to anon;
drop policy if exists go_storage_read on public.go_workspaces;
drop policy if exists go_storage_insert on public.go_workspaces;
drop policy if exists go_storage_update on public.go_workspaces;
drop policy if exists go_storage_delete on public.go_workspaces;

-- Subconta que venceu a lixeira (30 dias) é apagada de vez.
create policy go_storage_delete on public.go_workspaces for delete to anon
using ((select encode(sha256(convert_to(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-go-storage-key', ''), 'UTF8')), 'hex') = 'GO_STORAGE_KEY_SHA256'));

create policy go_storage_read on public.go_workspaces for select to anon
using ((select encode(sha256(convert_to(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-go-storage-key', ''), 'UTF8')), 'hex') = 'GO_STORAGE_KEY_SHA256'));

create policy go_storage_insert on public.go_workspaces for insert to anon
with check ((select encode(sha256(convert_to(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-go-storage-key', ''), 'UTF8')), 'hex') = 'GO_STORAGE_KEY_SHA256'));

create policy go_storage_update on public.go_workspaces for update to anon
using ((select encode(sha256(convert_to(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-go-storage-key', ''), 'UTF8')), 'hex') = 'GO_STORAGE_KEY_SHA256'))
with check ((select encode(sha256(convert_to(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-go-storage-key', ''), 'UTF8')), 'hex') = 'GO_STORAGE_KEY_SHA256'));

-- Eventos do rastreamento (migração 20261124030000_go_tracking_events.sql).
grant select, insert, delete on table public.go_tracking_events to anon;
grant execute on function public.go_tracking_summary(text, timestamptz) to anon;
drop policy if exists go_tracking_read on public.go_tracking_events;
drop policy if exists go_tracking_insert on public.go_tracking_events;
drop policy if exists go_tracking_delete on public.go_tracking_events;

create policy go_tracking_read on public.go_tracking_events for select to anon
using ((select encode(sha256(convert_to(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-go-storage-key', ''), 'UTF8')), 'hex') = 'GO_STORAGE_KEY_SHA256'));

create policy go_tracking_insert on public.go_tracking_events for insert to anon
with check ((select encode(sha256(convert_to(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-go-storage-key', ''), 'UTF8')), 'hex') = 'GO_STORAGE_KEY_SHA256'));

create policy go_tracking_delete on public.go_tracking_events for delete to anon
using ((select encode(sha256(convert_to(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-go-storage-key', ''), 'UTF8')), 'hex') = 'GO_STORAGE_KEY_SHA256'));

-- Log de auditoria da agência (migração 20261124180000_go_agency_audit.sql).
grant select, insert, delete on table public.go_agency_audit to anon;
drop policy if exists go_audit_read on public.go_agency_audit;
drop policy if exists go_audit_insert on public.go_agency_audit;
drop policy if exists go_audit_delete on public.go_agency_audit;

create policy go_audit_read on public.go_agency_audit for select to anon
using ((select encode(sha256(convert_to(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-go-storage-key', ''), 'UTF8')), 'hex') = 'GO_STORAGE_KEY_SHA256'));

create policy go_audit_insert on public.go_agency_audit for insert to anon
with check ((select encode(sha256(convert_to(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-go-storage-key', ''), 'UTF8')), 'hex') = 'GO_STORAGE_KEY_SHA256'));

create policy go_audit_delete on public.go_agency_audit for delete to anon
using ((select encode(sha256(convert_to(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-go-storage-key', ''), 'UTF8')), 'hex') = 'GO_STORAGE_KEY_SHA256'));

-- Livro da cobrança (go_billing_ledger): leitura e inclusão; nunca mudança.
drop policy if exists go_ledger_read on public.go_billing_ledger;
drop policy if exists go_ledger_insert on public.go_billing_ledger;

create policy go_ledger_read on public.go_billing_ledger for select to anon
using ((select encode(sha256(convert_to(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-go-storage-key', ''), 'UTF8')), 'hex') = 'GO_STORAGE_KEY_SHA256'));

create policy go_ledger_insert on public.go_billing_ledger for insert to anon
with check ((select encode(sha256(convert_to(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-go-storage-key', ''), 'UTF8')), 'hex') = 'GO_STORAGE_KEY_SHA256'));

-- Página Plataforma (migração 20261125120000_go_platform_usage.sql): uso do projeto, só com a chave do servidor.
create or replace function public.go_platform_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if encode(sha256(convert_to(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-go-storage-key', ''), 'UTF8')), 'hex') <> 'GO_STORAGE_KEY_SHA256' then
    raise exception 'not allowed';
  end if;
  return jsonb_build_object(
    'db_bytes', pg_catalog.pg_database_size(pg_catalog.current_database()),
    'storage_bytes', coalesce((select sum((o.metadata ->> 'size')::bigint) from storage.objects o), 0),
    'mau', (select count(*) from auth.users u where u.last_sign_in_at >= pg_catalog.date_trunc('month', pg_catalog.now()))
  );
end;
$$;
revoke all on function public.go_platform_usage() from public, anon, authenticated;
grant execute on function public.go_platform_usage() to anon;

-- graao AI Gateway: log de requisições de IA (migração 20261126150000_go_ai_requests.sql). Só metadados, só inclusão.
grant select, insert, delete on table public.go_ai_requests to anon;
grant execute on function public.go_ai_requests_summary(timestamptz) to anon;
drop policy if exists go_ai_requests_read on public.go_ai_requests;
drop policy if exists go_ai_requests_insert on public.go_ai_requests;
drop policy if exists go_ai_requests_delete on public.go_ai_requests;

create policy go_ai_requests_read on public.go_ai_requests for select to anon
using ((select encode(sha256(convert_to(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-go-storage-key', ''), 'UTF8')), 'hex') = 'GO_STORAGE_KEY_SHA256'));

create policy go_ai_requests_insert on public.go_ai_requests for insert to anon
with check ((select encode(sha256(convert_to(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-go-storage-key', ''), 'UTF8')), 'hex') = 'GO_STORAGE_KEY_SHA256'));

-- Retenção: o servidor apaga linhas antigas (180 dias). Atualizar continua proibido pelo gatilho.
create policy go_ai_requests_delete on public.go_ai_requests for delete to anon
using ((select encode(sha256(convert_to(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-go-storage-key', ''), 'UTF8')), 'hex') = 'GO_STORAGE_KEY_SHA256'));

commit;
