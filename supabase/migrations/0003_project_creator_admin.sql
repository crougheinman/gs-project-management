-- Bootstrap: project creator automatically becomes project admin.
-- Done in a trigger (not app code) because project_members_insert RLS
-- requires an existing project-admin row - chicken-and-egg for the first one.

create function public.handle_new_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null then
    insert into public.project_members (project_id, user_id, role)
    values (new.id, new.created_by, 'admin')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger on_project_created
  after insert on public.projects
  for each row execute function public.handle_new_project();

-- Repair the one project created before this trigger existed.
insert into public.project_members (project_id, user_id, role)
select p.id, p.created_by, 'admin'
from public.projects p
where p.created_by is not null
  and not exists (
    select 1 from public.project_members pm
    where pm.project_id = p.id and pm.user_id = p.created_by
  );
