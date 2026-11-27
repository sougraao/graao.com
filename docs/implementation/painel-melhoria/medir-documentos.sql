-- P2.5: o que pesa nos documentos. SÓ LEITURA: devolve tamanhos e contagens, nunca nomes, textos ou ids.
-- Rodar no SQL Editor do projeto Supabase da graao (zlkhoucdqfxgiorujifj).
with partes as (
  select case when w.id = 'agency' or w.id like 'agency-%' then 'agência'
              when w.id ~ '^[a-z]+-' and w.id !~ '^[0-9a-f]{8}-' then 'outros documentos'
              else 'subconta' end as tipo,
         e.key as parte, octet_length(e.value::text) as bytes,
         case when jsonb_typeof(e.value) = 'array' then jsonb_array_length(e.value) end as itens
  from public.go_workspaces w cross join lateral jsonb_each(w.state) e
  where jsonb_typeof(w.state) = 'object'
),
pesos as (
  select tipo, parte, count(*) as documentos, sum(bytes) as bytes, max(bytes) as maior, sum(itens) as itens
  from partes group by 1, 2
),
mensagens as (
  select m ->> 'created' as criada
  from public.go_workspaces w
  cross join lateral jsonb_array_elements(case when jsonb_typeof(w.state -> 'messages') = 'array' then w.state -> 'messages' else '[]'::jsonb end) m
)
(select 1 as ordem, tipo || ' / ' || parte as item, pg_size_pretty(bytes) as total, pg_size_pretty(maior::bigint) as maior_documento, documentos::text as documentos, itens::text as itens
 from pesos order by bytes desc limit 20)
union all
select 2, 'mensagens com mais de 90 dias', count(*) filter (where criada < to_char(now() - interval '90 days', 'YYYY-MM-DD'))::text, '', '', count(*)::text from mensagens
union all
select 3, 'mensagens com mais de 180 dias', count(*) filter (where criada < to_char(now() - interval '180 days', 'YYYY-MM-DD'))::text, '', '', count(*)::text from mensagens
union all
select 4, 'tabela go_workspaces no disco', pg_size_pretty(pg_total_relation_size('public.go_workspaces')), '', (select count(*) from public.go_workspaces)::text, ''
union all
select 5, 'banco inteiro no disco', pg_size_pretty(pg_database_size(current_database())), '', '', ''
order by ordem;
