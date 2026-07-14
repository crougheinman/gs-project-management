"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { extractMentionIds, logActivity, notify } from "@/lib/activity";
import type { CustomFieldType, SelectOption, TaskType, TiptapDoc } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

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
// Task hierarchy guards (Epic / Task / Subtask) - app-layer validation, same
// style as the dependency cycle check below. Not DB triggers: keeps the
// rules readable and gives friendly error messages.
// ---------------------------------------------------------------------------

async function assertValidHierarchy(
  supabase: SupabaseClient,
  childType: TaskType,
  parentTaskId: string | null,
) {
  if (childType === "epic" && parentTaskId) {
    throw new Error("An Epic can't have a parent");
  }
  if (childType === "subtask" && !parentTaskId) {
    throw new Error("A Subtask needs a parent task");
  }
  if (!parentTaskId) return;

  const { data: parent } = await supabase
    .from("tasks")
    .select("id, task_type")
    .eq("id", parentTaskId)
    .maybeSingle();
  if (!parent) throw new Error("Parent task not found");

  if (childType === "task" && parent.task_type !== "epic") {
    throw new Error("A Task can only be nested under an Epic");
  }
  if (childType === "subtask" && parent.task_type !== "task") {
    throw new Error("A Subtask can only be nested under a Task");
  }
}

// Changing a task's own type must stay compatible with children it already
// has (e.g. an Epic with Task children can't become a Subtask - subtasks
// can't have children at all).
async function assertChildrenStillValid(
  supabase: SupabaseClient,
  taskId: string,
  newType: TaskType,
) {
  const { data: children } = await supabase
    .from("tasks")
    .select("task_type")
    .eq("parent_task_id", taskId);

  for (const child of children ?? []) {
    if (child.task_type === "task" && newType !== "epic") {
      throw new Error(
        "Can't change type: this task has Task children, which require an Epic parent",
      );
    }
    if (child.task_type === "subtask" && newType !== "task") {
      throw new Error(
        "Can't change type: this task has Subtask children, which require a Task parent",
      );
    }
  }
}

// Reparenting: the candidate parent must not be a descendant of the task
// being moved (walking up from the candidate must never reach the task).
async function assertNoParentCycle(
  supabase: SupabaseClient,
  projectId: string,
  taskId: string,
  candidateParentId: string,
) {
  if (candidateParentId === taskId) throw new Error("A task can't be its own parent");

  const { data: rows } = await supabase
    .from("tasks")
    .select("id, parent_task_id")
    .eq("project_id", projectId);
  const parentOf = new Map((rows ?? []).map((r) => [r.id, r.parent_task_id as string | null]));

  let cur: string | null = candidateParentId;
  const seen = new Set<string>();
  while (cur) {
    if (cur === taskId) throw new Error("That would create a circular parent chain");
    if (seen.has(cur)) break;
    seen.add(cur);
    cur = parentOf.get(cur) ?? null;
  }
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
  input: {
    name: string;
    sectionId?: string | null;
    parentTaskId?: string | null;
    taskType?: TaskType;
  },
) {
  const { supabase, user } = await getClient();
  const name = input.name.trim();
  if (!name) throw new Error("Task name is required");
  const taskType: TaskType = input.taskType ?? "task";

  await assertValidHierarchy(supabase, taskType, input.parentTaskId ?? null);

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

  const taskId = crypto.randomUUID();
  const { error } = await supabase.from("tasks").insert({
    id: taskId,
    project_id: projectId,
    section_id: input.parentTaskId ? null : (input.sectionId ?? null),
    parent_task_id: input.parentTaskId ?? null,
    task_type: taskType,
    name,
    position: (last?.position ?? 0) + 1000,
    created_by: user.id,
  });
  if (error) throw new Error(error.message);

  await logActivity(supabase, {
    workspaceId,
    projectId,
    taskId,
    actorId: user.id,
    action: "task.created",
    entityType: "task",
    entityId: taskId,
    metadata: { name },
  });

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
    task_type?: TaskType;
    parent_task_id?: string | null;
  },
) {
  const { supabase, user } = await getClient();

  // Hierarchy changes need the current row to resolve whichever of
  // task_type/parent_task_id wasn't touched by this patch.
  if (patch.task_type !== undefined || patch.parent_task_id !== undefined) {
    const { data: current } = await supabase
      .from("tasks")
      .select("task_type, parent_task_id")
      .eq("id", taskId)
      .single();
    if (!current) throw new Error("Task not found");

    const resolvedType = patch.task_type ?? (current.task_type as TaskType);
    const resolvedParent =
      patch.parent_task_id !== undefined ? patch.parent_task_id : current.parent_task_id;

    await assertValidHierarchy(supabase, resolvedType, resolvedParent);

    if (patch.task_type !== undefined && patch.task_type !== current.task_type) {
      await assertChildrenStillValid(supabase, taskId, patch.task_type);
    }
    if (patch.parent_task_id !== undefined && patch.parent_task_id) {
      await assertNoParentCycle(supabase, projectId, taskId, patch.parent_task_id);
    }
  }

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
  // Parented tasks don't belong to a section (matches createTask's rule).
  if (patch.parent_task_id) {
    update.section_id = null;
  }

  const { error } = await supabase.from("tasks").update(update).eq("id", taskId);
  if (error) throw new Error(error.message);

  // Activity + notifications for the changes worth narrating.
  const { data: task } = await supabase
    .from("tasks")
    .select("name")
    .eq("id", taskId)
    .maybeSingle();
  const taskName = task?.name ?? "a task";

  if (patch.completed !== undefined) {
    await logActivity(supabase, {
      workspaceId,
      projectId,
      taskId,
      actorId: user.id,
      action: patch.completed ? "task.completed" : "task.uncompleted",
      entityType: "task",
      entityId: taskId,
      metadata: { name: taskName },
    });
  }

  if (patch.assignee_id !== undefined) {
    await logActivity(supabase, {
      workspaceId,
      projectId,
      taskId,
      actorId: user.id,
      action: patch.assignee_id ? "task.assigned" : "task.unassigned",
      entityType: "task",
      entityId: taskId,
      metadata: { name: taskName, assignee_id: patch.assignee_id },
    });
    if (patch.assignee_id) {
      await notify(supabase, {
        recipientIds: [patch.assignee_id],
        actorId: user.id,
        type: "assigned",
        projectId,
        taskId,
        message: `assigned you "${taskName}"`,
      });
    }
  }

  if (patch.due_date !== undefined) {
    await logActivity(supabase, {
      workspaceId,
      projectId,
      taskId,
      actorId: user.id,
      action: "task.due_date_changed",
      entityType: "task",
      entityId: taskId,
      metadata: { name: taskName, due_date: patch.due_date },
    });
  }

  revalidatePath(projectPath(workspaceId, projectId));
}

// Board drag-and-drop: move a task to a section at a spot between two
// neighbors. Fractional positioning; rebalances the section when the gap
// between neighbors gets too small to split.
export async function moveTask(
  workspaceId: string,
  projectId: string,
  taskId: string,
  target: { sectionId: string | null; prevTaskId?: string | null; nextTaskId?: string | null },
) {
  const { supabase } = await getClient();

  async function positionOf(id: string | null | undefined) {
    if (!id) return null;
    const { data } = await supabase.from("tasks").select("position").eq("id", id).maybeSingle();
    return data?.position ?? null;
  }

  let prev = await positionOf(target.prevTaskId);
  let next = await positionOf(target.nextTaskId);

  const tooTight = prev !== null && next !== null && next - prev < 1e-6;
  if (tooTight) {
    // Rebalance: renumber the target section's tasks to evenly spaced values.
    const { data: rows } = await supabase
      .from("tasks")
      .select("id")
      .eq("project_id", projectId)
      .is("parent_task_id", null)
      .filter("section_id", target.sectionId ? "eq" : "is", target.sectionId)
      .order("position");
    for (const [i, row] of (rows ?? []).entries()) {
      await supabase.from("tasks").update({ position: (i + 1) * 1000 }).eq("id", row.id);
    }
    prev = await positionOf(target.prevTaskId);
    next = await positionOf(target.nextTaskId);
  }

  let position: number;
  if (prev !== null && next !== null) position = (prev + next) / 2;
  else if (prev !== null) position = prev + 1000;
  else if (next !== null) position = next / 2;
  else position = 1000;

  const { error } = await supabase
    .from("tasks")
    .update({ section_id: target.sectionId, position })
    .eq("id", taskId);
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

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

// body travels as a JSON string: Next's server-action serializer was
// observed dropping nested `attrs` objects from the Tiptap doc, which
// silently killed mentions.
export async function createComment(
  workspaceId: string,
  projectId: string,
  taskId: string,
  bodyJson: string,
) {
  const { supabase, user } = await getClient();
  const body = JSON.parse(bodyJson) as TiptapDoc;

  const commentId = crypto.randomUUID();
  const { error } = await supabase.from("comments").insert({
    id: commentId,
    task_id: taskId,
    author_id: user.id,
    body,
  });
  if (error) throw new Error(error.message);

  const mentionIds = extractMentionIds(body);
  if (mentionIds.length > 0) {
    await supabase.from("comment_mentions").insert(
      mentionIds.map((mentioned_user_id) => ({ comment_id: commentId, mentioned_user_id })),
    );
  }

  const { data: task } = await supabase
    .from("tasks")
    .select("name, assignee_id, created_by")
    .eq("id", taskId)
    .maybeSingle();
  const taskName = task?.name ?? "a task";

  await logActivity(supabase, {
    workspaceId,
    projectId,
    taskId,
    actorId: user.id,
    action: "comment.created",
    entityType: "comment",
    entityId: commentId,
    metadata: { name: taskName },
  });

  if (mentionIds.length > 0) {
    await notify(supabase, {
      recipientIds: mentionIds,
      actorId: user.id,
      type: "mentioned",
      projectId,
      taskId,
      commentId,
      message: `mentioned you on "${taskName}"`,
    });
  }
  await notify(supabase, {
    // assignee + task creator, minus anyone already notified via mention
    recipientIds: [task?.assignee_id, task?.created_by].filter(
      (id) => !id || !mentionIds.includes(id),
    ),
    actorId: user.id,
    type: "comment_added",
    projectId,
    taskId,
    commentId,
    message: `commented on "${taskName}"`,
  });

  revalidatePath(projectPath(workspaceId, projectId));
}

export async function deleteComment(workspaceId: string, projectId: string, commentId: string) {
  const { supabase } = await getClient();
  const { error } = await supabase.from("comments").delete().eq("id", commentId);
  if (error) throw new Error(error.message);
  revalidatePath(projectPath(workspaceId, projectId));
}

// ---------------------------------------------------------------------------
// Attachments (file itself is uploaded client-side; this records metadata)
// ---------------------------------------------------------------------------

export async function addAttachmentRecord(
  workspaceId: string,
  projectId: string,
  taskId: string,
  file: { storagePath: string; fileName: string; fileSize: number; mimeType: string },
) {
  const { supabase, user } = await getClient();

  const { error } = await supabase.from("attachments").insert({
    task_id: taskId,
    uploaded_by: user.id,
    storage_path: file.storagePath,
    file_name: file.fileName,
    file_size: file.fileSize,
    mime_type: file.mimeType,
  });
  if (error) throw new Error(error.message);

  await logActivity(supabase, {
    workspaceId,
    projectId,
    taskId,
    actorId: user.id,
    action: "attachment.added",
    entityType: "attachment",
    metadata: { file_name: file.fileName },
  });

  revalidatePath(projectPath(workspaceId, projectId));
}

export async function deleteAttachment(
  workspaceId: string,
  projectId: string,
  attachmentId: string,
  storagePath: string,
) {
  const { supabase } = await getClient();
  const { error } = await supabase.from("attachments").delete().eq("id", attachmentId);
  if (error) throw new Error(error.message);
  await supabase.storage.from("attachments").remove([storagePath]);
  revalidatePath(projectPath(workspaceId, projectId));
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

// ---------------------------------------------------------------------------
// Custom fields
// ---------------------------------------------------------------------------

export async function createCustomField(
  workspaceId: string,
  projectId: string,
  input: { name: string; fieldType: CustomFieldType; options?: SelectOption[] },
) {
  const { supabase } = await getClient();
  const name = input.name.trim();
  if (!name) throw new Error("Field name is required");

  const { data: last } = await supabase
    .from("custom_fields")
    .select("position")
    .eq("project_id", projectId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("custom_fields").insert({
    project_id: projectId,
    name,
    field_type: input.fieldType,
    options: input.options ?? [],
    position: (last?.position ?? 0) + 1000,
  });
  if (error) throw new Error(error.message);
  revalidatePath(projectPath(workspaceId, projectId));
}

export async function deleteCustomField(
  workspaceId: string,
  projectId: string,
  fieldId: string,
) {
  const { supabase } = await getClient();
  const { error } = await supabase.from("custom_fields").delete().eq("id", fieldId);
  if (error) throw new Error(error.message);
  revalidatePath(projectPath(workspaceId, projectId));
}

// Upsert a task's value for one field. `patch` uses the typed value column
// matching the field type; caller passes exactly one populated key.
export async function setCustomFieldValue(
  workspaceId: string,
  projectId: string,
  fieldId: string,
  taskId: string,
  patch: {
    value_text?: string | null;
    value_number?: number | null;
    value_date?: string | null;
    value_boolean?: boolean | null;
    value_option_ids?: string[] | null;
    value_user_id?: string | null;
  },
) {
  const { supabase } = await getClient();
  const { error } = await supabase
    .from("custom_field_values")
    .upsert(
      { custom_field_id: fieldId, task_id: taskId, ...patch },
      { onConflict: "custom_field_id,task_id" },
    );
  if (error) throw new Error(error.message);
  revalidatePath(projectPath(workspaceId, projectId));
}

// ---------------------------------------------------------------------------
// Task dependencies (task is blocked by dependsOnTaskId)
// ---------------------------------------------------------------------------

export async function addDependency(
  workspaceId: string,
  projectId: string,
  taskId: string,
  dependsOnTaskId: string,
) {
  const { supabase } = await getClient();
  if (taskId === dependsOnTaskId) throw new Error("A task can't depend on itself");

  // Cycle check: dependsOnTaskId must not (transitively) already depend on
  // taskId. Walk the blocker graph starting from dependsOnTaskId.
  const { data: edges } = await supabase
    .from("task_dependencies")
    .select("task_id, depends_on_task_id, tasks!task_dependencies_task_id_fkey!inner(project_id)")
    .eq("tasks.project_id", projectId);

  const blockers = new Map<string, string[]>();
  for (const e of (edges ?? []) as { task_id: string; depends_on_task_id: string }[]) {
    const list = blockers.get(e.task_id) ?? [];
    list.push(e.depends_on_task_id);
    blockers.set(e.task_id, list);
  }
  // does dependsOnTaskId reach taskId through its own blockers?
  const seen = new Set<string>();
  const stack = [dependsOnTaskId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === taskId) throw new Error("That would create a circular dependency");
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(blockers.get(cur) ?? []));
  }

  const { error } = await supabase
    .from("task_dependencies")
    .insert({ task_id: taskId, depends_on_task_id: dependsOnTaskId });
  if (error) throw new Error(error.message);
  revalidatePath(projectPath(workspaceId, projectId));
}

export async function removeDependency(
  workspaceId: string,
  projectId: string,
  dependencyId: string,
) {
  const { supabase } = await getClient();
  const { error } = await supabase.from("task_dependencies").delete().eq("id", dependencyId);
  if (error) throw new Error(error.message);
  revalidatePath(projectPath(workspaceId, projectId));
}
