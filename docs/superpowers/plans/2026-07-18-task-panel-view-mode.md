# Task Panel Side/Modal View Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Jira-style toggle so the task detail panel can display as either the current sticky side panel or a centered modal, persisted per-device.

**Architecture:** A new zustand store (`persist` middleware, `localStorage`-backed) holds the `"side" | "modal"` preference. `task-panel.tsx`'s existing JSX body is unwrapped from its current `<aside>` into a reusable `body` expression, then the component branches its final return between the existing `<aside>` shell and a new `Dialog`/`DialogContent` shell, both wrapping the same unchanged `body`. No other file changes — all 4 view files (`board-view.tsx`, `list-view.tsx`, `calendar-view.tsx`, `gantt-view.tsx`) already pass identical props and don't need touching.

**Tech Stack:** Next.js 16 App Router, React 19, `zustand` (already a dependency, currently unused anywhere — this is its first real usage), existing `Dialog` primitive (`@base-ui/react/dialog`), `lucide-react`.

## Global Constraints

- Do not run `git commit` — the user commits manually.
- No new dependencies — `zustand`'s `persist` middleware ships inside the `zustand` package.
- Persistence is client-side only (`localStorage`) — this is a personal display preference, not shared data, so no DB migration.
- Switching mode must not close the currently-open task.

---

## Task 1: `task-view-store.ts`

**Files:**
- Create: `project-management/src/lib/task-view-store.ts`

**Interfaces:**
- Produces: `useTaskViewStore` — a zustand hook. State shape `{ mode: "side" | "modal", toggleMode: () => void }`. Consumed by Task 2 (not part of this task).

- [ ] **Step 1: Write the store**

```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type TaskViewMode = "side" | "modal";

type TaskViewStore = {
  mode: TaskViewMode;
  toggleMode: () => void;
};

export const useTaskViewStore = create<TaskViewStore>()(
  persist(
    (set, get) => ({
      mode: "side",
      toggleMode: () => set({ mode: get().mode === "side" ? "modal" : "side" }),
    }),
    { name: "task-view-mode" },
  ),
);
```

- [ ] **Step 2: Type-check**

Run (from `project-management/`): `npx tsc -b --noEmit`
Expected: no errors (this file isn't imported anywhere yet).

No commit — user commits manually.

---

## Task 2: Wire the toggle into `task-panel.tsx`

**Files:**
- Modify: `project-management/src/components/task-panel.tsx`

**Interfaces:**
- Consumes: `useTaskViewStore` (Task 1).

- [ ] **Step 1: Add the `Maximize2`/`Minimize2` icons**

Find:

```tsx
import {
  ChevronRight,
  Paperclip,
  Plus,
  Tag as TagIcon,
  Trash2,
  X,
} from "lucide-react";
```

Replace with:

```tsx
import {
  ChevronRight,
  Maximize2,
  Minimize2,
  Paperclip,
  Plus,
  Tag as TagIcon,
  Trash2,
  X,
} from "lucide-react";
```

- [ ] **Step 2: Import `Dialog`/`DialogContent`**

Find:

```tsx
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
```

Replace with:

```tsx
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
```

- [ ] **Step 3: Import the store**

Find:

```tsx
import { AttachmentGallery } from "@/components/attachment-gallery";
import { CommentEditor } from "@/components/comment-editor";
import { CommentBody } from "@/components/comment-body";
import { CustomFieldInput } from "@/components/custom-field-input";
```

Replace with:

```tsx
import { AttachmentGallery } from "@/components/attachment-gallery";
import { CommentEditor } from "@/components/comment-editor";
import { CommentBody } from "@/components/comment-body";
import { CustomFieldInput } from "@/components/custom-field-input";
import { useTaskViewStore } from "@/lib/task-view-store";
```

- [ ] **Step 4: Read the mode, with a hydration guard**

**Deviation from the original plan text below: this repo's eslint config has `react-hooks/set-state-in-effect`, which hard-errors on the `useEffect(() => setMounted(true), [])` pattern originally planned here. Fixed by adding `skipHydration: true` to the store's `persist()` options (Task 1) and calling `useTaskViewStore.persist.rehydrate()` in the effect instead of a local `setMounted` — zustand's own documented SSR pattern, and it doesn't trip the lint rule since it isn't a raw `useState` setter call.**

Find:

```tsx
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newSubtask, setNewSubtask] = useState("");
  const [newTag, setNewTag] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
```

Replace with:

```tsx
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newSubtask, setNewSubtask] = useState("");
  const [newTag, setNewTag] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mode = useTaskViewStore((s) => s.mode);
  const toggleMode = useTaskViewStore((s) => s.toggleMode);
  // skipHydration on the store avoids a hydration mismatch (server has no
  // localStorage); rehydrate explicitly once mounted on the client.
  useEffect(() => {
    useTaskViewStore.persist.rehydrate();
  }, []);
```

(Task 1's store must include `skipHydration: true` in its `persist()` options for this to work — see Task 1 Step 1.)

- [ ] **Step 5: Add the toggle button next to the close button**

Find:

```tsx
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
```

Replace with:

```tsx
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
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={mode === "side" ? "Expand to modal" : "Collapse to side panel"}
            onClick={toggleMode}
          >
            {mode === "side" ? <Maximize2 aria-hidden="true" /> : <Minimize2 aria-hidden="true" />}
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Close panel" onClick={onClose}>
            <X aria-hidden="true" />
          </Button>
        </div>
```

- [ ] **Step 6: Unwrap the JSX body from the `<aside>` opening**

Find:

```tsx
  return (
    <aside
      {...getRootProps({
        "aria-label": `Task details: ${task.name}`,
        className: cn(
          "sticky top-20 flex h-fit max-h-[calc(100dvh-6rem)] w-96 shrink-0 flex-col overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-sm",
          isDragActive && "ring-2 ring-primary",
        ),
      })}
    >
      <div className="flex items-center justify-between gap-2">
```

Replace with:

```tsx
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
```

(Everything between this point and the closing `</aside>` — the rest of the panel's content, unchanged — stays exactly as-is; only the opening wrapper changes.)

- [ ] **Step 7: Close the body, add the mode-branching return**

Find (the very end of the file):

```tsx
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
```

Replace with:

```tsx
      {task.parent_task_id && (
        <button
          type="button"
          className="mt-4 cursor-pointer text-xs text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => onOpenTask(task.parent_task_id!)}
        >
          Go to parent task
        </button>
      )}
    </>
  );

  if (mode === "modal") {
    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent
          {...getRootProps({
            role: "dialog",
            className: cn(
              "sm:max-w-3xl max-h-[85vh] overflow-y-auto",
              isDragActive && "ring-2 ring-primary",
            ),
          })}
        >
          {body}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <aside
      {...getRootProps({
        "aria-label": `Task details: ${task.name}`,
        className: cn(
          "sticky top-20 flex h-fit max-h-[calc(100dvh-6rem)] w-96 shrink-0 flex-col overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-sm",
          isDragActive && "ring-2 ring-primary",
        ),
      })}
    >
      {body}
    </aside>
  );
}
```

`getRootProps({ role: "dialog", ... })` explicitly overrides react-dropzone's default `role="presentation"` (confirmed in `node_modules/react-dropzone/dist/es/index.js:942`: it only falls back to `"presentation"` when no non-empty string `role` is supplied) — without this override, the modal's drop-target root would lose its dialog semantics for assistive tech.

- [ ] **Step 8: Type-check**

Run (from `project-management/`): `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 9: Lint**

Run (from `project-management/`): `npx eslint src/components/task-panel.tsx`
Expected: no new errors/warnings beyond the pre-existing `react-hooks/exhaustive-deps` warning on the paste-listener effect (unrelated, already present before this task).

- [ ] **Step 10: Manual browser verification**

1. Open a task (defaults to side panel, matching current behavior). Click the new expand icon (next to delete/close) → panel becomes a centered modal with the same content.
2. Click the collapse icon in modal mode → back to the side panel.
3. Reload the page with a task still open (`?task=` in the URL) → panel opens in whichever mode you last chose (persisted).
4. In modal mode: click the backdrop → modal closes (and the `?task=` param clears, same as the X button). Press Escape → same. Neither should happen in side-panel mode (unchanged prior behavior — no backdrop, no Escape-close).
5. In modal mode, drag a file onto the modal → drag-and-drop-to-attach still works (same as side mode already does).
6. Switch to modal mode, open dev tools' accessibility tree (or just inspect the DOM), confirm the dialog's root element has `role="dialog"`, not `role="presentation"`.

No commit — user commits manually.

---

## Self-review

**Spec coverage:** persisted mode store (Task 1), side/modal branching + toggle button + hydration guard + `role="dialog"` override (Task 2) — all present. No changes to the 4 view files, matching the design's stated scope.

**Type consistency:** `useTaskViewStore((s) => s.mode)` / `((s) => s.toggleMode)` match the store's exact shape from Task 1. `body` is used identically in both the `Dialog`/`DialogContent` and `<aside>` branches.

**Placeholder scan:** none — every step has complete code.
