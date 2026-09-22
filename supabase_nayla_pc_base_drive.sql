-- Nayla PC fast base image + persistent R2 drive.
-- Applied to Supabase project naylacore on 2026-09-22.

alter table public.nayla_pc_instances
  add column if not exists ready_at timestamptz,
  add column if not exists billable_started_at timestamptz,
  add column if not exists boot_deadline_at timestamptz;

create table if not exists public.nayla_pc_base_images (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'vultr',
  provider_snapshot_id text not null,
  os_family text not null check (os_family in ('linux','windows')),
  os_name text not null,
  version text not null,
  status text not null default 'building'
    check (status in ('building','available','retiring','retired','error')),
  provider_plan_id text not null,
  provider_region_id text not null,
  provider_os_id integer,
  min_disk_gb integer not null check (min_disk_gb > 0),
  min_ram_gb numeric(8,1) not null default 2 check (min_ram_gb > 0),
  desktop_stack text,
  snapshot_size_bytes bigint,
  storage_monthly_usd numeric(12,4),
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  retired_at timestamptz,
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

alter table public.nayla_pc_base_images enable row level security;
revoke all on table public.nayla_pc_base_images from anon, authenticated;
grant select, insert, update, delete on table public.nayla_pc_base_images to service_role;

create unique index if not exists nayla_pc_base_images_provider_snapshot_uidx
  on public.nayla_pc_base_images(provider_snapshot_id);
create unique index if not exists nayla_pc_base_images_one_available_linux_uidx
  on public.nayla_pc_base_images(os_family)
  where status='available';
create index if not exists nayla_pc_base_images_status_idx
  on public.nayla_pc_base_images(status, updated_at);

create table if not exists public.nayla_pc_drive_sessions (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.nayla_pc_instances(id) on delete cascade,
  user_id text not null,
  token_hash text not null,
  status text not null default 'active'
    check (status in ('active','revoked','expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_seen_at timestamptz
);

alter table public.nayla_pc_drive_sessions enable row level security;
revoke all on table public.nayla_pc_drive_sessions from anon, authenticated;
grant select, insert, update, delete on table public.nayla_pc_drive_sessions to service_role;

create unique index if not exists nayla_pc_drive_sessions_token_hash_uidx
  on public.nayla_pc_drive_sessions(token_hash);
create index if not exists nayla_pc_drive_sessions_instance_idx
  on public.nayla_pc_drive_sessions(instance_id, status);

create table if not exists public.nayla_pc_drive_files (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  relative_path text not null,
  r2_key text not null,
  content_type text,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  etag text,
  content_sha256 text,
  modified_at timestamptz,
  uploaded_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint nayla_pc_drive_files_path_check
    check (relative_path <> '' and relative_path not like '/%' and relative_path not like '%..%'),
  constraint nayla_pc_drive_files_r2_check
    check (r2_key like 'pc-drive/%')
);

alter table public.nayla_pc_drive_files enable row level security;
revoke all on table public.nayla_pc_drive_files from anon, authenticated;
grant select, insert, update, delete on table public.nayla_pc_drive_files to service_role;

create unique index if not exists nayla_pc_drive_files_user_path_uidx
  on public.nayla_pc_drive_files(user_id, relative_path)
  where deleted_at is null;
create unique index if not exists nayla_pc_drive_files_r2_key_uidx
  on public.nayla_pc_drive_files(r2_key);
create index if not exists nayla_pc_drive_files_user_updated_idx
  on public.nayla_pc_drive_files(user_id, updated_at desc)
  where deleted_at is null;
