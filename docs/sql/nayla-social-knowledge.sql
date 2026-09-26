-- Nayla Social Knowledge / Fuentes
-- Applied to naylacore on 2026-09-26.
-- Server-only tables: browser roles are revoked; access goes through authenticated Next.js APIs.

create table if not exists public.social_source_connections (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  project_id uuid not null,
  provider text not null check (provider in ('google_drive')),
  status text not null default 'connected' check (status in ('connected','reauth','disconnected','error')),
  provider_user_id text,
  email text,
  display_name text,
  scopes text[] not null default '{}'::text[],
  refresh_token_ciphertext text,
  refresh_token_iv text,
  refresh_token_tag text,
  last_sync_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, project_id, provider)
);

create table if not exists public.social_source_items (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.social_source_connections(id) on delete cascade,
  user_id text not null,
  project_id uuid not null,
  provider text not null default 'google_drive' check (provider in ('google_drive')),
  provider_item_id text not null,
  item_kind text not null default 'file' check (item_kind in ('file','folder')),
  name text not null,
  mime_type text,
  web_url text,
  selected boolean not null default true,
  source_modified_at timestamptz,
  content_fingerprint text,
  last_synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(connection_id, provider_item_id)
);

create table if not exists public.social_program_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  project_id uuid not null,
  source_item_id uuid references public.social_source_items(id) on delete set null,
  source_version text not null,
  program_date date,
  program_name text,
  character_name text,
  channel_name text,
  language text not null default 'es',
  theme text,
  song text,
  summary text not null,
  key_points jsonb not null default '[]'::jsonb,
  base_hashtags jsonb not null default '[]'::jsonb,
  publication_notes jsonb not null default '{}'::jsonb,
  source_modified_at timestamptz,
  status text not null default 'current' check (status in ('current','superseded','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_item_id, source_version)
);

create table if not exists public.social_publication_packages (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  project_id uuid not null,
  program_id uuid not null references public.social_program_summaries(id) on delete cascade,
  platform text not null,
  language text not null default 'es',
  title text,
  caption text not null default '',
  hashtags text[] not null default '{}'::text[],
  status text not null default 'draft' check (status in ('draft','approved','published','superseded')),
  generated_at timestamptz not null default now(),
  approved_at timestamptz,
  published_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(program_id, platform, language)
);

create index if not exists social_source_connections_owner_idx
  on public.social_source_connections(user_id, project_id, provider);
create index if not exists social_source_items_owner_selected_idx
  on public.social_source_items(user_id, project_id, selected, source_modified_at desc);
create index if not exists social_program_summaries_owner_date_idx
  on public.social_program_summaries(user_id, project_id, program_date desc, created_at desc);
create index if not exists social_publication_packages_owner_idx
  on public.social_publication_packages(user_id, project_id, platform, status);

alter table public.social_source_connections enable row level security;
alter table public.social_source_items enable row level security;
alter table public.social_program_summaries enable row level security;
alter table public.social_publication_packages enable row level security;

revoke all on public.social_source_connections from anon, authenticated;
revoke all on public.social_source_items from anon, authenticated;
revoke all on public.social_program_summaries from anon, authenticated;
revoke all on public.social_publication_packages from anon, authenticated;

grant select, insert, update, delete on public.social_source_connections to service_role;
grant select, insert, update, delete on public.social_source_items to service_role;
grant select, insert, update, delete on public.social_program_summaries to service_role;
grant select, insert, update, delete on public.social_publication_packages to service_role;
