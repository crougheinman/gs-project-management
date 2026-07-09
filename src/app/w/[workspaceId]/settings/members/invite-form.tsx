"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { inviteMember } from "./actions";

const ROLES = ["admin", "member", "guest"] as const;

export function InviteForm({ workspaceId }: { workspaceId: string }) {
  const [role, setRole] = useState<(typeof ROLES)[number]>("member");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        await inviteMember(workspaceId, formData);
        toast.success("Invite sent");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to invite");
      }
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="invite-email">Email</Label>
        <Input id="invite-email" name="email" type="email" required className="w-56" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="invite-role">Role</Label>
        <input type="hidden" name="role" value={role} />
        <Select value={role} onValueChange={(v) => setRole(v as (typeof ROLES)[number])}>
          <SelectTrigger id="invite-role" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Inviting..." : "Invite"}
      </Button>
    </form>
  );
}
