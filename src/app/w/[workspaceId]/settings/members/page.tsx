import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { InviteForm } from "./invite-form";
import { RoleSelect } from "./role-select";
import { MemberActions } from "./member-actions";

type MemberRow = {
  user_id: string;
  role: string;
  profiles: { full_name: string | null; email: string } | null;
};

export default async function MembersPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: members }, { data: myMembership }] = await Promise.all([
    supabase
      .from("workspace_members")
      .select("user_id, role, profiles(full_name, email)")
      .eq("workspace_id", workspaceId)
      .order("created_at"),
    supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user!.id)
      .single(),
  ]);

  const isAdmin = myMembership?.role === "admin";
  const rows = (members ?? []) as unknown as MemberRow[];

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Members</h1>
        <Link
          href={`/w/${workspaceId}/settings/tags`}
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Manage tags
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage who has access to this workspace.
      </p>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              {isAdmin && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((member) => {
              const canManage = isAdmin && member.user_id !== user!.id;
              return (
                <TableRow key={member.user_id}>
                  <TableCell>{member.profiles?.full_name || "—"}</TableCell>
                  <TableCell>{member.profiles?.email}</TableCell>
                  <TableCell>
                    {canManage ? (
                      <RoleSelect
                        workspaceId={workspaceId}
                        userId={member.user_id}
                        role={member.role}
                      />
                    ) : (
                      <Badge variant="secondary">{member.role}</Badge>
                    )}
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      {canManage && (
                        <MemberActions
                          workspaceId={workspaceId}
                          userId={member.user_id}
                          email={member.profiles?.email ?? ""}
                        />
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {isAdmin ? (
        <div className="mt-8">
          <h2 className="text-sm font-medium text-foreground">Add a member</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Already-registered emails are added immediately. For a new email, set a password to
            create the account instantly, or leave it blank to send an invite.
          </p>
          <div className="mt-3">
            <InviteForm workspaceId={workspaceId} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
