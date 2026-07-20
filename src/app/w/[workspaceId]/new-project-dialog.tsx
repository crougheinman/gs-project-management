"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProgressOverlay } from "@/components/progress-overlay";
import { createDefaultSection, createProjectRow } from "./actions";

const CREATE_TOTAL_STAGES = 2;

export function NewProjectDialog({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [visibility, setVisibility] = useState<"workspace" | "private">("workspace");
  const [createStage, setCreateStage] = useState<string | null>(null);
  const [createStageIndex, setCreateStageIndex] = useState(0);
  const isPending = createStage !== null;

  async function handleSubmit(formData: FormData) {
    try {
      setCreateStageIndex(0);
      setCreateStage("Creating project…");
      const projectId = await createProjectRow(workspaceId, formData);

      setCreateStageIndex(1);
      setCreateStage("Setting up your project…");
      await createDefaultSection(workspaceId, projectId);

      setCreateStageIndex(CREATE_TOTAL_STAGES);
      setOpen(false);
      router.push(`/w/${workspaceId}/p/${projectId}/list`);
    } catch (err) {
      setCreateStage(null);
      toast.error(err instanceof Error ? err.message : "Failed to create project");
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <Plus aria-hidden="true" />
            New project
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>Projects hold your tasks, sections, and views.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-name">Name</Label>
            <Input id="project-name" name="name" required autoFocus placeholder="e.g. Website redesign" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-visibility">Visibility</Label>
            <input type="hidden" name="visibility" value={visibility} />
            <Select
              value={visibility}
              items={{
                workspace: "Workspace — visible to all members",
                private: "Private — members only",
              }}
              onValueChange={(v) => v && setVisibility(v as "workspace" | "private")}
            >
              <SelectTrigger id="project-visibility">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="workspace">Workspace — visible to all members</SelectItem>
                <SelectItem value="private">Private — members only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Creating..." : "Create project"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>

    <ProgressOverlay
      open={createStage !== null}
      title="Creating…"
      stage={createStage ?? ""}
      stageIndex={createStageIndex}
      totalStages={CREATE_TOTAL_STAGES}
    />
    </>
  );
}
