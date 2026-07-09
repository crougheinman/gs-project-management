"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ChevronRight, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Profile, Section, Task } from "@/lib/types";
import type { ProjectPageData } from "@/lib/tasks/page-data";
import { cn } from "@/lib/utils";
import {
  createSection,
  createTask,
  deleteSection,
  renameSection,
  updateTask,
} from "../actions";
import { TaskPanel } from "@/components/task-panel";

type ListViewProps = {
  workspaceId: string;
  projectId: string;
} & ProjectPageData;

const UNASSIGNED = "__unassigned__";

export function ListView(props: ListViewProps) {
  const { workspaceId, projectId, sections, tasks, members } = props;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const openTaskId = searchParams.get("task");
  const openTask = openTaskId ? tasks.find((t) => t.id === openTaskId) : undefined;

  const topLevel = tasks.filter((t) => !t.parent_task_id);
  const noSection = topLevel.filter((t) => !t.section_id);

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      try {
        await action();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  function openPanel(taskId: string) {
    router.push(`${pathname}?task=${taskId}`, { scroll: false });
  }

  function closePanel() {
    router.push(pathname, { scroll: false });
  }

  return (
    <div className="flex gap-6">
      <div className="min-w-0 flex-1 pb-16">
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            {/* column headers */}
            <div className="grid grid-cols-[minmax(240px,1fr)_160px_140px_40px] items-center gap-2 border-b border-border px-2 pb-2 text-xs font-medium text-muted-foreground">
              <span>Task</span>
              <span>Assignee</span>
              <span>Due date</span>
              <span />
            </div>

            {sections.map((section) => (
              <SectionGroup
                key={section.id}
                section={section}
                tasks={topLevel.filter((t) => t.section_id === section.id)}
                members={members}
                onOpen={openPanel}
                run={run}
                workspaceId={workspaceId}
                projectId={projectId}
              />
            ))}

            {noSection.length > 0 && (
              <SectionGroup
                section={null}
                tasks={noSection}
                members={members}
                onOpen={openPanel}
                run={run}
                workspaceId={workspaceId}
                projectId={projectId}
              />
            )}

            <AddSection workspaceId={workspaceId} projectId={projectId} run={run} />
          </div>
        </div>
      </div>

      {openTask && (
        <TaskPanel
          key={openTask.id}
          workspaceId={workspaceId}
          projectId={projectId}
          task={openTask}
          allTasks={props.tasks}
          taskTags={props.taskTags}
          tags={props.tags}
          members={members}
          comments={props.comments}
          attachments={props.attachments}
          activity={props.activity}
          currentUserId={props.currentUserId}
          onClose={closePanel}
          onOpenTask={openPanel}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function SectionGroup({
  section,
  tasks,
  members,
  onOpen,
  run,
  workspaceId,
  projectId,
}: {
  section: Section | null;
  tasks: Task[];
  members: Profile[];
  onOpen: (taskId: string) => void;
  run: (action: () => Promise<unknown>) => void;
  workspaceId: string;
  projectId: string;
}) {
  return (
    <section className="mt-4">
      <div className="group flex items-center gap-2 px-2 py-1">
        {section ? (
          <>
            <input
              defaultValue={section.name}
              aria-label="Section name"
              className="w-auto rounded bg-transparent text-sm font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onBlur={(e) => {
                const value = e.target.value.trim();
                if (value && value !== section.name) {
                  run(() => renameSection(workspaceId, projectId, section.id, value));
                }
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete section ${section.name}`}
              className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100"
              onClick={() => {
                if (confirm(`Delete section "${section.name}"? Its tasks are kept.`)) {
                  run(() => deleteSection(workspaceId, projectId, section.id));
                }
              }}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </>
        ) : (
          <span className="text-sm font-semibold text-muted-foreground">No section</span>
        )}
      </div>

      <ul>
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            members={members}
            onOpen={onOpen}
            run={run}
            workspaceId={workspaceId}
            projectId={projectId}
          />
        ))}
      </ul>

      <QuickAdd
        placeholder="Add task"
        onAdd={(name) =>
          run(() =>
            createTask(workspaceId, projectId, { name, sectionId: section?.id ?? null }),
          )
        }
      />
    </section>
  );
}

// ---------------------------------------------------------------------------

function TaskRow({
  task,
  members,
  onOpen,
  run,
  workspaceId,
  projectId,
}: {
  task: Task;
  members: Profile[];
  onOpen: (taskId: string) => void;
  run: (action: () => Promise<unknown>) => void;
  workspaceId: string;
  projectId: string;
}) {
  const overdue = !task.completed && task.due_date && task.due_date < new Date().toISOString().slice(0, 10);

  return (
    <li className="group grid grid-cols-[minmax(240px,1fr)_160px_140px_40px] items-center gap-2 border-b border-border px-2 py-1 transition-colors duration-150 hover:bg-muted/50">
      <div className="flex min-w-0 items-center gap-2">
        <Checkbox
          checked={task.completed}
          aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
          onCheckedChange={(checked) =>
            run(() => updateTask(workspaceId, projectId, task.id, { completed: checked === true }))
          }
        />
        <input
          defaultValue={task.name}
          aria-label="Task name"
          className={cn(
            "min-w-0 flex-1 truncate rounded bg-transparent text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
            task.completed && "text-muted-foreground line-through",
          )}
          onBlur={(e) => {
            const value = e.target.value.trim();
            if (value && value !== task.name) {
              run(() => updateTask(workspaceId, projectId, task.id, { name: value }));
            }
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      </div>

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
        <SelectTrigger
          aria-label="Assignee"
          className="h-7 w-full border-none bg-transparent text-xs shadow-none"
        >
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

      <input
        type="date"
        value={task.due_date ?? ""}
        aria-label="Due date"
        className={cn(
          "h-7 rounded bg-transparent px-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
          overdue ? "text-destructive" : "text-foreground",
        )}
        onChange={(e) =>
          run(() =>
            updateTask(workspaceId, projectId, task.id, { due_date: e.target.value || null }),
          )
        }
      />

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Open task ${task.name}`}
        className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100"
        onClick={() => onOpen(task.id)}
      >
        <ChevronRight aria-hidden="true" />
      </Button>
    </li>
  );
}

// ---------------------------------------------------------------------------

export function QuickAdd({
  placeholder,
  onAdd,
}: {
  placeholder: string;
  onAdd: (name: string) => void;
}) {
  const [value, setValue] = useState("");

  function submit() {
    const name = value.trim();
    if (!name) return;
    onAdd(name);
    setValue("");
  }

  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <Plus className="size-4 text-muted-foreground" aria-hidden="true" />
      <input
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        className="flex-1 rounded bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        onBlur={submit}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function AddSection({
  workspaceId,
  projectId,
  run,
}: {
  workspaceId: string;
  projectId: string;
  run: (action: () => Promise<unknown>) => void;
}) {
  const [adding, setAdding] = useState(false);

  if (!adding) {
    return (
      <Button variant="ghost" size="sm" className="mt-4" onClick={() => setAdding(true)}>
        <Plus aria-hidden="true" />
        Add section
      </Button>
    );
  }

  return (
    <div className="mt-4 px-2">
      <Input
        autoFocus
        placeholder="Section name"
        aria-label="New section name"
        className="max-w-xs"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const name = e.currentTarget.value.trim();
            if (name) run(() => createSection(workspaceId, projectId, name));
            setAdding(false);
          }
          if (e.key === "Escape") setAdding(false);
        }}
        onBlur={(e) => {
          const name = e.target.value.trim();
          if (name) run(() => createSection(workspaceId, projectId, name));
          setAdding(false);
        }}
      />
    </div>
  );
}
