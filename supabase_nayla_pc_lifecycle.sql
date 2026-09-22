-- Nayla PC lifecycle: real cloud instances + server-side hourly lease sweeper.
-- Applied to Supabase project naylacore on 2026-09-21.
-- Browser roles are intentionally denied. Next.js server APIs use service_role.

create table if not exists public.nayla_pc_instances (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  profile_id uuid references public.nayla_pc_profiles(id) on delete set null,
  provider text not null default 'vultr',
  provider_instance_id text,
  provider_plan_id text not null,
  provider_region_id text not null,
  provider_os_id integer not null,
  os_family text not null check (os_family in ('linux','windows')),
  cpu integer not null check (cpu between 1 and 64),
  ram_gb numeric(8,1) not null check (ram_gb > 0 and ram_gb <= 256),
  disk_gb integer not null check (disk_gb between 25 and 2000),
  gpu_enabled boolean not null default false,
  gpu_name text,
  gpu_vram_gb numeric(8,1),
  billing_mode text not null check (billing_mode in ('hourly','monthly')),
  duration_hours integer not null check (duration_hours between 1 and 24),
  auto_destroy boolean not null default false,
  status text not null default 'provisioning'
    check (status in ('provisioning','running','stopped','rebooting','terminating','terminated','error')),
  main_ip text,
  public_hourly_price numeric(12,4) not null check (public_hourly_price >= 0),
  public_monthly_price numeric(12,4) not null check (public_monthly_price >= 0),
  public_session_price numeric(12,4) not null check (public_session_price >= 0),
  provider_monthly_cost numeric(12,4) not null check (provider_monthly_cost >= 0),
  expires_at timestamptz,
  last_synced_at timestamptz,
  terminated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.nayla_pc_instances is
  'Server-managed Nayla PC instances. Provider identifiers and internal costs never leave authenticated server APIs.';

alter table public.nayla_pc_instances enable row level security;
revoke all on table public.nayla_pc_instances from anon, authenticated;
grant select, insert, update, delete on table public.nayla_pc_instances to service_role;

create unique index if not exists nayla_pc_instances_provider_instance_uidx
  on public.nayla_pc_instances(provider_instance_id)
  where provider_instance_id is not null;

create unique index if not exists nayla_pc_instances_one_active_per_user_uidx
  on public.nayla_pc_instances(user_id)
  where status in ('provisioning','running','stopped','rebooting','terminating');

create index if not exists nayla_pc_instances_user_created_idx
  on public.nayla_pc_instances(user_id, created_at desc);

create index if not exists nayla_pc_instances_profile_id_idx
  on public.nayla_pc_instances(profile_id)
  where profile_id is not null;

create index if not exists nayla_pc_instances_expiry_idx
  on public.nayla_pc_instances(expires_at)
  where auto_destroy = true
    and status in ('provisioning','running','stopped','rebooting');

create table if not exists public.nayla_internal_secrets (
  name text primary key,
  secret_value text not null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

comment on table public.nayla_internal_secrets is
  'Server-only internal tokens for backend-to-backend jobs. Never expose to browser roles.';

alter table public.nayla_internal_secrets enable row level security;
revoke all on table public.nayla_internal_secrets from anon, authenticated;
grant select, insert, update, delete on table public.nayla_internal_secrets to service_role;

insert into public.nayla_internal_secrets(name, secret_value)
values ('pc_lease_sweep', encode(gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

-- pg_cron and pg_net are enabled in naylacore.
-- Activate this job only after /api/internal/pc-lease-sweep is deployed.
select cron.schedule(
  'nayla-pc-lease-sweep-v1',
  '30 seconds',
  $job$
    select net.http_post(
      url := 'https://editor-visual-frontend-cauc.vercel.app/api/internal/pc-lease-sweep',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-nayla-cron-token',
        (select secret_value from public.nayla_internal_secrets where name = 'pc_lease_sweep')
      ),
      body := jsonb_build_object('source', 'supabase_cron', 'time', now()),
      timeout_milliseconds := 30000
    ) as request_id
    where exists (
      select 1
      from public.nayla_pc_instances
      where auto_destroy = true
        and expires_at <= now()
        and provider_instance_id is not null
        and status in ('provisioning','running','stopped','rebooting','terminating')
    );
  $job$
);
