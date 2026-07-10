import { createClient } from "@/lib/supabase/server";
import type { Tag } from "@/lib/types";
import { TagsManager } from "./tags-manager";

export default async function TagsSettingsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const supabase = await createClient();

  const [tagsRes, { data: membership }] = await Promise.all([
    supabase
      .from("tags")
      .select("id, workspace_id, name, color")
      .eq("workspace_id", workspaceId)
      .order("name"),
    supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", (await supabase.auth.getUser()).data.user!.id)
      .single(),
  ]);

  const tags = (tagsRes.data ?? []) as Tag[];
  const canDelete = membership?.role === "admin";

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold text-foreground">Tags</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Workspace-wide labels available on every project&apos;s tasks.
      </p>
      <div className="mt-6">
        <TagsManager workspaceId={workspaceId} tags={tags} canDelete={canDelete} />
      </div>
    </div>
  );
}
