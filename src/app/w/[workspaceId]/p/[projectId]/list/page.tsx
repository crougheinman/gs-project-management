import { createClient } from "@/lib/supabase/server";
import { fetchProjectPageData } from "@/lib/tasks/page-data";
import { ListView } from "./list-view";

export default async function ListPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { workspaceId, projectId } = await params;
  const supabase = await createClient();
  const data = await fetchProjectPageData(supabase, workspaceId, projectId);

  return <ListView workspaceId={workspaceId} projectId={projectId} {...data} />;
}
