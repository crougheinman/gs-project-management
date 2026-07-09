import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type MyTaskRow = {
  id: string;
  name: string;
  due_date: string | null;
  completed: boolean;
  project_id: string;
  projects: { name: string } | null;
};

export default async function MyTasksPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("tasks")
    .select("id, name, due_date, completed, project_id, projects!inner(name, workspace_id)")
    .eq("assignee_id", user!.id)
    .eq("completed", false)
    .eq("projects.workspace_id", workspaceId)
    .order("due_date", { ascending: true, nullsFirst: false });

  const tasks = (data ?? []) as unknown as MyTaskRow[];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto w-full max-w-3xl px-4">
      <h1 className="text-2xl font-semibold text-foreground">My tasks</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Incomplete tasks assigned to you across this workspace.
      </p>

      {tasks.length > 0 ? (
        <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-card">
          {tasks.map((task) => (
            <li key={task.id}>
              <Link
                href={`/w/${workspaceId}/p/${task.project_id}/list?task=${task.id}`}
                className="flex items-center justify-between gap-4 px-4 py-2.5 transition-colors duration-150 hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">{task.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {task.projects?.name}
                  </p>
                </div>
                {task.due_date && (
                  <span
                    className={cn(
                      "shrink-0 text-xs",
                      task.due_date < today ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {task.due_date}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-6 rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Nothing assigned to you. Enjoy the quiet.
        </div>
      )}
    </div>
  );
}
