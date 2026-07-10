"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CustomField, Profile } from "@/lib/types";
import type { ProjectMemberRow } from "./page";
import { CustomFieldsConfig } from "./custom-fields-config";
import {
  addProjectMember,
  archiveProject,
  removeProjectMember,
  renameProject,
  updateProjectMemberRole,
} from "./actions";

const PROJECT_ROLES = ["admin", "editor", "commenter", "viewer"] as const;

export function SettingsView({
  workspaceId,
  projectId,
  projectName,
  members,
  workspaceMembers,
  customFields,
}: {
  workspaceId: string;
  projectId: string;
  projectName: string;
  members: ProjectMemberRow[];
  workspaceMembers: Pick<Profile, "id" | "full_name" | "email">[];
  customFields: CustomField[];
}) {
  const [, startTransition] = useTransition();
  const [addUserId, setAddUserId] = useState<string>("");
  const [addRole, setAddRole] = useState<string>("editor");

  const memberIds = new Set(members.map((m) => m.user_id));
  const addable = workspaceMembers.filter((m) => !memberIds.has(m.id));

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      try {
        await action();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <div className="max-w-2xl pb-16">
      <h2 className="text-lg font-semibold text-foreground">Project settings</h2>

      <div className="mt-4 flex max-w-sm flex-col gap-2">
        <Label htmlFor="project-name">Name</Label>
        <Input
          id="project-name"
          defaultValue={projectName}
          onBlur={(e) => {
            const value = e.target.value.trim();
            if (value && value !== projectName) {
              run(() => renameProject(workspaceId, projectId, value));
            }
          }}
        />
      </div>

      <Separator className="my-6" />

      <h3 className="text-sm font-medium text-foreground">Project members</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Explicit members get access even when the project is private; guests always need an
        entry here.
      </p>

      <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
        {members.map((member) => (
          <li key={member.user_id} className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm text-foreground">
                {member.profiles?.full_name || member.profiles?.email}
              </p>
              <p className="truncate text-xs text-muted-foreground">{member.profiles?.email}</p>
            </div>
            <div className="flex items-center gap-1">
              <Select
                value={member.role}
                onValueChange={(role) =>
                  role &&
                  run(() => updateProjectMemberRole(workspaceId, projectId, member.user_id, role))
                }
              >
                <SelectTrigger aria-label="Project role" className="h-8 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${member.profiles?.email} from project`}
                onClick={() =>
                  run(() => removeProjectMember(workspaceId, projectId, member.user_id))
                }
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {addable.length > 0 && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="add-member" className="text-xs">
              Add member
            </Label>
            <Select value={addUserId} onValueChange={(v) => setAddUserId(v ?? "")}>
              <SelectTrigger id="add-member" className="h-8 w-56 text-xs">
                <SelectValue placeholder="Pick a workspace member" />
              </SelectTrigger>
              <SelectContent>
                {addable.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.full_name || m.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="add-role" className="text-xs">
              Role
            </Label>
            <Select value={addRole} onValueChange={(v) => setAddRole(v ?? "editor")}>
              <SelectTrigger id="add-role" className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            disabled={!addUserId}
            onClick={() => {
              const userId = addUserId;
              setAddUserId("");
              run(() => addProjectMember(workspaceId, projectId, userId, addRole));
            }}
          >
            Add
          </Button>
        </div>
      )}

      <Separator className="my-6" />

      <CustomFieldsConfig workspaceId={workspaceId} projectId={projectId} fields={customFields} />

      <Separator className="my-6" />

      <Button
        variant="outline"
        className="text-destructive"
        onClick={() => {
          if (confirm(`Archive project "${projectName}"? It disappears from the dashboard.`)) {
            run(() => archiveProject(workspaceId, projectId));
          }
        }}
      >
        Archive project
      </Button>
    </div>
  );
}
