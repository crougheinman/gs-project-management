"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { signOut, updateProfile } from "@/app/w/[workspaceId]/actions";

function splitName(fullName: string | null): [string, string] {
  if (!fullName) return ["", ""];
  const parts = fullName.trim().split(/\s+/);
  return [parts[0] ?? "", parts.slice(1).join(" ")];
}

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export function ProfileMenu({
  workspaceId,
  email,
  fullName,
  avatarUrl,
}: {
  workspaceId: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [profileOpen, setProfileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [firstName, lastName] = splitName(fullName);
  const initials = (firstName[0] ?? "") + (lastName[0] ?? "") || email[0]?.toUpperCase() || "?";

  function handleProfileSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        await updateProfile(workspaceId, formData);
        toast.success("Profile updated");
        setProfileOpen(false);
        setAvatarPreview(null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update profile");
      }
    });
  }

  function handlePasswordSubmit(formData: FormData) {
    const password = formData.get("password") as string;
    const confirm = formData.get("confirm") as string;
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match");
      return;
    }
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Password changed");
      setPasswordOpen(false);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button aria-label="Account menu" className="cursor-pointer rounded-full">
              <Avatar>
                <AvatarImage src={avatarUrl ?? undefined} alt="" />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <p className="truncate text-sm font-medium text-foreground">{fullName || email}</p>
              <p className="truncate text-xs font-normal text-muted-foreground">{email}</p>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setProfileOpen(true)}>Edit profile</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPasswordOpen(true)}>
            Change password
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => startTransition(() => signOut())}>
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
          </DialogHeader>
          <form action={handleProfileSubmit} className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="relative cursor-pointer"
                aria-label="Change avatar"
              >
                <Avatar size="lg">
                  <AvatarImage src={avatarPreview ?? avatarUrl ?? undefined} alt="" />
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Pencil className="size-3" aria-hidden="true" />
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                name="avatar"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > MAX_AVATAR_BYTES) {
                    toast.error("Avatar must be under 2MB");
                    e.target.value = "";
                    return;
                  }
                  setAvatarPreview(URL.createObjectURL(file));
                }}
              />
              <p className="text-xs text-muted-foreground">Click the avatar to change it</p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="first-name">First name</Label>
              <Input id="first-name" name="first_name" defaultValue={firstName} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="last-name">Last name</Label>
              <Input id="last-name" name="last_name" defaultValue={lastName} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
          </DialogHeader>
          <form action={handlePasswordSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-password">New password</Label>
              <Input id="new-password" name="password" type="password" required minLength={8} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input id="confirm-password" name="confirm" type="password" required minLength={8} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
