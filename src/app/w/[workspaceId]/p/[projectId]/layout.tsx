import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProjectTabs } from "./project-tabs";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { workspaceId, projectId } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, visibility")
    .eq("id", projectId)
    .single();

  if (!project) notFound();

  const base = `/w/${workspaceId}/p/${projectId}`;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">{project.name}</h1>
      </div>
      <ProjectTabs base={base} />
      <div className="flex-1 pt-4">{children}</div>
    </div>
  );
}
