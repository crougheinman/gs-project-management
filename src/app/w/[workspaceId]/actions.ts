"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function createProject(workspaceId: string, formData: FormData): Promise<string> {
  const name = (formData.get("name") as string)?.trim();
  if (!name) throw new Error("Project name is required");
  const visibility = formData.get("visibility") === "private" ? "private" : "workspace";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Id generated app-side: INSERT ... RETURNING would run the SELECT policy
  // against a snapshot that can't see the new row yet (can_access_project is
  // STABLE), failing with an RLS violation.
  const projectId = crypto.randomUUID();
  const { error } = await supabase
    .from("projects")
    .insert({ id: projectId, workspace_id: workspaceId, name, visibility, created_by: user.id });
  if (error) throw new Error(error.message);

  // Creator becomes project admin via the on_project_created DB trigger
  // (RLS would reject the first project_members row from app code).

  // Default section so the list view isn't empty.
  await supabase
    .from("sections")
    .insert({ project_id: projectId, name: "To do", position: 1000 });

  revalidatePath(`/w/${workspaceId}`);
  // Navigation happens client-side (see new-project-dialog.tsx) rather than
  // via redirect() here - redirect() throws internally, and the client call
  // site wraps this action in try/catch to toast real errors, which would
  // otherwise catch and surface the redirect's own throw as a fake error.
  return projectId;
}

export async function updateProfile(workspaceId: string, formData: FormData) {
  const firstName = ((formData.get("first_name") as string) ?? "").trim();
  const lastName = ((formData.get("last_name") as string) ?? "").trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  if (!fullName) throw new Error("Name is required");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const update: { full_name: string; avatar_url?: string } = { full_name: fullName };

  const avatarFile = formData.get("avatar");
  if (avatarFile instanceof File && avatarFile.size > 0) {
    if (avatarFile.size > MAX_AVATAR_BYTES) throw new Error("Avatar must be under 2MB");
    if (!ALLOWED_AVATAR_TYPES.includes(avatarFile.type)) {
      throw new Error("Unsupported image type");
    }

    const ext = avatarFile.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, avatarFile, { contentType: avatarFile.type, upsert: false });
    if (uploadError) throw new Error(uploadError.message);

    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(path);
    update.avatar_url = publicUrl;
  }

  const { error } = await supabase.from("profiles").update(update).eq("id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath(`/w/${workspaceId}`);
}
