"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const ADMIN_API_BASE_URL = process.env.ADMIN_API_BASE_URL!;
const PM_SERVICE_KEY = process.env.PM_SERVICE_KEY!;

export async function renameProject(workspaceId: string, projectId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Project name is required");
  const supabase = await createClient();
  const { error } = await supabase.from("projects").update({ name: trimmed }).eq("id", projectId);
  if (error) throw new Error(error.message);
  revalidatePath(`/w/${workspaceId}/p/${projectId}`);
}

export async function archiveProject(workspaceId: string, projectId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({ status: "archived" })
    .eq("id", projectId);
  if (error) throw new Error(error.message);
  // Navigation happens client-side (see settings-view.tsx) rather than via
  // redirect() here - redirect() throws internally, and the client call site
  // wraps this action in try/catch to toast real errors, which would
  // otherwise catch and surface the redirect's own throw as a fake error.
  revalidatePath(`/w/${workspaceId}`);
}

export async function unarchiveProject(workspaceId: string, projectId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({ status: "active" })
    .eq("id", projectId);
  if (error) throw new Error(error.message);
  revalidatePath(`/w/${workspaceId}`);
  revalidatePath(`/w/${workspaceId}/p/${projectId}/settings`);
}

export async function addProjectMember(
  workspaceId: string,
  projectId: string,
  userId: string,
  role: string,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("project_members")
    .insert({ project_id: projectId, user_id: userId, role });
  if (error) throw new Error(error.message);
  revalidatePath(`/w/${workspaceId}/p/${projectId}/settings`);
}

export async function updateProjectMemberRole(
  workspaceId: string,
  projectId: string,
  userId: string,
  role: string,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("project_members")
    .update({ role })
    .eq("project_id", projectId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath(`/w/${workspaceId}/p/${projectId}/settings`);
}

export async function removeProjectMember(
  workspaceId: string,
  projectId: string,
  userId: string,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath(`/w/${workspaceId}/p/${projectId}/settings`);
}

// Project deletion is split into three actions (rather than one) so the
// client can show real, stage-accurate progress - each function below is one
// network round-trip, and the caller updates its UI between each `await`.

export type ProjectDeletionPreview = { attachmentIds: string[] };

export async function getProjectDeletionPreview(
  projectId: string,
): Promise<ProjectDeletionPreview> {
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("status")
    .eq("id", projectId)
    .single();
  if (!project) throw new Error("Project not found");
  if (project.status !== "archived") {
    throw new Error("Archive the project before deleting it.");
  }

  // Gather every attachment under the project (via its tasks) before the
  // delete cascades - once the projects row is gone, so is this join.
  const { data: attachmentRows } = await supabase
    .from("attachments")
    .select("id, tasks!inner(project_id)")
    .eq("tasks.project_id", projectId);

  return { attachmentIds: (attachmentRows ?? []).map((a) => a.id) };
}

export async function deleteProjectRow(projectId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  if (error) throw new Error(error.message);
}

export async function cleanupProjectFiles(attachmentIds: string[]) {
  await Promise.all(
    attachmentIds.map((id) =>
      fetch(`${ADMIN_API_BASE_URL}/api/pm/attachments/${id}`, {
        method: "DELETE",
        headers: { "X-Pm-Key": PM_SERVICE_KEY },
      }).catch(() => {}),
    ),
  );
}
