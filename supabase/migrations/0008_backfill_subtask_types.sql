-- 0007 defaulted every existing row to task_type='task', including rows that
-- already had a parent_task_id (the old "subtask" concept, predating this
-- column). Reclassify those as 'subtask' so they match the new invariant
-- (a subtask's parent must be task_type='task', which all their existing
-- parents already are, since parents default to 'task' too).
update public.tasks set task_type = 'subtask' where parent_task_id is not null;
