"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { NavLink } from "@/components/nav-link";

export function NotificationBell({
  workspaceId,
  userId,
  initialUnread,
}: {
  workspaceId: string;
  userId: string;
  initialUnread: number;
}) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => router.refresh(), 300);
        },
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [supabase, userId, router]);

  return (
    <NavLink
      href={`/w/${workspaceId}/notifications`}
      aria-label={`Notifications${initialUnread > 0 ? ` (${initialUnread} unread)` : ""}`}
      className="relative rounded-md p-1.5 text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
    >
      <Bell className="size-4" aria-hidden="true" />
      {initialUnread > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground"
        >
          {initialUnread > 9 ? "9+" : initialUnread}
        </span>
      )}
    </NavLink>
  );
}
