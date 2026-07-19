import { createClient } from "@/lib/supabase/server";
import { NavLink } from "@/components/nav-link";

const ACTIVITY_LABELS: Record<string, string> = {
  "task.created": "created task",
  "task.completed": "completed task",
  "task.uncompleted": "reopened task",
  "task.assigned": "changed assignee on",
  "task.unassigned": "removed assignee from",
  "task.due_date_changed": "changed due date on",
  "comment.created": "commented on",
  "attachment.added": "attached a file to",
};

type ActivityRow = {
  id: string;
  task_id: string | null;
  action: string;
  metadata: { name?: string; file_name?: string } | null;
  created_at: string;
  actor: { full_name: string | null; email: string } | null;
};

export default async function ProjectActivityPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { workspaceId, projectId } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("activity_log")
    .select(
      "id, task_id, action, metadata, created_at, actor:profiles!activity_log_actor_id_fkey(full_name, email)",
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(100);

  const entries = (data ?? []) as unknown as ActivityRow[];

  return (
    <div className="max-w-2xl pb-16">
      {entries.length > 0 ? (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {entries.map((entry) => {
            const actorName = entry.actor?.full_name || entry.actor?.email || "Someone";
            const label = ACTIVITY_LABELS[entry.action] ?? entry.action;
            const taskName = entry.metadata?.name;
            return (
              <li key={entry.id} className="px-4 py-2.5 text-sm">
                <span className="font-medium text-foreground">{actorName}</span>{" "}
                <span className="text-muted-foreground">{label}</span>{" "}
                {entry.task_id && taskName ? (
                  <NavLink
                    href={`/w/${workspaceId}/p/${projectId}/list?task=${entry.task_id}`}
                    className="text-foreground underline-offset-4 hover:underline"
                  >
                    {taskName}
                  </NavLink>
                ) : (
                  <span className="text-foreground">{taskName}</span>
                )}
                <span className="ml-2 text-xs text-muted-foreground">
                  {new Date(entry.created_at).toLocaleString()}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No activity yet.
        </div>
      )}
    </div>
  );
}
