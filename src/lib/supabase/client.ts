import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // Invite/recovery links are parsed manually (see /invite/set-password) -
    // the automatic parser has been unreliable in local dev.
    { auth: { detectSessionInUrl: false } },
  );
}
