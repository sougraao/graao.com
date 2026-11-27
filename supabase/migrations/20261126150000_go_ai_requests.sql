-- graao AI Gateway: log de requisições de IA (só metadados: nunca prompt nem resposta).
-- Uma linha por pedido, com tentativas, tokens, custo em micro-dólares (bigint, sem float) e a decisão de rota.
-- Só inclusão: atualizar é proibido. Apagar só pela retenção (prune do servidor, linhas com mais de 180 dias).
-- A política de acesso fica em provision-storage.sql (a mesma chave de servidor de go_workspaces).
-- Migração aditiva: não toca em nenhuma tabela existente. Rollback: drop table public.go_ai_requests cascade;
--   drop function public.go_ai_requests_summary(timestamptz); drop function public.go_ai_requests_immutable();
create table public.go_ai_requests (
  id text primary key,
  created_at timestamptz not null,
  org_id text not null,
  workspace_id text,
  user_id text,
  feature text not null check (feature ~ '^[a-z][a-z0-9_.-]{1,63}$'),
  mode text,
  plan text check (plan is null or plan in ('free', 'paid', 'byok')),
  requested_model text,
  provider text,
  model text,
  tier text check (tier is null or tier in ('free', 'paid', 'byok')),
  status text not null check (status in ('ok', 'error')),
  error_kind text,
  attempts integer not null default 0 check (attempts >= 0),
  input_tokens bigint check (input_tokens is null or input_tokens >= 0),
  output_tokens bigint check (output_tokens is null or output_tokens >= 0),
  cached_tokens bigint,
  reasoning_tokens bigint,
  usage_source text check (usage_source is null or usage_source in ('reported', 'estimated', 'unknown')),
  cost_micros bigint check (cost_micros is null or cost_micros >= 0),
  provider_cost_micros bigint,
  cost_source text check (cost_source is null or cost_source in ('real', 'estimated', 'unknown', 'free', 'byok')),
  latency_ms integer,
  ttft_ms integer,
  cache_hit boolean not null default false,
  stream boolean not null default false,
  data_class text,
  prompt_version text,
  detail jsonb not null default '{}'::jsonb
);

create index go_ai_requests_time on public.go_ai_requests (created_at desc, id desc);
create index go_ai_requests_org on public.go_ai_requests (org_id, created_at desc);
create index go_ai_requests_provider on public.go_ai_requests (provider, created_at desc);

create function public.go_ai_requests_immutable() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'log imutável';
end;
$$;

create trigger go_ai_requests_no_update before update on public.go_ai_requests
  for each row execute function public.go_ai_requests_immutable();
create trigger go_ai_requests_no_truncate before truncate on public.go_ai_requests
  for each statement execute function public.go_ai_requests_immutable();

alter table public.go_ai_requests enable row level security;
revoke all on table public.go_ai_requests from public, anon, authenticated, service_role;
grant select, insert, delete on table public.go_ai_requests to anon;

-- Painel do AI Gateway: totais desde uma data, no mesmo formato que ai-gateway/request-log.mjs (summarize) monta.
create or replace function public.go_ai_requests_summary(p_since timestamptz)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with rows as (select * from public.go_ai_requests r where r.created_at >= p_since),
  agg as (
    select jsonb_build_object(
      'requests', count(*), 'ok', count(*) filter (where status = 'ok'), 'failed', count(*) filter (where status <> 'ok'),
      'fallback', count(*) filter (where attempts > 1), 'cacheHits', count(*) filter (where cache_hit),
      'inputTokens', coalesce(sum(input_tokens), 0), 'outputTokens', coalesce(sum(output_tokens), 0), 'costMicros', coalesce(sum(cost_micros), 0),
      'freeRequests', count(*) filter (where tier = 'free'), 'paidRequests', count(*) filter (where tier = 'paid'), 'byokRequests', count(*) filter (where tier = 'byok'),
      'paidCostMicros', coalesce(sum(cost_micros) filter (where tier = 'paid'), 0),
      'latencySum', coalesce(sum(latency_ms) filter (where status = 'ok'), 0), 'latencyCount', count(latency_ms) filter (where status = 'ok'),
      'users', count(distinct user_id), 'orgs', count(distinct org_id), 'unknownCost', count(*) filter (where cost_source = 'unknown' and status = 'ok')
    ) as total from rows
  ),
  grouped as (
    select kind, key, jsonb_build_object('requests', count(*), 'ok', count(*) filter (where status = 'ok'), 'inputTokens', coalesce(sum(input_tokens), 0),
      'outputTokens', coalesce(sum(output_tokens), 0), 'costMicros', coalesce(sum(cost_micros), 0)) as value
    from (
      select 'byDay' as kind, to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as key, * from rows
      union all select 'byProvider', provider, * from rows where provider is not null
      union all select 'byFeature', feature, * from rows
    ) source
    group by kind, key
  )
  select jsonb_build_object(
    'since', p_since, 'total', (select total from agg),
    'byDay', coalesce((select jsonb_object_agg(key, value) from grouped where kind = 'byDay'), '{}'::jsonb),
    'byProvider', coalesce((select jsonb_object_agg(key, value) from grouped where kind = 'byProvider'), '{}'::jsonb),
    'byFeature', coalesce((select jsonb_object_agg(key, value) from grouped where kind = 'byFeature'), '{}'::jsonb)
  );
$$;

revoke all on function public.go_ai_requests_summary(timestamptz) from public, anon, authenticated;
grant execute on function public.go_ai_requests_summary(timestamptz) to anon;
