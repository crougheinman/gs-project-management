import { createClient } from "@/lib/supabase/server";
import { Input } from "@/components/ui/input";
import { NavLink } from "@/components/nav-link";
import { cn } from "@/lib/utils";

type SearchRow = {
  id: string;
  name: string;
  completed: boolean;
  due_date: string | null;
  project_id: string;
  projects: { name: string; workspace_id: string } | null;
};

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { workspaceId } = await params;
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const supabase = await createClient();

  let results: SearchRow[] = [];
  if (query) {
    // websearch_to_tsquery handles multi-word / partial input gracefully;
    // RLS on tasks scopes this to projects the user can see.
    const { data } = await supabase
      .from("tasks")
      .select("id, name, completed, due_date, project_id, projects!inner(name, workspace_id)")
      .eq("projects.workspace_id", workspaceId)
      .textSearch("search_vector", query, { type: "websearch", config: "english" })
      .limit(50);
    results = (data ?? []) as unknown as SearchRow[];
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4">
      <h1 className="text-2xl font-semibold text-foreground">Search</h1>
      <form className="mt-4">
        <Input
          name="q"
          defaultValue={query}
          placeholder="Search tasks..."
          aria-label="Search tasks"
          autoFocus
        />
      </form>

      {query && (
        <p className="mt-3 text-sm text-muted-foreground">
          {results.length} result{results.length === 1 ? "" : "s"} for &ldquo;{query}&rdquo;
        </p>
      )}

      {results.length > 0 && (
        <ul className="mt-4 divide-y divide-border rounded-lg border border-border bg-card">
          {results.map((task) => (
            <li key={task.id}>
              <NavLink
                href={`/w/${workspaceId}/p/${task.project_id}/list?task=${task.id}`}
                className="flex items-center justify-between gap-4 px-4 py-2.5 transition-colors duration-150 hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <p
                    className={cn(
                      "truncate text-sm text-foreground",
                      task.completed && "text-muted-foreground line-through",
                    )}
                  >
                    {task.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{task.projects?.name}</p>
                </div>
                {task.due_date && (
                  <span className="shrink-0 text-xs text-muted-foreground">{task.due_date}</span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
