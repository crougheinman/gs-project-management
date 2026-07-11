"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { removeMember, setMemberPassword } from "./actions";

export function MemberActions({
  workspaceId,
  userId,
  email,
}: {
  workspaceId: string;
  userId: string;
  email: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [open, setOpen] = useState(false);

  function run(action: () => Promise<unknown>, onDone?: () => void) {
    startTransition(async () => {
      try {
        await action();
        onDone?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label={`Set password for ${email}`}>
              <KeyRound aria-hidden="true" />
            </Button>
          }
        />
        <PopoverContent className="w-64" align="end">
          <Label htmlFor={`pw-${userId}`} className="text-xs">
            New password for {email}
          </Label>
          <Input
            id={`pw-${userId}`}
            type="password"
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 h-8 text-sm"
            placeholder="At least 6 characters"
          />
          <Button
            size="sm"
            className="mt-2 w-full"
            disabled={isPending || password.trim().length < 6}
            onClick={() =>
              run(
                () => setMemberPassword(workspaceId, userId, password),
                () => {
                  setPassword("");
                  setOpen(false);
                  toast.success("Password updated");
                },
              )
            }
          >
            {isPending ? "Saving..." : "Set password"}
          </Button>
        </PopoverContent>
      </Popover>

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Remove ${email} from workspace`}
        onClick={() => {
          if (confirm(`Remove ${email} from this workspace?`)) {
            run(
              () => removeMember(workspaceId, userId),
              () => toast.success("Member removed"),
            );
          }
        }}
      >
        <Trash2 aria-hidden="true" />
      </Button>
    </div>
  );
}
