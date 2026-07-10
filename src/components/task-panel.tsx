"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronRight,
  Download,
  Paperclip,
  Plus,
  Tag as TagIcon,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ActivityEntry,
  Attachment,
  Comment,
  CustomField,
  CustomFieldValue,
  Profile,
  Tag,
  Task,
  TaskDependency,
  TaskTag,
  TiptapDoc,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  addAttachmentRecord,
  addDependency,
  createComment,
  createTag,
  createTask,
  deleteAttachment,
  deleteComment,
  deleteTask,
  removeDependency,
  setCustomFieldValue,
  setTaskTag,
  updateTask,
} from "@/app/w/[workspaceId]/p/[projectId]/actions";
import { CommentEditor } from "@/components/comment-editor";
import { CommentBody } from "@/components/comment-body";
import { CustomFieldInput } from "@/components/custom-field-input";

const UNASSIGNED = "__unassigned__";

const ACTIVITY_LABELS: Record<string, string> = {
  "task.created": "created this task",
  "task.completed": "marked this task complete",
  "task.uncompleted": "marked this task incomplete",
  "task.assigned": "changed the assignee",
  "task.unassigned": "removed the assignee",
  "task.due_date_changed": "changed the due date",
  "comment.created": "commented",
  "attachment.added": "added an attachment",
};

export function TaskPanel({
  workspaceId,
  projectId,
  task,
  allTasks,
  taskTags,
  tags,
  members,
  comments,
  attachments,
  activity,
  customFields,
  customFieldValues,
  dependencies,
  currentUserId,
  onClose,
  onOpenTask,
}: {
  workspaceId: string;
  projectId: string;
  task: Task;
  allTasks: Task[];
  taskTags: TaskTag[];
  tags: Tag[];
  members: Profile[];
  comments: Comment[];
  attachments: Attachment[];
  activity: ActivityEntry[];
  customFields: CustomField[];
  customFieldValues: CustomFieldValue[];
  dependencies: TaskDependency[];
  currentUserId: string | null;
  onClose: () => void;
  onOpenTask: (taskId: string) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newSubtask, setNewSubtask] = useState("");
  const [newTag, setNewTag] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const subtasks = allTasks.filter((t) => t.parent_task_id === task.id);
  const assignedTagIds = new Set(
    taskTags.filter((tt) => tt.task_id === task.id).map((tt) => tt.tag_id),
  );
  const taskComments = comments.filter((c) => c.task_id === task.id);
  const taskAttachments = attachments.filter((a) => a.task_id === task.id);
  const valueFor = (fieldId: string) =>
    customFieldValues.find((v) => v.custom_field_id === fieldId && v.task_id === task.id);
  // Blockers of this task, and which are still incomplete.
  const blockerDeps = dependencies.filter((d) => d.task_id === task.id);
  const blockedByDeps = dependencies.filter((d) => d.depends_on_task_id === task.id);
  const taskById = new Map(allTasks.map((t) => [t.id, t]));
  const addableBlockers = allTasks.filter(
    (t) =>
      t.id !== task.id &&
      !t.parent_task_id &&
      !blockerDeps.some((d) => d.depends_on_task_id === t.id),
  );
  const taskActivity = activity
    .filter((a) => a.task_id === task.id && a.action !== "comment.created")
    .slice(0, 15)
    .reverse();

  // Live comments while the panel is open.
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`comments-${task.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments", filter: `task_id=eq.${task.id}` },
        () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => router.refresh(), 300);
        },
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [task.id, router]);

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      try {
        await action();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const supabase = createClient();
      const path = `${projectId}/${task.id}/${crypto.randomUUID()}-${file.name}`;
      const { error } = await supabase.storage.from("attachments").upload(path, file);
      if (error) throw new Error(error.message);
      await addAttachmentRecord(workspaceId, projectId, task.id, {
        storagePath: path,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      });
      toast.success("File attached");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(attachment: Attachment) {
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from("attachments")
      .createSignedUrl(attachment.storage_path, 60);
    if (error || !data) {
      toast.error("Could not create download link");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  function memberName(id: string | null | undefined) {
    const m = members.find((x) => x.id === id);
    return m?.full_name || m?.email || "Someone";
  }

  return (
    <aside
      aria-label={`Task details: ${task.name}`}
      className="sticky top-20 flex h-fit max-h-[calc(100dvh-6rem)] w-96 shrink-0 flex-col overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <Button
          variant={task.completed ? "secondary" : "outline"}
          size="sm"
          onClick={() =>
            run(() => updateTask(workspaceId, projectId, task.id, { completed: !task.completed }))
          }
        >
          {task.completed ? "Completed" : "Mark complete"}
        </Button>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete task"
            onClick={() => {
              if (confirm(`Delete task "${task.name}"? Subtasks are deleted too.`)) {
                onClose();
                run(() => deleteTask(workspaceId, projectId, task.id));
              }
            }}
          >
            <Trash2 aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Close panel" onClick={onClose}>
            <X aria-hidden="true" />
          </Button>
        </div>
      </div>

      <textarea
        defaultValue={task.name}
        aria-label="Task name"
        rows={1}
        className={cn(
          "mt-3 w-full resize-none rounded bg-transparent text-lg font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
          task.completed && "text-muted-foreground line-through",
        )}
        onBlur={(e) => {
          const value = e.target.value.trim();
          if (value && value !== task.name) {
            run(() => updateTask(workspaceId, projectId, task.id, { name: value }));
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
      />

      <div className="mt-4 flex flex-col gap-3 text-sm">
        <div className="grid grid-cols-[90px_1fr] items-center gap-2">
          <span className="text-muted-foreground">Assignee</span>
          <Select
            value={task.assignee_id ?? UNASSIGNED}
            onValueChange={(v) =>
              run(() =>
                updateTask(workspaceId, projectId, task.id, {
                  assignee_id: v === UNASSIGNED ? null : v,
                }),
              )
            }
          >
            <SelectTrigger aria-label="Assignee" className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.full_name || m.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-[90px_1fr] items-center gap-2">
          <span className="text-muted-foreground">Due date</span>
          <input
            type="date"
            value={task.due_date ?? ""}
            aria-label="Due date"
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(e) =>
              run(() =>
                updateTask(workspaceId, projectId, task.id, {
                  due_date: e.target.value || null,
                }),
              )
            }
          />
        </div>

        <div className="grid grid-cols-[90px_1fr] items-start gap-2">
          <span className="pt-1 text-muted-foreground">Tags</span>
          <div className="flex flex-wrap items-center gap-1">
            {tags.map((tag) => {
              const assigned = assignedTagIds.has(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  aria-pressed={assigned}
                  aria-label={`Tag ${tag.name}${assigned ? " (assigned)" : ""}`}
                  className="cursor-pointer"
                  onClick={() =>
                    run(() => setTaskTag(workspaceId, projectId, task.id, tag.id, !assigned))
                  }
                >
                  <Badge variant={assigned ? "default" : "outline"}>
                    <TagIcon aria-hidden="true" />
                    {tag.name}
                  </Badge>
                </button>
              );
            })}
            <input
              value={newTag}
              placeholder="New tag"
              aria-label="New tag name"
              className="h-6 w-20 rounded bg-transparent px-1 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTag.trim()) {
                  const name = newTag.trim();
                  setNewTag("");
                  run(async () => {
                    const tagId = await createTag(workspaceId, projectId, name);
                    await setTaskTag(workspaceId, projectId, task.id, tagId, true);
                  });
                }
              }}
            />
          </div>
        </div>

        {customFields.map((field) => (
          <div key={field.id} className="grid grid-cols-[90px_1fr] items-center gap-2">
            <span className="truncate text-muted-foreground">{field.name}</span>
            <CustomFieldInput
              field={field}
              value={valueFor(field.id)}
              members={members}
              onChange={(patch) =>
                run(() => setCustomFieldValue(workspaceId, projectId, field.id, task.id, patch))
              }
            />
          </div>
        ))}
      </div>

      <Separator className="my-4" />

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Blocked by</h3>
        <Select
          value=""
          onValueChange={(v) => v && run(() => addDependency(workspaceId, projectId, task.id, v))}
        >
          <SelectTrigger aria-label="Add blocker" className="h-7 w-40 text-xs">
            <SelectValue placeholder="Add blocker" />
          </SelectTrigger>
          <SelectContent>
            {addableBlockers.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {blockerDeps.length > 0 && (
        <ul className="mt-1 flex flex-col gap-1">
          {blockerDeps.map((dep) => {
            const blocker = taskById.get(dep.depends_on_task_id);
            if (!blocker) return null;
            return (
              <li key={dep.id} className="group flex items-center gap-2 text-sm">
                <Checkbox checked={blocker.completed} disabled aria-hidden="true" />
                <button
                  type="button"
                  className={cn(
                    "min-w-0 flex-1 cursor-pointer truncate text-left underline-offset-4 hover:underline",
                    blocker.completed ? "text-muted-foreground line-through" : "text-foreground",
                  )}
                  onClick={() => onOpenTask(blocker.id)}
                >
                  {blocker.name}
                </button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove blocker ${blocker.name}`}
                  className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => run(() => removeDependency(workspaceId, projectId, dep.id))}
                >
                  <X aria-hidden="true" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {blockedByDeps.length > 0 && (
        <div className="mt-2">
          <h3 className="text-sm font-medium text-foreground">Blocking</h3>
          <ul className="mt-1 flex flex-col gap-1">
            {blockedByDeps.map((dep) => {
              const blocked = taskById.get(dep.task_id);
              if (!blocked) return null;
              return (
                <li key={dep.id} className="text-sm">
                  <button
                    type="button"
                    className="cursor-pointer truncate text-left text-foreground underline-offset-4 hover:underline"
                    onClick={() => onOpenTask(blocked.id)}
                  >
                    {blocked.name}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <Separator className="my-4" />

      <label htmlFor="task-description" className="text-sm text-muted-foreground">
        Description
      </label>
      <Textarea
        id="task-description"
        defaultValue={task.description?.text ?? ""}
        placeholder="Add more detail..."
        className="mt-1 min-h-24"
        onBlur={(e) => {
          const text = e.target.value.trim();
          const current = task.description?.text ?? "";
          if (text !== current) {
            run(() =>
              updateTask(workspaceId, projectId, task.id, {
                description: text ? { text } : null,
              }),
            );
          }
        }}
      />

      <Separator className="my-4" />

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Attachments</h3>
        <input
          ref={fileInputRef}
          type="file"
          className="sr-only"
          aria-label="Upload attachment"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
            e.target.value = "";
          }}
        />
        <Button
          variant="ghost"
          size="sm"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip aria-hidden="true" />
          {uploading ? "Uploading..." : "Attach"}
        </Button>
      </div>
      {taskAttachments.length > 0 && (
        <ul className="mt-1 flex flex-col gap-1">
          {taskAttachments.map((a) => (
            <li key={a.id} className="group flex items-center gap-2 text-sm">
              <button
                type="button"
                className="min-w-0 flex-1 cursor-pointer truncate text-left text-foreground underline-offset-4 hover:underline"
                onClick={() => handleDownload(a)}
              >
                {a.file_name}
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Download ${a.file_name}`}
                onClick={() => handleDownload(a)}
              >
                <Download aria-hidden="true" />
              </Button>
              {a.uploaded_by === currentUserId && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${a.file_name}`}
                  className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() =>
                    run(() => deleteAttachment(workspaceId, projectId, a.id, a.storage_path))
                  }
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Separator className="my-4" />

      <h3 className="text-sm font-medium text-foreground">Subtasks</h3>
      <ul className="mt-2 flex flex-col gap-1">
        {subtasks.map((sub) => (
          <li key={sub.id} className="group flex items-center gap-2">
            <Checkbox
              checked={sub.completed}
              aria-label={sub.completed ? "Mark subtask incomplete" : "Mark subtask complete"}
              onCheckedChange={(checked) =>
                run(() =>
                  updateTask(workspaceId, projectId, sub.id, { completed: checked === true }),
                )
              }
            />
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-sm",
                sub.completed && "text-muted-foreground line-through",
              )}
            >
              {sub.name}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Open subtask ${sub.name}`}
              className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100"
              onClick={() => onOpenTask(sub.id)}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
      <div className="mt-1 flex items-center gap-2">
        <Plus className="size-4 text-muted-foreground" aria-hidden="true" />
        <input
          value={newSubtask}
          placeholder="Add subtask"
          aria-label="Add subtask"
          className="flex-1 rounded bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(e) => setNewSubtask(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newSubtask.trim()) {
              const name = newSubtask.trim();
              setNewSubtask("");
              run(() => createTask(workspaceId, projectId, { name, parentTaskId: task.id }));
            }
          }}
        />
      </div>

      <Separator className="my-4" />

      {taskActivity.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          {taskActivity.map((entry) => (
            <li key={entry.id}>
              <span className="font-medium text-foreground">
                {entry.actor?.full_name || entry.actor?.email || "Someone"}
              </span>{" "}
              {ACTIVITY_LABELS[entry.action] ?? entry.action}
              <span className="ml-1">{new Date(entry.created_at).toLocaleDateString()}</span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="mt-3 text-sm font-medium text-foreground">Comments</h3>
      <ul className="mt-2 flex flex-col gap-3">
        {taskComments.map((comment) => (
          <li key={comment.id} className="group">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-foreground">
                {comment.author?.full_name || comment.author?.email || memberName(comment.author_id)}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                {new Date(comment.created_at).toLocaleString()}
                {comment.author_id === currentUserId && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Delete comment"
                    className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => run(() => deleteComment(workspaceId, projectId, comment.id))}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                )}
              </span>
            </div>
            <div className="mt-0.5">
              <CommentBody body={comment.body} />
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-3">
        <CommentEditor
          members={members}
          submitting={isPending}
          onSubmit={(body: TiptapDoc) =>
            run(() => createComment(workspaceId, projectId, task.id, JSON.stringify(body)))
          }
        />
      </div>

      {task.parent_task_id && (
        <button
          type="button"
          className="mt-4 cursor-pointer text-xs text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => onOpenTask(task.parent_task_id!)}
        >
          Go to parent task
        </button>
      )}
    </aside>
  );
}
