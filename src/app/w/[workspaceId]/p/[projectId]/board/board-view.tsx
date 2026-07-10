"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Profile, Section, Task } from "@/lib/types";
import type { ProjectPageData } from "@/lib/tasks/page-data";
import { cn } from "@/lib/utils";
import { moveTask, createTask } from "../actions";
import { TaskPanel } from "@/components/task-panel";
import { QuickAdd } from "../list/list-view";

const NO_SECTION = "__none__";

type BoardViewProps = {
  workspaceId: string;
  projectId: string;
} & ProjectPageData;

type ColumnMap = Record<string, string[]>;

function buildColumns(sections: Section[], tasks: Task[]): ColumnMap {
  const cols: ColumnMap = {};
  for (const s of sections) cols[s.id] = [];
  cols[NO_SECTION] = [];
  for (const t of tasks) {
    if (t.parent_task_id) continue;
    const key = t.section_id && cols[t.section_id] ? t.section_id : NO_SECTION;
    cols[key].push(t.id);
  }
  return cols;
}

export function BoardView(props: BoardViewProps) {
  const { workspaceId, projectId, sections, tasks, members } = props;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const [columns, setColumns] = useState<ColumnMap>(() => buildColumns(sections, tasks));
  const [activeId, setActiveId] = useState<string | null>(null);

  // Re-sync local order from server data except mid-drag.
  useEffect(() => {
    if (!activeId) setColumns(buildColumns(sections, tasks));
  }, [sections, tasks, activeId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const openTaskId = searchParams.get("task");
  const openTask = openTaskId ? tasks.find((t) => t.id === openTaskId) : undefined;

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      try {
        await action();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  function findColumn(id: string): string | undefined {
    if (id in columns) return id;
    return Object.keys(columns).find((key) => columns[key].includes(id));
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeCol = findColumn(String(active.id));
    const overCol = findColumn(String(over.id));
    if (!activeCol || !overCol || activeCol === overCol) return;

    setColumns((cols) => {
      const activeItems = cols[activeCol].filter((id) => id !== active.id);
      const overItems = [...cols[overCol]];
      const overIndex = overItems.indexOf(String(over.id));
      const insertAt = overIndex >= 0 ? overIndex : overItems.length;
      overItems.splice(insertAt, 0, String(active.id));
      return { ...cols, [activeCol]: activeItems, [overCol]: overItems };
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const activeCol = findColumn(String(active.id));
    if (!activeCol) return;

    // Reorder within the final column.
    const items = [...columns[activeCol]];
    const from = items.indexOf(String(active.id));
    const overIndex = items.indexOf(String(over.id));
    if (from >= 0 && overIndex >= 0 && from !== overIndex) {
      items.splice(from, 1);
      items.splice(overIndex, 0, String(active.id));
      setColumns((cols) => ({ ...cols, [activeCol]: items }));
    }

    const finalIndex = items.indexOf(String(active.id));
    const prevTaskId = finalIndex > 0 ? items[finalIndex - 1] : null;
    const nextTaskId = finalIndex < items.length - 1 ? items[finalIndex + 1] : null;

    run(() =>
      moveTask(workspaceId, projectId, String(active.id), {
        sectionId: activeCol === NO_SECTION ? null : activeCol,
        prevTaskId,
        nextTaskId,
      }),
    );
  }

  function openPanel(taskId: string) {
    router.push(`${pathname}?task=${taskId}`, { scroll: false });
  }

  const visibleColumns = [
    ...sections.map((s) => ({ key: s.id, name: s.name })),
    ...(columns[NO_SECTION]?.length ? [{ key: NO_SECTION, name: "No section" }] : []),
  ];

  return (
    <div className="flex items-start gap-6">
      <div className="min-w-0 flex-1 overflow-x-auto pb-16">
        <DndContext
          id="board-dnd"
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex items-start gap-4">
            {visibleColumns.map((col) => (
              <BoardColumn
                key={col.key}
                columnKey={col.key}
                name={col.name}
                taskIds={columns[col.key] ?? []}
                taskById={taskById}
                members={members}
                onOpen={openPanel}
                onAdd={(name) =>
                  run(() =>
                    createTask(workspaceId, projectId, {
                      name,
                      sectionId: col.key === NO_SECTION ? null : col.key,
                    }),
                  )
                }
              />
            ))}
          </div>
          <DragOverlay>
            {activeId && taskById.get(activeId) ? (
              <BoardCard task={taskById.get(activeId)!} members={members} overlay />
            ) : null}
          </DragOverlay>
        </DndContext>
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
          customFields={props.customFields}
          customFieldValues={props.customFieldValues}
          dependencies={props.dependencies}
          currentUserId={props.currentUserId}
          onClose={() => router.push(pathname, { scroll: false })}
          onOpenTask={openPanel}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function BoardColumn({
  columnKey,
  name,
  taskIds,
  taskById,
  members,
  onOpen,
  onAdd,
}: {
  columnKey: string;
  name: string;
  taskIds: string[];
  taskById: Map<string, Task>;
  members: Profile[];
  onOpen: (taskId: string) => void;
  onAdd: (name: string) => void;
}) {
  const { setNodeRef } = useDroppable({ id: columnKey });

  return (
    <section
      ref={setNodeRef}
      aria-label={`Column ${name}`}
      className="flex w-72 shrink-0 flex-col rounded-lg bg-muted/60 p-2"
    >
      <h2 className="px-2 py-1 text-sm font-semibold text-foreground">
        {name}
        <span className="ml-2 text-xs font-normal text-muted-foreground">{taskIds.length}</span>
      </h2>
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <ul className="flex min-h-8 flex-col gap-2 py-1">
          {taskIds.map((id) => {
            const task = taskById.get(id);
            return task ? (
              <SortableCard key={id} task={task} members={members} onOpen={onOpen} />
            ) : null;
          })}
        </ul>
      </SortableContext>
      <QuickAdd placeholder="Add task" onAdd={onAdd} />
    </section>
  );
}

function SortableCard({
  task,
  members,
  onOpen,
}: {
  task: Task;
  members: Profile[];
  onOpen: (taskId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
    >
      <BoardCard task={task} members={members} onOpen={onOpen} />
    </li>
  );
}

function BoardCard({
  task,
  members,
  onOpen,
  overlay,
}: {
  task: Task;
  members: Profile[];
  onOpen?: (taskId: string) => void;
  overlay?: boolean;
}) {
  const assignee = task.assignee ?? members.find((m) => m.id === task.assignee_id);
  const overdue =
    !task.completed && task.due_date && task.due_date < new Date().toISOString().slice(0, 10);
  const initials = (assignee?.full_name || assignee?.email || "")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <button
      type="button"
      onClick={onOpen ? () => onOpen(task.id) : undefined}
      className={cn(
        "w-full cursor-pointer rounded-md border border-border bg-card p-3 text-left shadow-xs transition-shadow duration-150 hover:shadow-md",
        overlay && "rotate-2 shadow-lg",
      )}
    >
      <p
        className={cn(
          "text-sm text-foreground",
          task.completed && "text-muted-foreground line-through",
        )}
      >
        {task.name}
      </p>
      {(assignee || task.due_date) && (
        <div className="mt-2 flex items-center justify-between gap-2">
          {assignee ? (
            <Avatar className="size-5">
              <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
            </Avatar>
          ) : (
            <span />
          )}
          {task.due_date && (
            <span className={cn("text-xs", overdue ? "text-destructive" : "text-muted-foreground")}>
              {task.due_date}
            </span>
          )}
        </div>
      )}
    </button>
  );
}
