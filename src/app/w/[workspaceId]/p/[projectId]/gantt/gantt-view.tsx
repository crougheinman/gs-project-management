"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
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

function taskStart(t: Task) {
  return t.start_date ?? t.due_date!;
}
function taskEnd(t: Task) {
  const a = t.start_date ?? t.due_date!;
  const b = t.due_date ?? t.start_date!;
  return a <= b ? b : a;
}

export function GanttView(props: GanttViewProps) {
  const { workspaceId, projectId, sections, tasks, members } = props;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [scale, setScale] = useState<ScaleName>("Month");
  const dayWidth = SCALES[scale];

  const openTaskId = searchParams.get("task");
  const openTask = openTaskId ? tasks.find((t) => t.id === openTaskId) : undefined;

  const topLevel = tasks.filter((t) => !t.parent_task_id);
  const dated = topLevel.filter((t) => t.start_date || t.due_date);
  const undated = topLevel.filter((t) => !t.start_date && !t.due_date);

  // Blocked = has an incomplete blocker.
  const completedById = new Map(tasks.map((t) => [t.id, t.completed]));
  const blockedIds = new Set(
    props.dependencies
      .filter((d) => completedById.get(d.depends_on_task_id) === false)
      .map((d) => d.task_id),
  );

  // Date window across all dated tasks, padded; fallback to current month.
  const { windowStart, totalDays } = useMemo(() => {
    if (dated.length === 0) {
      const t = todayStr();
      const first = `${t.slice(0, 8)}01`;
      return { windowStart: shiftDate(first, -2), totalDays: 34 };
    }
    let min = taskStart(dated[0]);
    let max = taskEnd(dated[0]);
    for (const t of dated) {
      if (taskStart(t) < min) min = taskStart(t);
      if (taskEnd(t) > max) max = taskEnd(t);
    }
    const start = shiftDate(min, -3);
    const days = Math.min(daysBetween(start, max) + 7, 400);
    return { windowStart: start, totalDays: days };
  }, [dated]);

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

  const groups: { section: Section | null; tasks: Task[] }[] = [
    ...sections.map((s) => ({ section: s, tasks: dated.filter((t) => t.section_id === s.id) })),
    { section: null, tasks: dated.filter((t) => !t.section_id) },
  ].filter((g) => g.tasks.length > 0);

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
                  {group.tasks.map((task) => (
                    <GanttRow
                      key={task.id}
                      task={task}
                      windowStart={windowStart}
                      dayWidth={dayWidth}
                      gridWidth={gridWidth}
                      blocked={blockedIds.has(task.id)}
                      onOpen={openPanel}
                      onReschedule={reschedule}
                    />
                  ))}
                </div>
              ))}

              {undated.length > 0 && (
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
                  {undated.map((task) => (
                    <div key={task.id} className="flex items-center border-b border-border">
                      <button
                        type="button"
                        style={{ width: NAME_W, height: ROW_H }}
                        className="shrink-0 cursor-pointer truncate border-r border-border px-3 text-left text-sm text-foreground hover:text-primary"
                        onClick={() => openPanel(task.id)}
                        title="Open to set dates"
                      >
                        {task.name}
                      </button>
                      <div style={{ width: gridWidth, height: ROW_H }} />
                    </div>
                  ))}
                </div>
              )}

              {groups.length === 0 && undated.length === 0 && (
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
  task,
  windowStart,
  dayWidth,
  gridWidth,
  blocked,
  onOpen,
  onReschedule,
}: {
  task: Task;
  windowStart: string;
  dayWidth: number;
  gridWidth: number;
  blocked: boolean;
  onOpen: (taskId: string) => void;
  onReschedule: (task: Task, dayDelta: number) => void;
}) {
  const [dragPx, setDragPx] = useState(0);
  const dragging = useRef<{ startX: number } | null>(null);

  const start = taskStart(task);
  const end = taskEnd(task);
  const left = daysBetween(windowStart, start) * dayWidth;
  const width = Math.max(dayWidth, (daysBetween(start, end) + 1) * dayWidth);

  function onPointerDown(e: React.PointerEvent) {
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
      onOpen(task.id); // treated as a click
      return;
    }
    onReschedule(task, Math.round(moved / dayWidth));
  }

  return (
    <div className="flex items-center border-b border-border">
      <button
        type="button"
        style={{ width: NAME_W, height: ROW_H }}
        className={cn(
          "shrink-0 cursor-pointer truncate border-r border-border px-3 text-left text-sm hover:text-primary",
          task.completed ? "text-muted-foreground line-through" : "text-foreground",
        )}
        onClick={() => onOpen(task.id)}
      >
        {task.name}
      </button>
      <div className="relative shrink-0" style={{ width: gridWidth, height: ROW_H }}>
        <div
          role="button"
          tabIndex={0}
          aria-label={`${task.name}: ${start} to ${end}. Drag to reschedule.`}
          className={cn(
            "absolute top-1/2 flex -translate-y-1/2 cursor-grab items-center overflow-hidden rounded-md px-2 text-xs text-primary-foreground shadow-xs transition-shadow duration-150 hover:shadow-md active:cursor-grabbing",
            task.completed ? "bg-primary/50" : "bg-primary",
            blocked && "border-l-4 border-destructive",
          )}
          style={{ left: left + dragPx, width, height: 22 }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onKeyDown={(e) => e.key === "Enter" && onOpen(task.id)}
        >
          <span className="truncate">{task.name}</span>
        </div>
      </div>
    </div>
  );
}
