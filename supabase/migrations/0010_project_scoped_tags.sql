-- Rescope tags from workspace-wide to project-wide. Existing rows are
-- test/dev data (confirmed with the user) - dropped and recreated rather
-- than backfilled, since a workspace-scoped tag has no project to assign to.
drop table if exists public.task_tags;
drop table if exists public.tags;

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now(),
  unique (project_id, name)
);

create table public.task_tags (
  task_id uuid not null references public.tasks (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (task_id, tag_id)
);

create index task_tags_tag_id_idx on public.task_tags (tag_id);

alter table public.tags enable row level security;
alter table public.task_tags enable row level security;

-- Same role thresholds as custom_fields (0006_advanced.sql) - the other
-- per-project configuration resource.
create policy tags_select on public.tags
  for select to authenticated using (public.can_access_project(project_id));

create policy tags_insert on public.tags
  for insert to authenticated
  with check (public.role_rank(public.project_role(project_id)) >= public.role_rank('editor'));

create policy tags_update on public.tags
  for update to authenticated
  using (public.role_rank(public.project_role(project_id)) >= public.role_rank('editor'));

create policy tags_delete on public.tags
  for delete to authenticated
  using (public.role_rank(public.project_role(project_id)) >= public.role_rank('editor'));

-- task_tags access follows the task's project (unchanged from the original
-- 0002_tags.sql version of these policies)
create policy task_tags_select on public.task_tags
  for select to authenticated using (
    exists (
      select 1 from public.tasks t
      where t.id = task_id and public.can_access_project(t.project_id)
    )
  );

create policy task_tags_insert on public.task_tags
  for insert to authenticated
  with check (
    exists (
      select 1 from public.tasks t
      where t.id = task_id
        and public.role_rank(public.project_role(t.project_id)) >= public.role_rank('editor')
    )
  );

create policy task_tags_delete on public.task_tags
  for delete to authenticated using (
    exists (
      select 1 from public.tasks t
      where t.id = task_id
        and public.role_rank(public.project_role(t.project_id)) >= public.role_rank('editor')
    )
  );
