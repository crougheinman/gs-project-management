"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronRight, Plus, Tag as TagIcon, Trash2, X } from "lucide-react";
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
import type { Profile, Tag, Task, TaskTag } from "@/lib/types";
import { cn } from "@/lib/utils";
import { createTag, createTask, deleteTask, setTaskTag, updateTask } from "../actions";

const UNASSIGNED = "__unassigned__";

export function TaskPanel({
  workspaceId,
  projectId,
  task,
  allTasks,
  taskTags,
  tags,
  members,
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
  onClose: () => void;
  onOpenTask: (taskId: string) => void;
}) {
  const [, startTransition] = useTransition();
  const [newSubtask, setNewSubtask] = useState("");
  const [newTag, setNewTag] = useState("");

  const subtasks = allTasks.filter((t) => t.parent_task_id === task.id);
  const assignedTagIds = new Set(taskTags.filter((tt) => tt.task_id === task.id).map((tt) => tt.tag_id));

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      try {
        await action();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <aside
      aria-label={`Task details: ${task.name}`}
      className="sticky top-20 h-fit max-h-[calc(100dvh-6rem)] w-96 shrink-0 overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-sm"
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
      </div>

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
