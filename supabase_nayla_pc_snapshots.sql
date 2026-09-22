-- Nayla PC saved-machine snapshots.
-- Applied to Supabase project naylacore on 2026-09-21.

alter table public.nayla_pc_instances
  drop constraint if exists nayla_pc_instances_status_check;

alter table public.nayla_pc_instances
  add constraint nayla_pc_instances_status_check
  check (status in ('provisioning','running','stopped','rebooting','snapshotting','terminating','terminated','error'));

drop index if exists public.nayla_pc_instances_one_active_per_user_uidx;
create unique index nayla_pc_instances_one_active_per_user_uidx
  on public.nayla_pc_instances(user_id)
  where status in ('provisioning','running','stopped','rebooting','snapshotting','terminating');

create table if not exists public.nayla_pc_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  source_instance_id uuid references public.nayla_pc_instances(id) on delete set null,
  provider text not null default 'vultr',
  provider_snapshot_id text not null,
  description text not null,
  status text not null default 'pending'
    check (status in ('pending','available','restoring','deleting','deleted','error')),
  os_family text not null check (os_family in ('linux','windows')),
  os_name text,
  cpu integer not null check (cpu between 1 and 64),
  ram_gb numeric(8,1) not null check (ram_gb > 0 and ram_gb <= 256),
  disk_gb integer not null check (disk_gb between 25 and 2000),
  gpu_enabled boolean not null default false,
  gpu_name text,
  gpu_vram_gb numeric(8,1),
  provider_plan_id text not null,
  provider_region_id text not null,
  provider_os_id integer,
  size_bytes bigint,
  storage_monthly_usd numeric(12,4),
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

alter table public.nayla_pc_snapshots enable row level security;
revoke all on table public.nayla_pc_snapshots from anon, authenticated;
grant select, insert, update, delete on table public.nayla_pc_snapshots to service_role;

create unique index if not exists nayla_pc_snapshots_provider_uidx
  on public.nayla_pc_snapshots(provider_snapshot_id);

create index if not exists nayla_pc_snapshots_user_created_idx
  on public.nayla_pc_snapshots(user_id, created_at desc);

create index if not exists nayla_pc_snapshots_pending_idx
  on public.nayla_pc_snapshots(status, updated_at)
  where status in ('pending','deleting');

create index if not exists nayla_pc_snapshots_source_idx
  on public.nayla_pc_snapshots(source_instance_id)
  where source_instance_id is not null;

-- The existing pc lease sweep should also run while a snapshot is pending,
-- because it finalizes the snapshot first and destroys the source VM only
-- after Vultr confirms the disk image is ready.
