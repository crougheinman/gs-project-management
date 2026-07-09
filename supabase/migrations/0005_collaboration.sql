-- Phase 3: comments (+mentions), attachments, activity log, notifications.
-- Grants covered by 0001's ALTER DEFAULT PRIVILEGES.

-- ============================================================================
-- Tables
-- ============================================================================

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index comments_task_id_created_at_idx on public.comments (task_id, created_at);

create trigger comments_set_updated_at
  before update on public.comments
  for each row execute function public.set_updated_at();

create table public.comment_mentions (
  comment_id uuid not null references public.comments (id) on delete cascade,
  mentioned_user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (comment_id, mentioned_user_id)
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks (id) on delete cascade,
  comment_id uuid references public.comments (id) on delete cascade,
  uploaded_by uuid references public.profiles (id),
  storage_path text not null,
  file_name text not null,
  file_size bigint,
  mime_type text,
  created_at timestamptz not null default now(),
  check (task_id is not null or comment_id is not null)
);

create index attachments_task_id_idx on public.attachments (task_id);

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  actor_id uuid references public.profiles (id),
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index activity_log_project_created_idx on public.activity_log (project_id, created_at desc);
create index activity_log_task_idx on public.activity_log (task_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id),
  type text not null check (type in ('assigned', 'mentioned', 'comment_added', 'added_to_project')),
  project_id uuid references public.projects (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  comment_id uuid references public.comments (id) on delete cascade,
  message text not null,
  read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_recipient_idx on public.notifications (recipient_id, read, created_at desc);

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.comments enable row level security;
alter table public.comment_mentions enable row level security;
alter table public.attachments enable row level security;
alter table public.activity_log enable row level security;
alter table public.notifications enable row level security;

-- comments: read follows the task's project; commenter+ writes own comments
create policy comments_select on public.comments
  for select to authenticated using (
    exists (
      select 1 from public.tasks t
      where t.id = task_id and public.can_access_project(t.project_id)
    )
  );

create policy comments_insert on public.comments
  for insert to authenticated with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.tasks t
      where t.id = task_id
        and public.role_rank(public.project_role(t.project_id)) >= public.role_rank('commenter')
    )
  );

create policy comments_update_own on public.comments
  for update to authenticated using (author_id = auth.uid());

create policy comments_delete_own on public.comments
  for delete to authenticated using (author_id = auth.uid());

-- comment_mentions: written by the comment author, readable with the comment
create policy comment_mentions_select on public.comment_mentions
  for select to authenticated using (
    exists (
      select 1 from public.comments c
      join public.tasks t on t.id = c.task_id
      where c.id = comment_id and public.can_access_project(t.project_id)
    )
  );

create policy comment_mentions_insert on public.comment_mentions
  for insert to authenticated with check (
    exists (
      select 1 from public.comments c
      where c.id = comment_id and c.author_id = auth.uid()
    )
  );

-- attachments
create policy attachments_select on public.attachments
  for select to authenticated using (
    task_id is null or exists (
      select 1 from public.tasks t
      where t.id = task_id and public.can_access_project(t.project_id)
    )
  );

create policy attachments_insert on public.attachments
  for insert to authenticated with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.tasks t
      where t.id = task_id
        and public.role_rank(public.project_role(t.project_id)) >= public.role_rank('commenter')
    )
  );

create policy attachments_delete on public.attachments
  for delete to authenticated using (uploaded_by = auth.uid());

-- activity_log: readable within the project; app inserts as the acting user
create policy activity_select on public.activity_log
  for select to authenticated using (
    project_id is not null and public.can_access_project(project_id)
  );

create policy activity_insert on public.activity_log
  for insert to authenticated with check (
    actor_id = auth.uid()
    and project_id is not null
    and public.can_access_project(project_id)
  );

-- notifications: recipients read/update their own; any project member may
-- create a notification for someone else (actor stamped as themselves)
create policy notifications_select_own on public.notifications
  for select to authenticated using (recipient_id = auth.uid());

create policy notifications_update_own on public.notifications
  for update to authenticated using (recipient_id = auth.uid());

create policy notifications_insert on public.notifications
  for insert to authenticated with check (
    actor_id = auth.uid()
    and project_id is not null
    and public.can_access_project(project_id)
  );

-- ============================================================================
-- Realtime
-- ============================================================================

alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.notifications;
alter table public.comments replica identity full;

-- ============================================================================
-- Storage: private 'attachments' bucket, path = {project_id}/{task_id}/{file}
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

create policy attachments_storage_select on storage.objects
  for select to authenticated using (
    bucket_id = 'attachments'
    and public.can_access_project(((storage.foldername(name))[1])::uuid)
  );

create policy attachments_storage_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'attachments'
    and public.role_rank(public.project_role(((storage.foldername(name))[1])::uuid))
      >= public.role_rank('commenter')
  );

create policy attachments_storage_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'attachments' and owner_id = (auth.uid())::text
  );
