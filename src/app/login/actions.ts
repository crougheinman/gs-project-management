"use server";

import { createClient } from "@/lib/supabase/server";

export async function signIn(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  // Navigation happens client-side (see login-form.tsx) rather than via
  // redirect() here - redirect() throws internally, and the client call site
  // wraps this action in try/catch to toast real errors, which would
  // otherwise catch and surface the redirect's own throw as a fake error.
}
