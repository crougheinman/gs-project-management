"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// All actions rely on RLS as the enforcement layer; errors surface as
// thrown messages the client toasts.

async function getClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

function projectPath(workspaceId: string, projectId: string) {
  return `/w/${workspaceId}/p/${projectId}`;
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export async function createSection(workspaceId: string, projectId: string, name: string) {
  const { supabase } = await getClient();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Section name is required");

  const { data: last } = await supabase
    .from("sections")
    .select("position")
    .eq("project_id", projectId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("sections").insert({
    project_id: projectId,
    name: trimmed,
    position: (last?.position ?? 0) + 1000,
  });
  if (error) throw new Error(error.message);
  revalidatePath(projectPath(workspaceId, projectId));
}

export async function renameSection(
  workspaceId: string,
  projectId: string,
  sectionId: string,
  name: string,
) {
  const { supabase } = await getClient();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Section name is required");
  const { error } = await supabase.from("sections").update({ name: trimmed }).eq("id", sectionId);
  if (error) throw new Error(error.message);
  revalidatePath(projectPath(workspaceId, projectId));
}

export async function deleteSection(workspaceId: string, projectId: string, sectionId: string) {
  const { supabase } = await getClient();
  // Tasks in the section survive (section_id set null by FK).
  const { error } = await supabase.from("sections").delete().eq("id", sectionId);
  if (error) throw new Error(error.message);
  revalidatePath(projectPath(workspaceId, projectId));
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function createTask(
  workspaceId: string,
  projectId: string,
  input: { name: string; sectionId?: string | null; parentTaskId?: string | null },
) {
  const { supabase, user } = await getClient();
  const name = input.name.trim();
  if (!name) throw new Error("Task name is required");

  let positionQuery = supabase
    .from("tasks")
    .select("position")
    .eq("project_id", projectId)
    .order("position", { ascending: false })
    .limit(1);
  if (input.parentTaskId) {
    positionQuery = positionQuery.eq("parent_task_id", input.parentTaskId);
  } else if (input.sectionId) {
    positionQuery = positionQuery.eq("section_id", input.sectionId);
  }
  const { data: last } = await positionQuery.maybeSingle();

  const { error } = await supabase.from("tasks").insert({
    project_id: projectId,
    section_id: input.parentTaskId ? null : (input.sectionId ?? null),
    parent_task_id: input.parentTaskId ?? null,
    name,
    position: (last?.position ?? 0) + 1000,
    created_by: user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath(projectPath(workspaceId, projectId));
}

export async function updateTask(
  workspaceId: string,
  projectId: string,
  taskId: string,
  patch: {
    name?: string;
    completed?: boolean;
    assignee_id?: string | null;
    due_date?: string | null;
    start_date?: string | null;
    section_id?: string | null;
    description?: { text: string } | null;
  },
) {
  const { supabase, user } = await getClient();

  const update: Record<string, unknown> = { ...patch };
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) throw new Error("Task name is required");
    update.name = trimmed;
  }
  if (patch.completed !== undefined) {
    update.completed_at = patch.completed ? new Date().toISOString() : null;
    update.completed_by = patch.completed ? user.id : null;
  }

  const { error } = await supabase.from("tasks").update(update).eq("id", taskId);
  if (error) throw new Error(error.message);
  revalidatePath(projectPath(workspaceId, projectId));
}

export async function deleteTask(workspaceId: string, projectId: string, taskId: string) {
  const { supabase } = await getClient();
  // Subtasks cascade via parent_task_id FK.
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) throw new Error(error.message);
  revalidatePath(projectPath(workspaceId, projectId));
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export async function createTag(
  workspaceId: string,
  projectId: string,
  name: string,
): Promise<string> {
  const { supabase } = await getClient();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Tag name is required");

  // Id generated app-side to avoid INSERT ... RETURNING under RLS (see
  // createProject in ../actions.ts).
  const tagId = crypto.randomUUID();
  const { error } = await supabase
    .from("tags")
    .insert({ id: tagId, workspace_id: workspaceId, name: trimmed });
  if (error) throw new Error(error.message);
  revalidatePath(projectPath(workspaceId, projectId));
  return tagId;
}

export async function setTaskTag(
  workspaceId: string,
  projectId: string,
  taskId: string,
  tagId: string,
  assigned: boolean,
) {
  const { supabase } = await getClient();
  const { error } = assigned
    ? await supabase.from("task_tags").insert({ task_id: taskId, tag_id: tagId })
    : await supabase.from("task_tags").delete().eq("task_id", taskId).eq("tag_id", tagId);
  if (error) throw new Error(error.message);
  revalidatePath(projectPath(workspaceId, projectId));
}
