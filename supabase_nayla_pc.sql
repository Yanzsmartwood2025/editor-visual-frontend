-- Nayla PC: private per-user cloud computer configurations.
-- Applied to Supabase project naylacore on 2026-09-21.
-- Direct browser roles are intentionally denied; authenticated Next.js APIs use service_role.

create table if not exists public.nayla_pc_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null default 'Mi PC',
  os_family text not null default 'linux'
    check (os_family in ('linux','windows')),
  cpu integer not null default 2
    check (cpu between 1 and 64),
  ram_gb integer not null default 4
    check (ram_gb between 1 and 256),
  disk_gb integer not null default 80
    check (disk_gb between 25 and 2000),
  gpu_enabled boolean not null default false,
  min_gpu_vram_gb integer not null default 8
    check (min_gpu_vram_gb between 1 and 96),
  billing_mode text not null default 'hourly'
    check (billing_mode in ('hourly','monthly')),
  duration_hours integer not null default 1
    check (duration_hours between 1 and 24),
  auto_destroy boolean not null default true,
  status text not null default 'draft'
    check (status in ('draft','ready','provisioning','running','stopped','error','terminated')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

comment on table public.nayla_pc_profiles is
  'Server-managed per-user Nayla PC configurations. Provider identity and secrets are never exposed to clients.';

alter table public.nayla_pc_profiles enable row level security;

revoke all on table public.nayla_pc_profiles from anon, authenticated;
grant select, insert, update, delete on table public.nayla_pc_profiles to service_role;

create index if not exists nayla_pc_profiles_user_updated_idx
  on public.nayla_pc_profiles (user_id, updated_at desc);
