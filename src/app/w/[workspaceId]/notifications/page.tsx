import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { markAllNotificationsRead, markNotificationRead } from "./actions";

type NotificationRow = {
  id: string;
  actor_id: string | null;
  type: string;
  project_id: string | null;
  task_id: string | null;
  message: string;
  read: boolean;
  created_at: string;
  actor: { full_name: string | null; email: string } | null;
};

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("notifications")
    .select(
      "id, actor_id, type, project_id, task_id, message, read, created_at, actor:profiles!notifications_actor_id_fkey(full_name, email)",
    )
    .eq("recipient_id", user!.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const notifications = (data ?? []) as unknown as NotificationRow[];
  const hasUnread = notifications.some((n) => !n.read);
  const markAll = markAllNotificationsRead.bind(null, workspaceId);

  return (
    <div className="mx-auto w-full max-w-3xl px-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Notifications</h1>
        {hasUnread && (
          <form action={markAll}>
            <Button type="submit" variant="outline" size="sm">
              Mark all read
            </Button>
          </form>
        )}
      </div>

      {notifications.length > 0 ? (
        <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-card">
          {notifications.map((n) => {
            const actorName = n.actor?.full_name || n.actor?.email || "Someone";
            const href =
              n.project_id && n.task_id
                ? `/w/${workspaceId}/p/${n.project_id}/list?task=${n.task_id}`
                : `/w/${workspaceId}`;
            const markRead = markNotificationRead.bind(null, workspaceId, n.id);
            return (
              <li key={n.id} className={cn("flex items-center gap-3 px-4 py-2.5", !n.read && "bg-accent/40")}>
                <Link
                  href={href}
                  className="min-w-0 flex-1 transition-colors duration-150 hover:text-primary"
                >
                  <p className="truncate text-sm text-foreground">
                    <span className="font-medium">{actorName}</span> {n.message}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(n.created_at).toLocaleString()}
                  </p>
                </Link>
                {!n.read && (
                  <form action={markRead}>
                    <Button type="submit" variant="ghost" size="sm">
                      Mark read
                    </Button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-6 rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No notifications yet.
        </div>
      )}
    </div>
  );
}
