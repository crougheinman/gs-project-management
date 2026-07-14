"use client";

import { useMemo, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { ProjectPageData } from "@/lib/tasks/page-data";
import { shiftDate } from "@/lib/dates";
import { updateTask } from "../actions";
import { TaskPanel } from "@/components/task-panel";

type CalendarViewProps = {
  workspaceId: string;
  projectId: string;
} & ProjectPageData;

export function CalendarView(props: CalendarViewProps) {
  const { workspaceId, projectId, tasks, members } = props;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const openTaskId = searchParams.get("task");
  const openTask = openTaskId ? tasks.find((t) => t.id === openTaskId) : undefined;

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  // A task shows if it has either date. With both, it spans start..due as a
  // bar (FullCalendar all-day `end` is exclusive, so +1 day covers the due
  // day). With one date, it's a single-day event.
  const events = useMemo(
    () =>
      tasks
        .filter((t) => t.due_date || t.start_date)
        .map((t) => {
          const start = t.start_date ?? t.due_date!;
          const span = t.start_date && t.due_date && t.start_date !== t.due_date;
          return {
            id: t.id,
            title: t.name,
            start,
            end: span ? shiftDate(t.due_date!, 1) : undefined,
            allDay: true,
            classNames: t.completed ? ["opacity-50"] : [],
          };
        }),
    [tasks],
  );

  // Drag or resize -> recompute start_date/due_date from the event's span,
  // preserving which fields the task actually uses.
  function applyDateChange(id: string, startStr: string, endStr: string | null) {
    const t = taskById.get(id);
    // endStr is exclusive; the last covered day is endStr - 1.
    const lastDay = endStr ? shiftDate(endStr, -1) : startStr;
    if (t?.start_date && t?.due_date) {
      return updateTask(workspaceId, projectId, id, {
        start_date: startStr,
        due_date: lastDay,
      });
    }
    if (t?.start_date && !t?.due_date) {
      return updateTask(workspaceId, projectId, id, { start_date: startStr });
    }
    return updateTask(workspaceId, projectId, id, { due_date: startStr });
  }

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

  return (
    <div className="flex items-start gap-6">
      <div className="min-w-0 flex-1 pb-16 [--fc-border-color:var(--border)] [--fc-button-active-bg-color:var(--primary)] [--fc-button-bg-color:var(--primary)] [--fc-button-border-color:var(--primary)] [--fc-button-hover-bg-color:var(--secondary)] [--fc-button-hover-border-color:var(--secondary)] [--fc-event-bg-color:var(--primary)] [--fc-event-border-color:var(--primary)] [--fc-page-bg-color:var(--card)] [--fc-today-bg-color:var(--accent)]">
        <FullCalendar
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          height="auto"
          editable
          dayMaxEventRows={4}
          events={events}
          eventClick={(info) => openPanel(info.event.id)}
          eventDrop={(info) =>
            run(() =>
              applyDateChange(
                info.event.id,
                info.event.startStr,
                info.event.end ? info.event.endStr : null,
              ),
            )
          }
          eventResize={(info) =>
            run(() =>
              applyDateChange(
                info.event.id,
                info.event.startStr,
                info.event.end ? info.event.endStr : null,
              ),
            )
          }
        />
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
