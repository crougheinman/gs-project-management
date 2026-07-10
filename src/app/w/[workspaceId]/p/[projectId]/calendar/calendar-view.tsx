"use client";

import { useMemo, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { ProjectPageData } from "@/lib/tasks/page-data";
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

  const events = useMemo(
    () =>
      tasks
        .filter((t) => t.due_date)
        .map((t) => ({
          id: t.id,
          title: t.name,
          start: t.due_date!,
          allDay: true,
          classNames: t.completed ? ["opacity-50"] : [],
        })),
    [tasks],
  );

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
              updateTask(workspaceId, projectId, info.event.id, {
                due_date: info.event.startStr,
              }),
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
