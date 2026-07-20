"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import type { CustomField, Profile, Tag } from "@/lib/types";
import type { ProjectMemberRow } from "./page";
import { CustomFieldsConfig } from "./custom-fields-config";
import { TagsConfig } from "./tags-config";
import { ProgressOverlay } from "@/components/progress-overlay";
import {
  addProjectMember,
  archiveProject,
  cleanupProjectFiles,
  deleteProjectRow,
  getProjectDeletionPreview,
  removeProjectMember,
  renameProject,
  unarchiveProject,
  updateProjectMemberRole,
} from "./actions";

const PROJECT_ROLES = ["admin", "editor", "commenter", "viewer"] as const;
const DELETE_TOTAL_STAGES = 3;

export function SettingsView({
  workspaceId,
  projectId,
  projectName,
  projectStatus,
  members,
  workspaceMembers,
  customFields,
  tags,
}: {
  workspaceId: string;
  projectId: string;
  projectName: string;
  projectStatus: string;
  members: ProjectMemberRow[];
  workspaceMembers: Pick<Profile, "id" | "full_name" | "email">[];
  customFields: CustomField[];
  tags: Tag[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [addUserId, setAddUserId] = useState<string>("");
  const [addRole, setAddRole] = useState<string>("editor");
  const [deleteStage, setDeleteStage] = useState<string | null>(null);
  const [deleteStageIndex, setDeleteStageIndex] = useState(0);

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

  async function handleDeleteProject() {
    if (
      !confirm(
        `Permanently delete "${projectName}"? This deletes every task, comment, attachment, and file in this project. This cannot be undone.`,
      )
    ) {
      return;
    }
    try {
      setDeleteStageIndex(0);
      setDeleteStage("Checking project…");
      const { attachmentIds } = await getProjectDeletionPreview(projectId);

      setDeleteStageIndex(1);
      setDeleteStage("Deleting project and tasks…");
      await deleteProjectRow(projectId);

      setDeleteStageIndex(2);
      setDeleteStage(
        attachmentIds.length > 0
          ? `Removing ${attachmentIds.length} attached file${attachmentIds.length === 1 ? "" : "s"}…`
          : "Finishing up…",
      );
      await cleanupProjectFiles(attachmentIds);

      setDeleteStageIndex(DELETE_TOTAL_STAGES);
      router.push(`/w/${workspaceId}`);
    } catch (err) {
      setDeleteStage(null);
      toast.error(err instanceof Error ? err.message : "Failed to delete project");
    }
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
                disabled={member.role === "admin"}
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
                disabled={member.role === "admin"}
                onClick={() => {
                  if (
                    confirm(
                      `Remove ${member.profiles?.full_name || member.profiles?.email} from this project?`,
                    )
                  ) {
                    run(() => removeProjectMember(workspaceId, projectId, member.user_id));
                  }
                }}
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

      <TagsConfig workspaceId={workspaceId} projectId={projectId} tags={tags} />

      <Separator className="my-6" />

      {projectStatus === "archived" ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted-foreground">This project is archived.</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => run(() => unarchiveProject(workspaceId, projectId))}
            >
              Unarchive project
            </Button>
            <Button variant="outline" className="text-destructive" onClick={handleDeleteProject}>
              Permanently delete project
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          className="text-destructive"
          onClick={() => {
            if (confirm(`Archive project "${projectName}"? It disappears from the dashboard.`)) {
              run(async () => {
                await archiveProject(workspaceId, projectId);
                router.push(`/w/${workspaceId}`);
              });
            }
          }}
        >
          Archive project
        </Button>
      )}

      <ProgressOverlay
        open={deleteStage !== null}
        title="Deleting…"
        stage={deleteStage ?? ""}
        stageIndex={deleteStageIndex}
        totalStages={DELETE_TOTAL_STAGES}
      />
    </div>
  );
}
