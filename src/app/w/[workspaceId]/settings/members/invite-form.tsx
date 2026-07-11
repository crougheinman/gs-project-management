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
import { addMember } from "./actions";

const ROLES = ["admin", "member", "guest"] as const;

const RESULT_TOAST: Record<string, string> = {
  created: "Member created",
  added: "Added to workspace",
  invited: "Invite sent",
};

export function InviteForm({ workspaceId }: { workspaceId: string }) {
  const [role, setRole] = useState<(typeof ROLES)[number]>("member");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        const result = await addMember(workspaceId, formData);
        toast.success(RESULT_TOAST[result] ?? "Done");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to add member");
      }
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-email">Email</Label>
          <Input id="invite-email" name="email" type="email" required className="w-56" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-name">Full name</Label>
          <Input id="invite-name" name="fullName" className="w-44" placeholder="Optional" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-role">Role</Label>
          <input type="hidden" name="role" value={role} />
          <Select
            value={role}
            items={{ admin: "admin", member: "member", guest: "guest" }}
            onValueChange={(v) => v && setRole(v as (typeof ROLES)[number])}
          >
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
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-password">Password</Label>
          <Input
            id="invite-password"
            name="password"
            type="password"
            minLength={6}
            autoComplete="new-password"
            className="w-56"
            placeholder="Set to create instantly"
          />
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Adding..." : "Add member"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Set a password to create the account instantly and hand over the login. Leave it blank to
        send an email invite instead.
      </p>
    </form>
  );
}
