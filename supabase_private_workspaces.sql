-- Private multi-project / multi-chat foundation for Nayla.
-- Firebase remains the identity provider. All browser access goes through authenticated Next.js APIs.

create table if not exists public.editor_projects (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null default 'Nuevo proyecto',
  status text not null default 'active' check (status in ('active','archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create index if not exists editor_projects_user_idx
  on public.editor_projects(user_id, updated_at desc);

create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  project_id uuid not null,
  title text not null default 'Nuevo chat',
  status text not null default 'active' check (status in ('active','archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (id, project_id, user_id),
  constraint chat_threads_project_owner_fkey
    foreign key (project_id, user_id)
    references public.editor_projects(id, user_id)
    on delete cascade
);

create index if not exists chat_threads_owner_project_idx
  on public.chat_threads(user_id, project_id, updated_at desc);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  project_id uuid not null,
  thread_id uuid not null,
  role text not null check (role in ('user','assistant','system','tool')),
  content text not null default '',
  action jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  constraint chat_messages_thread_owner_fkey
    foreign key (thread_id, project_id, user_id)
    references public.chat_threads(id, project_id, user_id)
    on delete cascade
);

create index if not exists chat_messages_thread_idx
  on public.chat_messages(user_id, thread_id, created_at asc);

alter table public.galeria_multimedia
  add column if not exists project_id uuid,
  add column if not exists thread_id uuid,
  add column if not exists r2_key text,
  add column if not exists privacy text not null default 'private';

create unique index if not exists galeria_multimedia_id_user_uidx
  on public.galeria_multimedia(id, user_id);

create index if not exists galeria_multimedia_owner_project_idx
  on public.galeria_multimedia(user_id, project_id, creado_en desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'galeria_project_owner_fkey'
  ) then
    alter table public.galeria_multimedia
      add constraint galeria_project_owner_fkey
      foreign key (project_id, user_id)
      references public.editor_projects(id, user_id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'galeria_thread_owner_fkey'
  ) then
    alter table public.galeria_multimedia
      add constraint galeria_thread_owner_fkey
      foreign key (thread_id, project_id, user_id)
      references public.chat_threads(id, project_id, user_id)
      on delete set null;
  end if;
end $$;

create table if not exists public.chat_message_media (
  message_id uuid not null,
  user_id text not null,
  media_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (message_id, media_id),
  constraint chat_message_media_message_owner_fkey
    foreign key (message_id, user_id)
    references public.chat_messages(id, user_id)
    on delete cascade,
  constraint chat_message_media_asset_owner_fkey
    foreign key (media_id, user_id)
    references public.galeria_multimedia(id, user_id)
    on delete cascade
);

create index if not exists chat_message_media_owner_idx
  on public.chat_message_media(user_id, message_id);

alter table public.gpu_jobs
  add column if not exists project_id uuid,
  add column if not exists thread_id uuid;

create index if not exists gpu_jobs_owner_project_idx
  on public.gpu_jobs(user_id, project_id, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'gpu_jobs_project_owner_fkey'
  ) then
    alter table public.gpu_jobs
      add constraint gpu_jobs_project_owner_fkey
      foreign key (project_id, user_id)
      references public.editor_projects(id, user_id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'gpu_jobs_thread_owner_fkey'
  ) then
    alter table public.gpu_jobs
      add constraint gpu_jobs_thread_owner_fkey
      foreign key (thread_id, project_id, user_id)
      references public.chat_threads(id, project_id, user_id)
      on delete set null;
  end if;
end $$;

alter table public.render_requests
  add column if not exists project_id uuid,
  add column if not exists thread_id uuid;

create index if not exists render_requests_owner_project_idx
  on public.render_requests(user_id, project_id, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'render_requests_project_owner_fkey'
  ) then
    alter table public.render_requests
      add constraint render_requests_project_owner_fkey
      foreign key (project_id, user_id)
      references public.editor_projects(id, user_id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'render_requests_thread_owner_fkey'
  ) then
    alter table public.render_requests
      add constraint render_requests_thread_owner_fkey
      foreign key (thread_id, project_id, user_id)
      references public.chat_threads(id, project_id, user_id)
      on delete set null;
  end if;
end $$;

alter table public.memoria_nayla
  add column if not exists project_id uuid,
  add column if not exists thread_id uuid,
  add column if not exists r2_key text;

create index if not exists memoria_nayla_owner_project_idx
  on public.memoria_nayla(user_id, project_id, creado_en desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'memoria_project_owner_fkey'
  ) then
    alter table public.memoria_nayla
      add constraint memoria_project_owner_fkey
      foreign key (project_id, user_id)
      references public.editor_projects(id, user_id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'memoria_thread_owner_fkey'
  ) then
    alter table public.memoria_nayla
      add constraint memoria_thread_owner_fkey
      foreign key (thread_id, project_id, user_id)
      references public.chat_threads(id, project_id, user_id)
      on delete set null;
  end if;
end $$;

create table if not exists public.media_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  project_id uuid,
  thread_id uuid,
  domain text not null check (domain in ('image','video','audio','3d','gpu')),
  capability text not null,
  provider text not null,
  status text not null default 'planned'
    check (status in ('planned','awaiting_confirmation','queued','running','completed','failed','cancelled')),
  input jsonb not null default '{}'::jsonb,
  output_gallery_item_id uuid,
  provider_job_id text,
  estimated_cost numeric,
  actual_cost numeric,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, user_id),
  constraint media_jobs_project_owner_fkey
    foreign key (project_id, user_id)
    references public.editor_projects(id, user_id)
    on delete set null,
  constraint media_jobs_thread_owner_fkey
    foreign key (thread_id, project_id, user_id)
    references public.chat_threads(id, project_id, user_id)
    on delete set null,
  constraint media_jobs_output_owner_fkey
    foreign key (output_gallery_item_id, user_id)
    references public.galeria_multimedia(id, user_id)
    on delete set null
);

create index if not exists media_jobs_owner_project_idx
  on public.media_jobs(user_id, project_id, created_at desc);
create index if not exists media_jobs_status_idx
  on public.media_jobs(status, created_at asc);

alter table public.editor_projects enable row level security;
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_message_media enable row level security;
alter table public.media_jobs enable row level security;

revoke all on public.editor_projects from anon, authenticated;
revoke all on public.chat_threads from anon, authenticated;
revoke all on public.chat_messages from anon, authenticated;
revoke all on public.chat_message_media from anon, authenticated;
revoke all on public.media_jobs from anon, authenticated;

grant all on public.editor_projects to service_role;
grant all on public.chat_threads to service_role;
grant all on public.chat_messages to service_role;
grant all on public.chat_message_media to service_role;
grant all on public.media_jobs to service_role;

create policy "service role manages editor projects"
  on public.editor_projects for all to service_role using (true) with check (true);
create policy "service role manages chat threads"
  on public.chat_threads for all to service_role using (true) with check (true);
create policy "service role manages chat messages"
  on public.chat_messages for all to service_role using (true) with check (true);
create policy "service role manages chat media links"
  on public.chat_message_media for all to service_role using (true) with check (true);
create policy "service role manages media jobs"
  on public.media_jobs for all to service_role using (true) with check (true);

-- Preserve existing user media by assigning each existing owner a private default project.
insert into public.editor_projects (user_id, name, metadata)
select distinct user_id, 'Proyecto principal', '{"system":"legacy-default"}'::jsonb
from (
  select user_id from public.galeria_multimedia
  union
  select user_id from public.gpu_jobs
  union
  select user_id from public.render_requests
  union
  select user_id from public.memoria_nayla
  union
  select user_id from public.proyectos_usuario
) owners
where user_id is not null and user_id <> '';

update public.galeria_multimedia g
set project_id = p.id
from public.editor_projects p
where g.project_id is null
  and p.user_id = g.user_id
  and p.metadata->>'system' = 'legacy-default';

update public.gpu_jobs j
set project_id = p.id
from public.editor_projects p
where j.project_id is null
  and p.user_id = j.user_id
  and p.metadata->>'system' = 'legacy-default';

update public.render_requests r
set project_id = p.id
from public.editor_projects p
where r.project_id is null
  and p.user_id = r.user_id
  and p.metadata->>'system' = 'legacy-default';

update public.memoria_nayla m
set project_id = p.id
from public.editor_projects p
where m.project_id is null
  and p.user_id = m.user_id
  and p.metadata->>'system' = 'legacy-default';

comment on table public.editor_projects is 'Private Nayla editor workspaces owned by Firebase users.';
comment on table public.chat_threads is 'Project-scoped private Nayla conversations.';
comment on table public.chat_messages is 'Persisted private chat history; attachments are linked separately.';
comment on table public.chat_message_media is 'Ownership-safe links between chat messages and private gallery assets.';
comment on table public.media_jobs is 'Provider-independent ledger for image/video/audio/3D/GPU jobs.';
comment on column public.galeria_multimedia.r2_key is 'Private Cloudflare R2 object key. Prefer short-lived signed GET URLs over permanent public URLs.';


-- Performance indexes for ownership-preserving foreign keys.
create index if not exists chat_message_media_asset_owner_idx on public.chat_message_media(media_id, user_id);
create index if not exists chat_message_media_message_owner_idx on public.chat_message_media(message_id, user_id);
create index if not exists chat_messages_thread_owner_idx on public.chat_messages(thread_id, project_id, user_id);
create index if not exists chat_threads_project_owner_idx on public.chat_threads(project_id, user_id);
create index if not exists galeria_project_owner_fk_idx on public.galeria_multimedia(project_id, user_id);
create index if not exists galeria_thread_owner_fk_idx on public.galeria_multimedia(thread_id, project_id, user_id);
create index if not exists gpu_jobs_project_owner_fk_idx on public.gpu_jobs(project_id, user_id);
create index if not exists gpu_jobs_thread_owner_fk_idx on public.gpu_jobs(thread_id, project_id, user_id);
create index if not exists media_jobs_output_owner_idx on public.media_jobs(output_gallery_item_id, user_id);
create index if not exists media_jobs_project_owner_fk_idx on public.media_jobs(project_id, user_id);
create index if not exists media_jobs_thread_owner_fk_idx on public.media_jobs(thread_id, project_id, user_id);
create index if not exists memoria_project_owner_fk_idx on public.memoria_nayla(project_id, user_id);
create index if not exists memoria_thread_owner_fk_idx on public.memoria_nayla(thread_id, project_id, user_id);
create index if not exists render_requests_project_owner_fk_idx on public.render_requests(project_id, user_id);
create index if not exists render_requests_thread_owner_fk_idx on public.render_requests(thread_id, project_id, user_id);

-- Each editor project owns its own timeline. Render outputs keep their private R2 key.
alter table public.editor_projects
  add column if not exists linea_de_tiempo jsonb not null default '[]'::jsonb;

alter table public.render_requests
  add column if not exists r2_key text;

comment on column public.editor_projects.linea_de_tiempo is
  'Project-scoped Remotion/editor timeline. Each project owns an independent timeline.';
comment on column public.render_requests.r2_key is
  'Private Cloudflare R2 object key for the rendered output.';
