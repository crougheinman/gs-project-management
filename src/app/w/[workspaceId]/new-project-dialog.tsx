"use client";

import { useState, useTransition } from "react";
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
import { createProject } from "./actions";

export function NewProjectDialog({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [visibility, setVisibility] = useState<"workspace" | "private">("workspace");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        const projectId = await createProject(workspaceId, formData);
        setOpen(false);
        router.push(`/w/${workspaceId}/p/${projectId}/list`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to create project");
      }
    });
  }

  return (
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
  );
}
