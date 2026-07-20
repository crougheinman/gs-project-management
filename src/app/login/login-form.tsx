"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressOverlay } from "@/components/progress-overlay";
import { signIn } from "./actions";

// Sign-in only. Public self-registration is disabled (single-org app) - new
// members join via an admin invite from the Members settings page.
export function LoginForm() {
  const router = useRouter();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSigningIn(true);
    try {
      // Sign-in usually resolves in well under a blink; wait for a minimum
      // visible duration too so the overlay doesn't flash imperceptibly.
      await Promise.all([signIn(formData), new Promise((r) => setTimeout(r, 400))]);
      router.push("/");
    } catch (err) {
      setSigningIn(false);
      setError(err instanceof Error ? err.message : "Sign in failed");
    }
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Sign in to your workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={6}
                autoComplete="current-password"
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={signingIn}>
              {signingIn ? "Signing in..." : "Sign in"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Need access? Ask a workspace admin to invite you.
          </p>
        </CardContent>
      </Card>

      <ProgressOverlay
        open={signingIn}
        title="Signing in…"
        stage="Verifying your credentials…"
        stageIndex={1}
        totalStages={1}
      />
    </div>
  );
}
