"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createWorkspaceTag(
  workspaceId: string,
  name: string,
  color: string | null,
) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Tag name is required");
  const supabase = await createClient();
  const { error } = await supabase
    .from("tags")
    .insert({ workspace_id: workspaceId, name: trimmed, color });
  if (error) throw new Error(error.message);
  revalidatePath(`/w/${workspaceId}/settings/tags`);
}

export async function updateWorkspaceTagColor(
  workspaceId: string,
  tagId: string,
  color: string,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("tags").update({ color }).eq("id", tagId);
  if (error) throw new Error(error.message);
  revalidatePath(`/w/${workspaceId}/settings/tags`);
}

export async function deleteWorkspaceTag(workspaceId: string, tagId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("tags").delete().eq("id", tagId);
  if (error) throw new Error(error.message);
  revalidatePath(`/w/${workspaceId}/settings/tags`);
}
