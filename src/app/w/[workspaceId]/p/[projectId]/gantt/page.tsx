import { createClient } from "@/lib/supabase/server";
import { fetchProjectPageData } from "@/lib/tasks/page-data";
import { GanttView } from "./gantt-view";

export default async function GanttPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { workspaceId, projectId } = await params;
  const supabase = await createClient();
  const data = await fetchProjectPageData(supabase, workspaceId, projectId);

  return <GanttView workspaceId={workspaceId} projectId={projectId} {...data} />;
}
