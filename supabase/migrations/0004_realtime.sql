-- Phase 2: realtime change feeds for live view sync.
-- Postgres Changes respects RLS per subscriber, so the anon-key client only
-- receives rows the signed-in user can already select.

alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.sections;
alter publication supabase_realtime add table public.projects;

-- DELETE events only carry the primary key unless replica identity is full;
-- without this, project_id-filtered subscriptions never see deletes.
alter table public.tasks replica identity full;
alter table public.sections replica identity full;
alter table public.projects replica identity full;
