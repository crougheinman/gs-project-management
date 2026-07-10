"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function inviteMember(workspaceId: string, formData: FormData) {
  const email = formData.get("email") as string;
  const role = formData.get("role") as string;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .single();

  if (membership?.role !== "admin") {
    throw new Error("Only workspace admins can invite members");
  }

  // GoTrue's invite link verifies server-side then redirects here with the
  // session in the URL hash fragment (implicit flow - admin-generated links
  // have no PKCE code_verifier to exchange), so the target must be a client
  // page that lets the Supabase browser client's detectSessionInUrl pick it
  // up, not a Route Handler (fragments never reach the server).
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { workspace_id: workspaceId, workspace_role: role },
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000"}/invite/set-password`,
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/w/${workspaceId}/settings/members`);
}

export async function updateMemberRole(workspaceId: string, userId: string, role: string) {
  const supabase = await createClient();
  // RLS also enforces admin-only, but check here for a friendly error.
  const { error } = await supabase
    .from("workspace_members")
    .update({ role })
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath(`/w/${workspaceId}/settings/members`);
}
