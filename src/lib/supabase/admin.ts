import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client. Server-only code paths exclusively (member invites,
// cross-project admin reads) - never import this from a Client Component.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
