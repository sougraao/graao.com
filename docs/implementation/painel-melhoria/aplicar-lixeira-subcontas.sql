-- Lixeira de subcontas: deixa o servidor apagar de vez a subconta que passou 30 dias na lixeira.
-- Rodar inteiro, uma vez, no SQL Editor do projeto Supabase da graao (zlkhoucdqfxgiorujifj).
-- Só libera DELETE em go_workspaces para a chave do servidor; não apaga nada. Se algo falhar, tudo é desfeito.
-- Equivale ao trecho novo do provision-storage.sql. A condição de acesso é copiada da política que já protege
-- go_workspaces, então não é preciso informar o hash da GO_STORAGE_KEY.
-- Sem este SQL a exclusão funciona do mesmo jeito: a linha da subconta fica vazia e fora da agência.
begin;

grant delete on table public.go_workspaces to anon;
drop policy if exists go_storage_delete on public.go_workspaces;

do $$
declare
  regra text;
begin
  select p.qual into regra from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'go_workspaces' and p.policyname = 'go_storage_read' and p.cmd = 'SELECT';
  if regra is null or position('x-go-storage-key' in regra) = 0 or position('sha256' in regra) = 0 then
    raise exception 'A política go_storage_read não foi encontrada como esperado. Este é o projeto da graao?';
  end if;
  execute format('create policy go_storage_delete on public.go_workspaces for delete to anon using (%s)', regra);
end
$$;

notify pgrst, 'reload schema';
commit;

-- Conferência: deve aparecer uma linha com cmd = DELETE.
select policyname, cmd from pg_policies where tablename = 'go_workspaces' and policyname = 'go_storage_delete';
