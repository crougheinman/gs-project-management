-- profiles.id cascades from auth.users on delete, but attribution columns
-- (created_by/actor_id/uploaded_by/value_user_id) had no on-delete action,
-- so Postgres blocked the profile row's delete with a FK violation - which
-- surfaces as "Database error deleting user" from the Auth admin API.
-- These columns are "who did this", not membership - a deleted user's
-- workspaces/projects/tasks/etc. should survive with an unknown attributor,
-- same as tasks.assignee_id already does.

alter table public.workspaces drop constraint workspaces_created_by_fkey;
alter table public.workspaces add constraint workspaces_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;

alter table public.projects drop constraint projects_created_by_fkey;
alter table public.projects add constraint projects_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;

alter table public.tasks drop constraint tasks_created_by_fkey;
alter table public.tasks add constraint tasks_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;

alter table public.tasks drop constraint tasks_completed_by_fkey;
alter table public.tasks add constraint tasks_completed_by_fkey
  foreign key (completed_by) references public.profiles (id) on delete set null;

alter table public.attachments drop constraint attachments_uploaded_by_fkey;
alter table public.attachments add constraint attachments_uploaded_by_fkey
  foreign key (uploaded_by) references public.profiles (id) on delete set null;

alter table public.activity_log drop constraint activity_log_actor_id_fkey;
alter table public.activity_log add constraint activity_log_actor_id_fkey
  foreign key (actor_id) references public.profiles (id) on delete set null;

alter table public.notifications drop constraint notifications_actor_id_fkey;
alter table public.notifications add constraint notifications_actor_id_fkey
  foreign key (actor_id) references public.profiles (id) on delete set null;

alter table public.custom_field_values drop constraint custom_field_values_value_user_id_fkey;
alter table public.custom_field_values add constraint custom_field_values_value_user_id_fkey
  foreign key (value_user_id) references public.profiles (id) on delete set null;
