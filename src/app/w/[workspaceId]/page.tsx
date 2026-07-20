import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NavLink } from "@/components/nav-link";
import { NewProjectDialog } from "./new-project-dialog";

export default async function WorkspaceDashboardPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const supabase = await createClient();

  const [{ data: projects }, { data: archivedProjects }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, status, visibility, color")
      .eq("workspace_id", workspaceId)
      .eq("status", "active")
      .order("created_at"),
    supabase
      .from("projects")
      .select("id, name, status, visibility, color")
      .eq("workspace_id", workspaceId)
      .eq("status", "archived")
      .order("created_at"),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Projects</h1>
        <NewProjectDialog workspaceId={workspaceId} />
      </div>

      {projects && projects.length > 0 ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <NavLink key={project.id} href={`/w/${workspaceId}/p/${project.id}/list`}>
              <Card className="h-full transition-shadow duration-200 hover:shadow-md">
                <CardHeader>
                  <CardTitle className="text-base">{project.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  {project.visibility === "private" && (
                    <Badge variant="secondary">Private</Badge>
                  )}
                </CardContent>
              </Card>
            </NavLink>
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No projects yet. Create your first one.
        </div>
      )}

      {archivedProjects && archivedProjects.length > 0 && (
        <div className="mt-10">
          <h2 className="text-sm font-medium text-muted-foreground">Archived</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {archivedProjects.map((project) => (
              <NavLink key={project.id} href={`/w/${workspaceId}/p/${project.id}/settings`}>
                <Card className="h-full opacity-60 transition-opacity duration-200 hover:opacity-100">
                  <CardHeader>
                    <CardTitle className="text-base">{project.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Badge variant="secondary">Archived</Badge>
                  </CardContent>
                </Card>
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
