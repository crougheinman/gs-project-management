"use client";

/**
 * Full-page blocking overlay for a multi-step server operation (e.g. project
 * deletion). `stageIndex`/`totalStages` drive the bar's fill - the caller
 * advances `stageIndex` and updates `stage`'s label right before each real
 * network call, so the bar and label reflect actual progress, not a timer.
 */
export function ProgressOverlay({
  open,
  title,
  stage,
  stageIndex,
  totalStages,
}: {
  open: boolean;
  title: string;
  stage: string;
  stageIndex: number;
  totalStages: number;
}) {
  if (!open) return null;

  const percent = Math.min(100, Math.round((stageIndex / totalStages) * 100));

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-background/80 backdrop-blur-sm">
      <p className="text-lg font-medium text-foreground">{title}</p>
      <div className="h-2 w-64 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-sm text-muted-foreground">{stage}</p>
    </div>
  );
}
