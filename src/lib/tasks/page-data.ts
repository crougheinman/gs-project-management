import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ActivityEntry,
  Attachment,
  Comment,
  CustomField,
  CustomFieldValue,
  Profile,
  TaskDependency,
} from "@/lib/types";
import { fetchProjectTasks, fetchWorkspaceTags } from "./queries";

export type ProjectPageData = Awaited<ReturnType<typeof fetchProjectPageData>>;

// Everything List/Board/Calendar need to render + drive the task panel.
export async function fetchProjectPageData(
  supabase: SupabaseClient,
  workspaceId: string,
  projectId: string,
) {
  const [
    { sections, tasks, taskTags },
    tags,
    membersRes,
    commentsRes,
    attachmentsRes,
    activityRes,
    customFieldsRes,
    customFieldValuesRes,
    dependenciesRes,
  ] = await Promise.all([
    fetchProjectTasks(supabase, projectId),
    fetchWorkspaceTags(supabase, workspaceId),
    supabase
      .from("project_members")
      .select("profiles(id, email, full_name, avatar_url)")
      .eq("project_id", projectId),
    supabase
      .from("comments")
      .select(
        "id, task_id, author_id, body, created_at, author:profiles!comments_author_id_fkey(id, full_name, email), tasks!inner(project_id)",
      )
      .eq("tasks.project_id", projectId)
      .order("created_at"),
    supabase
      .from("attachments")
      .select(
        "id, task_id, comment_id, uploaded_by, storage_path, file_name, file_size, mime_type, created_at, tasks!inner(project_id)",
      )
      .eq("tasks.project_id", projectId)
      .order("created_at"),
    supabase
      .from("activity_log")
      .select(
        "id, project_id, task_id, actor_id, action, metadata, created_at, actor:profiles!activity_log_actor_id_fkey(id, full_name, email)",
      )
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("custom_fields")
      .select("id, project_id, name, field_type, options, position")
      .eq("project_id", projectId)
      .order("position"),
    supabase
      .from("custom_field_values")
      .select(
        "id, custom_field_id, task_id, value_text, value_number, value_date, value_boolean, value_option_ids, value_user_id, custom_fields!inner(project_id)",
      )
      .eq("custom_fields.project_id", projectId),
    supabase
      .from("task_dependencies")
      .select("id, task_id, depends_on_task_id, tasks!task_dependencies_task_id_fkey!inner(project_id)")
      .eq("tasks.project_id", projectId),
  ]);

  const members = (membersRes.data ?? [])
    .map((row) => row.profiles as unknown as Profile)
    .filter(Boolean);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return {
    sections,
    tasks,
    taskTags,
    tags,
    members,
    currentUserId: user?.id ?? null,
    comments: (commentsRes.data ?? []) as unknown as Comment[],
    attachments: (attachmentsRes.data ?? []) as unknown as Attachment[],
    activity: (activityRes.data ?? []) as unknown as ActivityEntry[],
    customFields: (customFieldsRes.data ?? []) as unknown as CustomField[],
    customFieldValues: (customFieldValuesRes.data ?? []) as unknown as CustomFieldValue[],
    dependencies: (dependenciesRes.data ?? []) as unknown as TaskDependency[],
  };
}
