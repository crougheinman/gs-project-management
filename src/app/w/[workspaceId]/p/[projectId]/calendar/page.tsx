import { createClient } from "@/lib/supabase/server";
import { fetchProjectPageData } from "@/lib/tasks/page-data";
import { CalendarView } from "./calendar-view";

export default async function CalendarPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { workspaceId, projectId } = await params;
  const supabase = await createClient();
  const data = await fetchProjectPageData(supabase, workspaceId, projectId);

  return <CalendarView workspaceId={workspaceId} projectId={projectId} {...data} />;
}
