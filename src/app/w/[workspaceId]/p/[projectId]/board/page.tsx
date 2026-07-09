import { createClient } from "@/lib/supabase/server";
import { fetchProjectPageData } from "@/lib/tasks/page-data";
import { BoardView } from "./board-view";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { workspaceId, projectId } = await params;
  const supabase = await createClient();
  const data = await fetchProjectPageData(supabase, workspaceId, projectId);

  return <BoardView workspaceId={workspaceId} projectId={projectId} {...data} />;
}
