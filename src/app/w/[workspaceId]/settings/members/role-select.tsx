"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateMemberRole } from "./actions";

const ROLES = ["admin", "member", "guest"] as const;

export function RoleSelect({
  workspaceId,
  userId,
  role,
  disabled,
}: {
  workspaceId: string;
  userId: string;
  role: string;
  disabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Select
      value={role}
      disabled={disabled || isPending}
      onValueChange={(v) => {
        if (!v || v === role) return;
        startTransition(async () => {
          try {
            await updateMemberRole(workspaceId, userId, v);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to update role");
          }
        });
      }}
    >
      <SelectTrigger aria-label="Member role" className="h-8 w-28 text-xs">
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
  );
}
