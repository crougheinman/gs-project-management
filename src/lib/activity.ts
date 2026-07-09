import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TiptapNode } from "@/lib/types";

// Best-effort side-channel writes: activity/notification failures must never
// block the primary mutation, so errors are swallowed.

export async function logActivity(
  supabase: SupabaseClient,
  entry: {
    workspaceId: string;
    projectId: string;
    taskId?: string | null;
    actorId: string;
    action: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  },
) {
  await supabase.from("activity_log").insert({
    workspace_id: entry.workspaceId,
    project_id: entry.projectId,
    task_id: entry.taskId ?? null,
    actor_id: entry.actorId,
    action: entry.action,
    entity_type: entry.entityType ?? null,
    entity_id: entry.entityId ?? null,
    metadata: entry.metadata ?? null,
  });
}

export async function notify(
  supabase: SupabaseClient,
  n: {
    recipientIds: (string | null | undefined)[];
    actorId: string;
    type: "assigned" | "mentioned" | "comment_added" | "added_to_project";
    projectId: string;
    taskId?: string | null;
    commentId?: string | null;
    message: string;
  },
) {
  const recipients = [...new Set(n.recipientIds.filter((id): id is string => !!id))].filter(
    (id) => id !== n.actorId, // never notify yourself
  );
  if (recipients.length === 0) return;

  await supabase.from("notifications").insert(
    recipients.map((recipient_id) => ({
      recipient_id,
      actor_id: n.actorId,
      type: n.type,
      project_id: n.projectId,
      task_id: n.taskId ?? null,
      comment_id: n.commentId ?? null,
      message: n.message,
    })),
  );
}

// Walk a Tiptap doc for mention nodes -> user ids.
export function extractMentionIds(node: TiptapNode | undefined): string[] {
  if (!node) return [];
  const ids: string[] = [];
  if (node.type === "mention" && typeof node.attrs?.id === "string") {
    ids.push(node.attrs.id);
  }
  for (const child of node.content ?? []) {
    ids.push(...extractMentionIds(child));
  }
  return [...new Set(ids)];
}
