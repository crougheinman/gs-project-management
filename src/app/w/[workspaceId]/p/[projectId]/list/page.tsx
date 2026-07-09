import { createClient } from "@/lib/supabase/server";
import { fetchProjectTasks, fetchWorkspaceTags } from "@/lib/tasks/queries";
import type { Profile } from "@/lib/types";
import { ListView } from "./list-view";

export default async function ListPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { workspaceId, projectId } = await params;
  const supabase = await createClient();

  const [{ sections, tasks, taskTags }, tags, membersRes] = await Promise.all([
    fetchProjectTasks(supabase, projectId),
    fetchWorkspaceTags(supabase, workspaceId),
    supabase
      .from("workspace_members")
      .select("profiles(id, email, full_name, avatar_url)")
      .eq("workspace_id", workspaceId),
  ]);

  const members = (membersRes.data ?? [])
    .map((row) => row.profiles as unknown as Profile)
    .filter(Boolean);

  return (
    <ListView
      workspaceId={workspaceId}
      projectId={projectId}
      sections={sections}
      tasks={tasks}
      taskTags={taskTags}
      tags={tags}
      members={members}
    />
  );
}
