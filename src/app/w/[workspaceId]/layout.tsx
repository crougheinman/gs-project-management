import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NotificationBell } from "@/components/notification-bell";
import { NavLink } from "@/components/nav-link";
import { ProfileMenu } from "@/components/profile-menu";

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
  const [{ count: unread }, { data: profile }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .eq("read", false),
    supabase.from("profiles").select("full_name, email, avatar_url").eq("id", userId).single(),
  ]);

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <NavLink href={`/w/${workspaceId}`} className="font-semibold text-foreground">
            {workspace.name}
          </NavLink>
          <nav className="flex items-center gap-4 text-sm">
            <NavLink
              href={`/w/${workspaceId}/search`}
              className="text-muted-foreground hover:text-foreground"
            >
              Search
            </NavLink>
            <NavLink
              href={`/w/${workspaceId}/my-tasks`}
              className="text-muted-foreground hover:text-foreground"
            >
              My tasks
            </NavLink>
            <NavLink
              href={`/w/${workspaceId}/settings/members`}
              className="text-muted-foreground hover:text-foreground"
            >
              Members
            </NavLink>
            <NotificationBell
              workspaceId={workspaceId}
              userId={userId}
              initialUnread={unread ?? 0}
            />
            <ProfileMenu
              workspaceId={workspaceId}
              email={profile?.email ?? userRes.data.user!.email ?? ""}
              fullName={profile?.full_name ?? null}
              avatarUrl={profile?.avatar_url ?? null}
            />
          </nav>
        </div>
      </header>
      <main className="flex-1 pt-6">{children}</main>
    </div>
  );
}
