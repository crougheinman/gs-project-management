-- Phase 0: core schema (profiles, workspaces, projects, sections, tasks) + RLS.
create extension if not exists pgcrypto;

-- ============================================================================
-- Tables
-- ============================================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('admin', 'member', 'guest')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index workspace_members_user_id_idx on public.workspace_members (user_id);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  description text,
  color text,
  icon text,
  visibility text not null default 'workspace' check (visibility in ('workspace', 'private')),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_workspace_id_idx on public.projects (workspace_id);

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'editor' check (role in ('admin', 'editor', 'commenter', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index project_members_user_id_idx on public.project_members (user_id);

create table public.sections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  position double precision not null default 1000,
  created_at timestamptz not null default now()
);

create index sections_project_id_idx on public.sections (project_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  parent_task_id uuid references public.tasks (id) on delete cascade,
  section_id uuid references public.sections (id) on delete set null,
  assignee_id uuid references public.profiles (id) on delete set null,
  name text not null,
  description jsonb,
  completed boolean not null default false,
  completed_at timestamptz,
  completed_by uuid references public.profiles (id),
  due_date date,
  start_date date,
  position double precision not null default 1000,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_project_id_idx on public.tasks (project_id);
create index tasks_parent_task_id_idx on public.tasks (parent_task_id);
create index tasks_section_id_position_idx on public.tasks (section_id, position);
create index tasks_assignee_id_idx on public.tasks (assignee_id);
create index tasks_due_date_idx on public.tasks (due_date) where completed = false;

-- ============================================================================
-- updated_at maintenance
-- ============================================================================

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ============================================================================
-- New user bootstrap: create profile, join invited workspace, or become
-- admin of a freshly created default workspace if none exists yet.
-- ============================================================================

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_role text;
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  );

  v_workspace_id := nullif(new.raw_user_meta_data ->> 'workspace_id', '')::uuid;
  v_role := new.raw_user_meta_data ->> 'workspace_role';

  if v_workspace_id is not null then
    insert into public.workspace_members (workspace_id, user_id, role)
    values (v_workspace_id, new.id, coalesce(v_role, 'member'));
  elsif not exists (select 1 from public.workspaces) then
    insert into public.workspaces (name, slug, created_by)
    values ('Workspace', 'workspace', new.id)
    returning id into v_workspace_id;

    insert into public.workspace_members (workspace_id, user_id, role)
    values (v_workspace_id, new.id, 'admin');
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- RLS helper functions (SECURITY DEFINER to avoid recursive-policy issues)
-- ============================================================================

create function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = auth.uid()
  );
$$;

create function public.workspace_role(p_workspace_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.workspace_members
  where workspace_id = p_workspace_id and user_id = auth.uid();
$$;

create function public.role_rank(p_role text)
returns int
language sql
immutable
as $$
  select case p_role
    when 'viewer' then 1
    when 'commenter' then 2
    when 'editor' then 3
    when 'admin' then 4
    else 0
  end;
$$;

create function public.can_access_project(p_project_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_visibility text;
  v_workspace_role text;
begin
  select workspace_id, visibility into v_workspace_id, v_visibility
  from public.projects where id = p_project_id;

  if v_workspace_id is null then
    return false;
  end if;

  if exists (
    select 1 from public.project_members
    where project_id = p_project_id and user_id = auth.uid()
  ) then
    return true;
  end if;

  v_workspace_role := public.workspace_role(v_workspace_id);

  if v_workspace_role is null or v_workspace_role = 'guest' then
    return false;
  end if;

  return v_visibility = 'workspace';
end;
$$;

-- Effective project role: explicit project_members row wins; otherwise a
-- non-guest workspace member gets an implicit 'editor' on workspace-visible
-- projects; everyone else gets null (no access).
create function public.project_role(p_project_id uuid)
returns text
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_role text;
  v_workspace_id uuid;
  v_visibility text;
  v_workspace_role text;
begin
  select role into v_role
  from public.project_members
  where project_id = p_project_id and user_id = auth.uid();

  if v_role is not null then
    return v_role;
  end if;

  select workspace_id, visibility into v_workspace_id, v_visibility
  from public.projects where id = p_project_id;

  v_workspace_role := public.workspace_role(v_workspace_id);

  if v_workspace_role is not null and v_workspace_role <> 'guest' and v_visibility = 'workspace' then
    return 'editor';
  end if;

  return null;
end;
$$;

-- ============================================================================
-- Grants (RLS policies only apply to roles that already hold the underlying
-- table privilege - without this, PostgREST/postgres denies before RLS even
-- runs). `anon` gets nothing; every table here requires an authenticated
-- session. Applies to future tables too, so later migrations don't need it.
-- ============================================================================

grant usage on schema public to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

grant select, insert, update, delete on
  public.profiles,
  public.workspaces,
  public.workspace_members,
  public.projects,
  public.project_members,
  public.sections,
  public.tasks
to authenticated;

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.sections enable row level security;
alter table public.tasks enable row level security;

-- profiles: readable by any authenticated user (names/avatars needed for
-- assignee pickers, mentions, etc.); each user manages only their own row.
create policy profiles_select on public.profiles
  for select to authenticated using (true);

create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid());

-- workspaces
create policy workspaces_select on public.workspaces
  for select to authenticated using (public.is_workspace_member(id));

create policy workspaces_update_admin on public.workspaces
  for update to authenticated using (public.workspace_role(id) = 'admin');

-- workspace_members
create policy workspace_members_select on public.workspace_members
  for select to authenticated using (public.is_workspace_member(workspace_id));

create policy workspace_members_insert_admin on public.workspace_members
  for insert to authenticated with check (public.workspace_role(workspace_id) = 'admin');

create policy workspace_members_update_admin on public.workspace_members
  for update to authenticated using (public.workspace_role(workspace_id) = 'admin');

create policy workspace_members_delete_admin on public.workspace_members
  for delete to authenticated using (public.workspace_role(workspace_id) = 'admin');

-- projects
create policy projects_select on public.projects
  for select to authenticated using (public.can_access_project(id));

create policy projects_insert on public.projects
  for insert to authenticated
  with check (
    public.is_workspace_member(workspace_id)
    and public.workspace_role(workspace_id) <> 'guest'
  );

create policy projects_update on public.projects
  for update to authenticated using (public.role_rank(public.project_role(id)) >= public.role_rank('admin'));

create policy projects_delete on public.projects
  for delete to authenticated using (public.role_rank(public.project_role(id)) >= public.role_rank('admin'));

-- project_members
create policy project_members_select on public.project_members
  for select to authenticated using (public.can_access_project(project_id));

create policy project_members_insert on public.project_members
  for insert to authenticated
  with check (public.role_rank(public.project_role(project_id)) >= public.role_rank('admin'));

create policy project_members_update on public.project_members
  for update to authenticated using (public.role_rank(public.project_role(project_id)) >= public.role_rank('admin'));

create policy project_members_delete on public.project_members
  for delete to authenticated using (public.role_rank(public.project_role(project_id)) >= public.role_rank('admin'));

-- sections
create policy sections_select on public.sections
  for select to authenticated using (public.can_access_project(project_id));

create policy sections_insert on public.sections
  for insert to authenticated
  with check (public.role_rank(public.project_role(project_id)) >= public.role_rank('editor'));

create policy sections_update on public.sections
  for update to authenticated using (public.role_rank(public.project_role(project_id)) >= public.role_rank('editor'));

create policy sections_delete on public.sections
  for delete to authenticated using (public.role_rank(public.project_role(project_id)) >= public.role_rank('editor'));

-- tasks
create policy tasks_select on public.tasks
  for select to authenticated using (public.can_access_project(project_id));

create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (public.role_rank(public.project_role(project_id)) >= public.role_rank('editor'));

create policy tasks_update on public.tasks
  for update to authenticated using (public.role_rank(public.project_role(project_id)) >= public.role_rank('editor'));

create policy tasks_delete on public.tasks
  for delete to authenticated using (public.role_rank(public.project_role(project_id)) >= public.role_rank('editor'));
