"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ProjectPageData } from "@/lib/tasks/page-data";
import type { Section, Task } from "@/lib/types";
import { daysBetween, shiftDate, todayStr } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { updateTask } from "../actions";
import { TaskPanel } from "@/components/task-panel";

type GanttViewProps = { workspaceId: string; projectId: string } & ProjectPageData;

const SCALES = {
  Week: 44,
  Month: 26,
  Quarter: 10,
} as const;
type ScaleName = keyof typeof SCALES;

const ROW_H = 36;
const NAME_W = 220;

type TaskNode = Task & { children: TaskNode[] };

function buildChildren(tasks: Task[], parentId: string | null): TaskNode[] {
  return tasks
    .filter((t) => t.parent_task_id === parentId)
    .map((t) => ({ ...t, children: buildChildren(tasks, t.id) }));
}

function taskStart(t: Task) {
  return t.start_date ?? t.due_date!;
}
function taskEnd(t: Task) {
  const a = t.start_date ?? t.due_date!;
  const b = t.due_date ?? t.start_date!;
  return a <= b ? b : a;
}
function hasOwnDate(t: Task) {
  return !!(t.start_date || t.due_date);
}

// Does this subtree (node or any descendant) have a date anywhere?
function subtreeHasDate(node: TaskNode): boolean {
  if (hasOwnDate(node)) return true;
  return node.children.some(subtreeHasDate);
}

// Computed span from dated descendants only (not the node's own dates) -
// used for a parent's read-only "summary bar" when it has no dates itself.
function descendantRange(node: TaskNode): { start: string; end: string } | null {
  let start: string | null = null;
  let end: string | null = null;
  function walk(n: TaskNode) {
    if (hasOwnDate(n)) {
      const s = taskStart(n);
      const e = taskEnd(n);
      if (!start || s < start) start = s;
      if (!end || e > end) end = e;
    }
    n.children.forEach(walk);
  }
  node.children.forEach(walk);
  return start && end ? { start, end } : null;
}

type Row = { node: TaskNode; depth: number };

function flatten(nodes: TaskNode[], depth: number, collapsed: Set<string>): Row[] {
  const rows: Row[] = [];
  for (const node of nodes) {
    rows.push({ node, depth });
    if (node.children.length > 0 && !collapsed.has(node.id)) {
      rows.push(...flatten(node.children, depth + 1, collapsed));
    }
  }
  return rows;
}

export function GanttView(props: GanttViewProps) {
  const { workspaceId, projectId, sections, tasks, members } = props;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [scale, setScale] = useState<ScaleName>("Month");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const dayWidth = SCALES[scale];

  const openTaskId = searchParams.get("task");
  const openTask = openTaskId ? tasks.find((t) => t.id === openTaskId) : undefined;

  const roots = useMemo(() => buildChildren(tasks, null), [tasks]);
  const datedRoots = roots.filter(subtreeHasDate);
  const undatedRoots = roots.filter((r) => !subtreeHasDate(r));

  // Blocked = has an incomplete blocker (keyed by id, same at any depth).
  const completedById = new Map(tasks.map((t) => [t.id, t.completed]));
  const blockedIds = new Set(
    props.dependencies
      .filter((d) => completedById.get(d.depends_on_task_id) === false)
      .map((d) => d.task_id),
  );

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Date window: every task with its own dates, at any depth, so a parent's
  // summary bar and the chart's overall span are both correct.
  const anyDated = tasks.filter(hasOwnDate);
  const { windowStart, totalDays } = useMemo(() => {
    if (anyDated.length === 0) {
      const t = todayStr();
      const first = `${t.slice(0, 8)}01`;
      return { windowStart: shiftDate(first, -2), totalDays: 34 };
    }
    let min = taskStart(anyDated[0]);
    let max = taskEnd(anyDated[0]);
    for (const t of anyDated) {
      if (taskStart(t) < min) min = taskStart(t);
      if (taskEnd(t) > max) max = taskEnd(t);
    }
    const start = shiftDate(min, -3);
    const days = Math.min(daysBetween(start, max) + 7, 400);
    return { windowStart: start, totalDays: days };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  const days = useMemo(
    () => Array.from({ length: totalDays }, (_, i) => shiftDate(windowStart, i)),
    [windowStart, totalDays],
  );
  const today = todayStr();
  const todayOffset = daysBetween(windowStart, today);
  const showToday = todayOffset >= 0 && todayOffset < totalDays;

  // Month label segments for the header.
  const monthSegments = useMemo(() => {
    const segs: { label: string; left: number; width: number }[] = [];
    let i = 0;
    while (i < days.length) {
      const month = days[i].slice(0, 7);
      let j = i;
      while (j < days.length && days[j].slice(0, 7) === month) j++;
      const d = new Date(`${days[i]}T00:00:00Z`);
      segs.push({
        label: d.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" }),
        left: i * dayWidth,
        width: (j - i) * dayWidth,
      });
      i = j;
    }
    return segs;
  }, [days, dayWidth]);

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

  function reschedule(task: Task, dayDelta: number) {
    if (dayDelta === 0) return;
    const patch: { start_date?: string; due_date?: string } = {};
    if (task.start_date) patch.start_date = shiftDate(task.start_date, dayDelta);
    if (task.due_date) patch.due_date = shiftDate(task.due_date, dayDelta);
    run(() => updateTask(workspaceId, projectId, task.id, patch));
  }

  const gridWidth = totalDays * dayWidth;

  const groups: { section: Section | null; rows: Row[] }[] = [
    ...sections.map((s) => ({
      section: s,
      roots: datedRoots.filter((r) => r.section_id === s.id),
    })),
    { section: null, roots: datedRoots.filter((r) => !r.section_id) },
  ]
    .filter((g) => g.roots.length > 0)
    .map((g) => ({ section: g.section, rows: flatten(g.roots, 0, collapsed) }));

  const undatedRows = flatten(undatedRoots, 0, collapsed);

  return (
    <div className="flex items-start gap-6">
      <div className="min-w-0 flex-1 pb-16">
        <div className="mb-3 flex items-center gap-2">
          {(Object.keys(SCALES) as ScaleName[]).map((s) => (
            <Button
              key={s}
              variant={scale === s ? "default" : "outline"}
              size="sm"
              onClick={() => setScale(s)}
            >
              {s}
            </Button>
          ))}
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <div style={{ width: NAME_W + gridWidth }}>
            {/* header */}
            <div className="flex border-b border-border bg-muted/40">
              <div
                style={{ width: NAME_W }}
                className="shrink-0 border-r border-border px-3 py-1 text-xs font-medium text-muted-foreground"
              >
                Task
              </div>
              <div className="relative shrink-0" style={{ width: gridWidth, height: 40 }}>
                {monthSegments.map((seg) => (
                  <div
                    key={seg.left}
                    className="absolute top-0 border-r border-border px-2 py-1 text-xs font-medium text-foreground"
                    style={{ left: seg.left, width: seg.width }}
                  >
                    {seg.label}
                  </div>
                ))}
                <div className="absolute bottom-0 flex" style={{ top: 20 }}>
                  {days.map((d) => {
                    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
                    const weekend = dow === 0 || dow === 6;
                    return (
                      <div
                        key={d}
                        style={{ width: dayWidth }}
                        className={cn(
                          "shrink-0 border-r border-border/60 text-center text-[10px] leading-5 text-muted-foreground",
                          weekend && "bg-muted/50",
                        )}
                      >
                        {dayWidth >= 20 ? d.slice(8) : ""}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* body */}
            <div className="relative">
              {showToday && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-primary/70"
                  style={{ left: NAME_W + todayOffset * dayWidth + dayWidth / 2 }}
                />
              )}

              {groups.map((group) => (
                <div key={group.section?.id ?? "none"}>
                  <div className="flex items-center border-b border-border bg-muted/20">
                    <div
                      style={{ width: NAME_W }}
                      className="shrink-0 border-r border-border px-3 py-1 text-xs font-semibold text-foreground"
                    >
                      {group.section?.name ?? "No section"}
                    </div>
                    <div style={{ width: gridWidth }} />
                  </div>
                  {group.rows.map(({ node, depth }) => (
                    <GanttRow
                      key={node.id}
                      node={node}
                      depth={depth}
                      collapsed={collapsed.has(node.id)}
                      onToggleCollapse={toggleCollapse}
                      windowStart={windowStart}
                      dayWidth={dayWidth}
                      gridWidth={gridWidth}
                      blocked={blockedIds.has(node.id)}
                      onOpen={openPanel}
                      onReschedule={reschedule}
                    />
                  ))}
                </div>
              ))}

              {undatedRoots.length > 0 && (
                <div>
                  <div className="flex items-center border-b border-border bg-muted/20">
                    <div
                      style={{ width: NAME_W }}
                      className="shrink-0 border-r border-border px-3 py-1 text-xs font-semibold text-muted-foreground"
                    >
                      Unscheduled
                    </div>
                    <div style={{ width: gridWidth }} />
                  </div>
                  {undatedRows.map(({ node, depth }) => (
                    <div key={node.id} className="flex items-center border-b border-border">
                      <button
                        type="button"
                        style={{ width: NAME_W, height: ROW_H, paddingLeft: 12 + depth * 16 }}
                        className="flex shrink-0 cursor-pointer items-center gap-1 truncate border-r border-border text-left text-sm text-foreground hover:text-primary"
                        onClick={() => openPanel(node.id)}
                        title="Open to set dates"
                      >
                        {node.children.length > 0 && (
                          <span
                            role="button"
                            tabIndex={-1}
                            aria-label={collapsed.has(node.id) ? "Expand" : "Collapse"}
                            className="shrink-0 cursor-pointer text-muted-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleCollapse(node.id);
                            }}
                          >
                            {collapsed.has(node.id) ? (
                              <ChevronRight className="size-3.5" aria-hidden="true" />
                            ) : (
                              <ChevronDown className="size-3.5" aria-hidden="true" />
                            )}
                          </span>
                        )}
                        <span className="truncate">{node.name}</span>
                      </button>
                      <div style={{ width: gridWidth, height: ROW_H }} />
                    </div>
                  ))}
                </div>
              )}

              {groups.length === 0 && undatedRoots.length === 0 && (
                <div className="p-10 text-center text-sm text-muted-foreground">
                  No tasks yet.
                </div>
              )}
            </div>
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

function GanttRow({
  node,
  depth,
  collapsed,
  onToggleCollapse,
  windowStart,
  dayWidth,
  gridWidth,
  blocked,
  onOpen,
  onReschedule,
}: {
  node: TaskNode;
  depth: number;
  collapsed: boolean;
  onToggleCollapse: (id: string) => void;
  windowStart: string;
  dayWidth: number;
  gridWidth: number;
  blocked: boolean;
  onOpen: (taskId: string) => void;
  onReschedule: (task: Task, dayDelta: number) => void;
}) {
  const [dragPx, setDragPx] = useState(0);
  const dragging = useRef<{ startX: number } | null>(null);

  const own = hasOwnDate(node);
  const summary = !own ? descendantRange(node) : null;
  // Own dates always win over the computed span (explicit rule).
  const start = own ? taskStart(node) : (summary?.start ?? null);
  const end = own ? taskEnd(node) : (summary?.end ?? null);
  const draggable = own;

  const left = start ? daysBetween(windowStart, start) * dayWidth : 0;
  const width = start && end ? Math.max(dayWidth, (daysBetween(start, end) + 1) * dayWidth) : 0;

  function onPointerDown(e: React.PointerEvent) {
    if (!draggable) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragging.current = { startX: e.clientX };
    setDragPx(0);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    setDragPx(e.clientX - dragging.current.startX);
  }
  function onPointerUp() {
    if (!dragging.current) return;
    const moved = dragPx;
    dragging.current = null;
    setDragPx(0);
    if (Math.abs(moved) < 4) {
      onOpen(node.id); // treated as a click
      return;
    }
    onReschedule(node, Math.round(moved / dayWidth));
  }

  return (
    <div className="flex items-center border-b border-border">
      <button
        type="button"
        style={{ width: NAME_W, height: ROW_H, paddingLeft: 12 + depth * 16 }}
        className={cn(
          "flex shrink-0 cursor-pointer items-center gap-1 truncate border-r border-border text-left text-sm hover:text-primary",
          node.completed ? "text-muted-foreground line-through" : "text-foreground",
        )}
        onClick={() => onOpen(node.id)}
      >
        {node.children.length > 0 && (
          <span
            role="button"
            tabIndex={-1}
            aria-label={collapsed ? "Expand" : "Collapse"}
            className="shrink-0 cursor-pointer text-muted-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse(node.id);
            }}
          >
            {collapsed ? (
              <ChevronRight className="size-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-3.5" aria-hidden="true" />
            )}
          </span>
        )}
        <span className="truncate">{node.name}</span>
      </button>
      <div className="relative shrink-0" style={{ width: gridWidth, height: ROW_H }}>
        {start && end && (
          <div
            role={draggable ? "button" : undefined}
            tabIndex={draggable ? 0 : undefined}
            aria-label={
              draggable
                ? `${node.name}: ${start} to ${end}. Drag to reschedule.`
                : `${node.name}: computed from child dates, ${start} to ${end}.`
            }
            className={cn(
              "absolute top-1/2 flex -translate-y-1/2 items-center overflow-hidden rounded-md px-2 text-xs shadow-xs transition-shadow duration-150",
              draggable
                ? cn(
                    "cursor-grab text-primary-foreground hover:shadow-md active:cursor-grabbing",
                    node.completed ? "bg-primary/50" : "bg-primary",
                  )
                : "cursor-default bg-muted-foreground/40 text-foreground",
              blocked && "border-l-4 border-destructive",
            )}
            style={{ left: left + dragPx, width, height: draggable ? 22 : 10 }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onClick={() => !draggable && onOpen(node.id)}
            onKeyDown={(e) => draggable && e.key === "Enter" && onOpen(node.id)}
          >
            {draggable && <span className="truncate">{node.name}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
