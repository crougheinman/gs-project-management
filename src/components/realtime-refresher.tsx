"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Live sync: any change to this project's tasks/sections (from other users
// or other tabs) triggers a debounced RSC refresh. Server data is the source
// of truth - no client cache to patch.
export function RealtimeRefresher({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 300);
    };

    const channel = supabase
      .channel(`project-${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `project_id=eq.${projectId}` },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sections", filter: `project_id=eq.${projectId}` },
        refresh,
      )
      .subscribe();

    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [supabase, projectId, router]);

  return null;
}
