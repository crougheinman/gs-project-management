-- Phase 4: custom fields, task dependencies, full-text search.
-- Grants covered by 0001's ALTER DEFAULT PRIVILEGES.

-- ============================================================================
-- Custom fields
-- ============================================================================

create table public.custom_fields (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  field_type text not null check (
    field_type in ('text', 'number', 'single_select', 'multi_select', 'date', 'checkbox', 'person')
  ),
  options jsonb not null default '[]'::jsonb, -- [{id,label,color}] for select types
  position double precision not null default 1000,
  created_at timestamptz not null default now()
);

create index custom_fields_project_id_idx on public.custom_fields (project_id, position);

create table public.custom_field_values (
  id uuid primary key default gen_random_uuid(),
  custom_field_id uuid not null references public.custom_fields (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  value_text text,
  value_number double precision,
  value_date date,
  value_boolean boolean,
  value_option_ids jsonb, -- array of option ids for select types
  value_user_id uuid references public.profiles (id),
  unique (custom_field_id, task_id)
);

create index custom_field_values_task_id_idx on public.custom_field_values (task_id);

-- ============================================================================
-- Task dependencies (task_id is blocked by depends_on_task_id)
-- ============================================================================

create table public.task_dependencies (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  depends_on_task_id uuid not null references public.tasks (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id)
);

create index task_dependencies_task_id_idx on public.task_dependencies (task_id);
create index task_dependencies_depends_on_idx on public.task_dependencies (depends_on_task_id);

-- ============================================================================
-- Full-text search on task names
-- ============================================================================

alter table public.tasks
  add column search_vector tsvector
  generated always as (to_tsvector('english', coalesce(name, ''))) stored;

create index tasks_search_vector_idx on public.tasks using gin (search_vector);

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.custom_fields enable row level security;
alter table public.custom_field_values enable row level security;
alter table public.task_dependencies enable row level security;

-- custom_fields: read within project, editor+ writes
create policy custom_fields_select on public.custom_fields
  for select to authenticated using (public.can_access_project(project_id));

create policy custom_fields_insert on public.custom_fields
  for insert to authenticated
  with check (public.role_rank(public.project_role(project_id)) >= public.role_rank('editor'));

create policy custom_fields_update on public.custom_fields
  for update to authenticated
  using (public.role_rank(public.project_role(project_id)) >= public.role_rank('editor'));

create policy custom_fields_delete on public.custom_fields
  for delete to authenticated
  using (public.role_rank(public.project_role(project_id)) >= public.role_rank('editor'));

-- custom_field_values: follow the field's project
create policy custom_field_values_select on public.custom_field_values
  for select to authenticated using (
    exists (
      select 1 from public.custom_fields cf
      where cf.id = custom_field_id and public.can_access_project(cf.project_id)
    )
  );

create policy custom_field_values_write on public.custom_field_values
  for all to authenticated
  using (
    exists (
      select 1 from public.custom_fields cf
      where cf.id = custom_field_id
        and public.role_rank(public.project_role(cf.project_id)) >= public.role_rank('editor')
    )
  )
  with check (
    exists (
      select 1 from public.custom_fields cf
      where cf.id = custom_field_id
        and public.role_rank(public.project_role(cf.project_id)) >= public.role_rank('editor')
    )
  );

-- task_dependencies: both tasks must be in the same accessible project
create policy task_dependencies_select on public.task_dependencies
  for select to authenticated using (
    exists (
      select 1 from public.tasks t
      where t.id = task_id and public.can_access_project(t.project_id)
    )
  );

create policy task_dependencies_insert on public.task_dependencies
  for insert to authenticated with check (
    exists (
      select 1 from public.tasks t
      where t.id = task_id
        and public.role_rank(public.project_role(t.project_id)) >= public.role_rank('editor')
    )
  );

create policy task_dependencies_delete on public.task_dependencies
  for delete to authenticated using (
    exists (
      select 1 from public.tasks t
      where t.id = task_id
        and public.role_rank(public.project_role(t.project_id)) >= public.role_rank('editor')
    )
  );
