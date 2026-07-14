import type { SupabaseClient } from "@supabase/supabase-js";
import type { Section, Tag, Task, TaskTag } from "@/lib/types";

// Single source of task-fetching for List (and later Board/Calendar).
// Returns all tasks in the project (incl. subtasks - views filter by
// parent_task_id themselves) plus sections and tag assignments.
export async function fetchProjectTasks(supabase: SupabaseClient, projectId: string) {
  const [sectionsRes, tasksRes, taskTagsRes] = await Promise.all([
    supabase
      .from("sections")
      .select("id, project_id, name, position")
      .eq("project_id", projectId)
      .order("position"),
    supabase
      .from("tasks")
      .select(
        "id, project_id, parent_task_id, section_id, assignee_id, name, description, completed, due_date, start_date, position, task_type, assignee:profiles!tasks_assignee_id_fkey(id, full_name, email)",
      )
      .eq("project_id", projectId)
      .order("position"),
    supabase
      .from("task_tags")
      .select("task_id, tag_id, tasks!inner(project_id)")
      .eq("tasks.project_id", projectId),
  ]);

  return {
    sections: (sectionsRes.data ?? []) as Section[],
    tasks: (tasksRes.data ?? []) as unknown as Task[],
    taskTags: (taskTagsRes.data ?? []).map(({ task_id, tag_id }) => ({
      task_id,
      tag_id,
    })) as TaskTag[],
  };
}

export async function fetchWorkspaceTags(supabase: SupabaseClient, workspaceId: string) {
  const { data } = await supabase
    .from("tags")
    .select("id, workspace_id, name, color")
    .eq("workspace_id", workspaceId)
    .order("name");
  return (data ?? []) as Tag[];
}
