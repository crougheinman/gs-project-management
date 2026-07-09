"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function markNotificationRead(workspaceId: string, notificationId: string) {
  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ read: true, read_at: new Date().toISOString() })
    .eq("id", notificationId);
  revalidatePath(`/w/${workspaceId}/notifications`);
}

export async function markAllNotificationsRead(workspaceId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("notifications")
    .update({ read: true, read_at: new Date().toISOString() })
    .eq("recipient_id", user.id)
    .eq("read", false);
  revalidatePath(`/w/${workspaceId}/notifications`);
}
