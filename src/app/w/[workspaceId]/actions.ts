"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function createProject(workspaceId: string, formData: FormData) {
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
  redirect(`/w/${workspaceId}/p/${projectId}/list`);
}
