import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (membership) {
    redirect(`/w/${membership.workspace_id}`);
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-background p-4 text-center">
      <div className="max-w-sm">
        <h1 className="text-xl font-semibold text-foreground">No workspace yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You&apos;re signed in, but not a member of any workspace yet. Ask a workspace admin to
          invite you.
        </p>
      </div>
    </div>
  );
}
