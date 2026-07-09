"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
  redirect(`/w/${workspaceId}`);
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
