-- Nayla realtime diagnostics ledger.
-- Applied to the naylacore Supabase project on 2026-09-23.
-- These tables are intentionally service-role only: RLS is enabled and no
-- browser policies are defined. The admin dashboard reads them through
-- Firebase-authenticated Next.js API routes.

create table if not exists public.diagnostic_events (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('app','sentry','playwright','checkly','system')),
  service text not null,
  status text not null check (status in ('ok','info','degraded','error','recovered')),
  severity text not null default 'info' check (severity in ('info','warning','error')),
  title text not null,
  message text,
  external_url text,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists diagnostic_events_occurred_at_idx
  on public.diagnostic_events (occurred_at desc);
create index if not exists diagnostic_events_service_occurred_idx
  on public.diagnostic_events (service, occurred_at desc);

alter table public.diagnostic_events enable row level security;

create table if not exists public.diagnostic_status (
  service text primary key,
  source text not null check (source in ('app','sentry','playwright','checkly','system')),
  status text not null check (status in ('ok','info','degraded','error','recovered')),
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  last_event_id uuid references public.diagnostic_events(id) on delete set null,
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists diagnostic_status_last_event_idx
  on public.diagnostic_status(last_event_id);

alter table public.diagnostic_status enable row level security;

create table if not exists public.diagnostic_integrations (
  provider text primary key,
  secret_hash text not null,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.diagnostic_integrations enable row level security;

insert into public.diagnostic_status (service, source, status, summary, details)
values
  ('editor', 'app', 'ok', 'Editor operativo', '{"mode":"server"}'::jsonb),
  ('sentry', 'sentry', 'info', 'Esperando eventos', '{}'::jsonb),
  ('playwright', 'playwright', 'info', 'Esperando próxima ejecución', '{}'::jsonb),
  ('checkly', 'checkly', 'info', 'Esperando monitor', '{}'::jsonb)
on conflict (service) do nothing;
