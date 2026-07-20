import { createClient } from "@/lib/supabase/server";
import type { CustomField, Profile, Tag } from "@/lib/types";
import { SettingsView } from "./settings-view";

export type ProjectMemberRow = {
  user_id: string;
  role: string;
  profiles: Pick<Profile, "id" | "full_name" | "email"> | null;
};

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { workspaceId, projectId } = await params;
  const supabase = await createClient();

  const [{ data: project }, membersRes, workspaceMembersRes, customFieldsRes, tagsRes] =
    await Promise.all([
      supabase.from("projects").select("id, name, visibility, status").eq("id", projectId).single(),
      supabase
        .from("project_members")
        .select("user_id, role, profiles(id, full_name, email)")
        .eq("project_id", projectId)
        .order("created_at"),
      supabase
        .from("workspace_members")
        .select("profiles(id, full_name, email)")
        .eq("workspace_id", workspaceId),
      supabase
        .from("custom_fields")
        .select("id, project_id, name, field_type, options, position")
        .eq("project_id", projectId)
        .order("position"),
      supabase
        .from("tags")
        .select("id, project_id, name, color")
        .eq("project_id", projectId)
        .order("name"),
    ]);

  const members = (membersRes.data ?? []) as unknown as ProjectMemberRow[];
  const workspaceMembers = (workspaceMembersRes.data ?? [])
    .map((r) => r.profiles as unknown as Pick<Profile, "id" | "full_name" | "email">)
    .filter(Boolean);
  const customFields = (customFieldsRes.data ?? []) as unknown as CustomField[];
  const tags = (tagsRes.data ?? []) as Tag[];

  return (
    <SettingsView
      workspaceId={workspaceId}
      projectId={projectId}
      projectName={project?.name ?? ""}
      projectStatus={project?.status ?? "active"}
      members={members}
      workspaceMembers={workspaceMembers}
      customFields={customFields}
      tags={tags}
    />
  );
}
