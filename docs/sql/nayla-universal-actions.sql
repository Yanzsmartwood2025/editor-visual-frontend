-- Nayla Universal Action Contract
-- Applied to Supabase project naylacore.
-- Server-only tables: RLS enabled; anon/authenticated access revoked.

create table if not exists public.nayla_action_plans (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  project_id uuid not null,
  module text not null,
  thread_key text not null,
  status text not null default 'pending'
    check (status in ('pending','executing','completed','failed','cancelled','expired')),
  summary text not null default '',
  source_message text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  confirmed_at timestamptz,
  executed_at timestamptz,
  foreign key (project_id, user_id)
    references public.editor_projects(id, user_id)
    on delete cascade
);

create table if not exists public.nayla_action_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.nayla_action_plans(id) on delete cascade,
  user_id text not null,
  project_id uuid not null,
  ordinal integer not null check (ordinal >= 0),
  action_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'planned'
    check (status in ('planned','executing','completed','failed','skipped','cancelled')),
  result jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  executed_at timestamptz,
  foreign key (project_id, user_id)
    references public.editor_projects(id, user_id)
    on delete cascade,
  unique (plan_id, ordinal)
);

alter table public.nayla_action_plans enable row level security;
alter table public.nayla_action_items enable row level security;

revoke all on public.nayla_action_plans, public.nayla_action_items from anon, authenticated;
grant select, insert, update, delete on public.nayla_action_plans, public.nayla_action_items to service_role;

create unique index if not exists nayla_action_plans_one_pending_per_thread_uidx
  on public.nayla_action_plans(user_id, project_id, module, thread_key)
  where status = 'pending';

create index if not exists nayla_action_plans_owner_status_idx
  on public.nayla_action_plans(user_id, project_id, module, status, created_at desc);

create index if not exists nayla_action_plans_project_owner_fk_idx
  on public.nayla_action_plans(project_id, user_id);

create index if not exists nayla_action_items_plan_idx
  on public.nayla_action_items(plan_id, ordinal);

create index if not exists nayla_action_items_project_owner_fk_idx
  on public.nayla_action_items(project_id, user_id);

alter table public.social_interactions
  add column if not exists response_state text not null default 'unanswered'
    check (response_state in ('unanswered','planned','responded','ignored'));

alter table public.social_interactions
  add column if not exists responded_at timestamptz;

alter table public.social_interactions
  add column if not exists response_text text;

alter table public.social_interactions
  add column if not exists response_source text
    check (
      response_source is null or
      response_source in ('manual','automation','nayla_command','provider_sync')
    );

create index if not exists social_interactions_response_idx
  on public.social_interactions(user_id, project_id, response_state, occurred_at desc);
