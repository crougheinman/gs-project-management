-- Jira-style task classification (Epic / Task / Subtask). Hierarchy rules
-- (Epic parentless, Task under Epic-or-standalone, Subtask under Task only)
-- are enforced app-side in actions.ts, not here - same style as
-- addDependency's cycle check.

alter table public.tasks
  add column task_type text not null default 'task'
    check (task_type in ('epic', 'task', 'subtask'));
