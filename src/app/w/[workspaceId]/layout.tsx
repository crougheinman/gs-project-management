import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notification-bell";
import { signOut } from "./actions";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const supabase = await createClient();

  const [{ data: workspace }, userRes] = await Promise.all([
    supabase.from("workspaces").select("id, name").eq("id", workspaceId).single(),
    supabase.auth.getUser(),
  ]);

  if (!workspace) {
    notFound();
  }

  const userId = userRes.data.user!.id;
  const { count: unread } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", userId)
    .eq("read", false);

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href={`/w/${workspaceId}`} className="font-semibold text-foreground">
            {workspace.name}
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link
              href={`/w/${workspaceId}/my-tasks`}
              className="text-muted-foreground hover:text-foreground"
            >
              My tasks
            </Link>
            <Link
              href={`/w/${workspaceId}/settings/members`}
              className="text-muted-foreground hover:text-foreground"
            >
              Members
            </Link>
            <NotificationBell
              workspaceId={workspaceId}
              userId={userId}
              initialUnread={unread ?? 0}
            />
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </nav>
        </div>
      </header>
      <main className="flex-1 pt-6">{children}</main>
    </div>
  );
}
