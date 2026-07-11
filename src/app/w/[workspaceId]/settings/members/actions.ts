"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Throws unless the current user is an admin of the given workspace. Returns
// the per-user Supabase client + user for reuse.
async function requireWorkspaceAdmin(workspaceId: string) {
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
    throw new Error("Only workspace admins can manage members");
  }
  return { supabase, user };
}

// Add a member. Behavior by input:
//  - email already registered -> attach to the workspace ("added")
//  - new email + password given -> create the account instantly ("created")
//  - new email, no password     -> send an invite email ("invited")
export async function addMember(
  workspaceId: string,
  formData: FormData,
): Promise<"added" | "created" | "invited"> {
  const email = ((formData.get("email") as string) ?? "").trim().toLowerCase();
  const role = (formData.get("role") as string) || "member";
  const fullName = ((formData.get("fullName") as string) ?? "").trim();
  const password = ((formData.get("password") as string) ?? "").trim();
  if (!email) throw new Error("Email is required");
  if (password && password.length < 6) {
    throw new Error("Password must be at least 6 characters");
  }

  const { supabase } = await requireWorkspaceAdmin(workspaceId);

  // Already registered (e.g. self-signed-up and stranded on "No workspace
  // yet") -> just add to the workspace. profiles mirrors auth.users and is
  // RLS-readable; the membership upsert is gated by the admin RLS policy.
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("workspace_members")
      .upsert(
        { workspace_id: workspaceId, user_id: existing.id, role },
        { onConflict: "workspace_id,user_id" },
      );
    if (error) throw new Error(error.message);
    revalidatePath(`/w/${workspaceId}/settings/members`);
    return "added";
  }

  const admin = createAdminClient();

  // New email + admin-set password -> create the account immediately. The
  // handle_new_user trigger reads workspace_id/workspace_role from metadata
  // and inserts the workspace_members row with that role.
  if (password) {
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName || null,
        workspace_id: workspaceId,
        workspace_role: role,
      },
    });
    if (error) throw new Error(error.message);
    revalidatePath(`/w/${workspaceId}/settings/members`);
    return "created";
  }

  // New email, no password -> invite email. GoTrue's link redirects with the
  // session in the URL hash (implicit flow), so the target is a client page
  // where the browser client's detectSessionInUrl picks it up.
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName || null, workspace_id: workspaceId, workspace_role: role },
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000"}/invite/set-password`,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/w/${workspaceId}/settings/members`);
  return "invited";
}

export async function updateMemberRole(workspaceId: string, userId: string, role: string) {
  const { supabase } = await requireWorkspaceAdmin(workspaceId);
  const { error } = await supabase
    .from("workspace_members")
    .update({ role })
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath(`/w/${workspaceId}/settings/members`);
}

export async function setMemberPassword(
  workspaceId: string,
  userId: string,
  password: string,
) {
  const pw = password.trim();
  if (pw.length < 6) throw new Error("Password must be at least 6 characters");

  const { supabase } = await requireWorkspaceAdmin(workspaceId);

  // Only allow resetting a user who is actually a member of this workspace,
  // so an admin can't reach users outside their workspace.
  const { data: target } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!target) throw new Error("That user is not a member of this workspace");

  // Also confirm the email: an admin setting a password is vouching for the
  // account, and an unconfirmed email blocks password sign-in ("Email not
  // confirmed"). This lets an admin unblock users who were invited but never
  // clicked the invite link.
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: pw,
    email_confirm: true,
  });
  if (error) throw new Error(error.message);
}

export async function removeMember(workspaceId: string, userId: string) {
  const { user } = await requireWorkspaceAdmin(workspaceId);
  if (userId === user.id) {
    throw new Error("You can't remove yourself");
  }
  const supabase = await createClient();
  // RLS also enforces admin-only delete.
  const { error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath(`/w/${workspaceId}/settings/members`);
}
