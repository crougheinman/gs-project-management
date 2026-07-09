import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Per-user server client (RLS applies). Use in Server Components, Server
// Actions, and Route Handlers. Never pass the service-role key here.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component - middleware refreshes the
            // session on the next request, so this is safe to ignore.
          }
        },
      },
    },
  );
}
