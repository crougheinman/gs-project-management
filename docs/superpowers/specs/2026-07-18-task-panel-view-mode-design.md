# Task panel: side view / modal toggle — design

## Context

`TaskPanel` currently only renders as a fixed sticky sidebar (`<aside>`, `w-96`) next to the board/list/calendar/gantt content. User wants a Jira-style toggle between that side view and a centered modal.

## Architecture

Entirely internal to `src/components/task-panel.tsx` — task selection is already URL-driven (`?task=<id>`) identically across all 4 view files (`board-view.tsx`, `list-view.tsx`, `calendar-view.tsx`, `gantt-view.tsx`), each rendering `<TaskPanel ... onClose={...} onOpenTask={...} />` with the same props. None of those 4 files need to change.

New file: `src/lib/task-view-store.ts` — a zustand store (`zustand` is already a `package.json` dependency, currently unused anywhere in the codebase) with the `persist` middleware (bundled in `zustand`, no new dependency) backed by `localStorage`:

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

Client-side/device-level persistence is the right scope — this is a personal display preference, not data any other user needs to see, so no DB column/migration.

## Component change

`task-panel.tsx`'s existing body (header row, editable title, description, `AttachmentGallery`, tags, custom fields, subtasks, dependencies, comments — everything currently inside the `<aside>`) is pulled into a `const body = (...)` JSX expression, unchanged in content. The component then branches on `mode`:

- `"side"`: same `<aside {...getRootProps(...)}>{body}</aside>` structure as today.
- `"modal"`: `<Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto" {...getRootProps(...)}>{body}</DialogContent></Dialog>` — reuses the existing `Dialog` primitive (already used in `new-project-dialog.tsx` and `attachment-gallery.tsx`), which gives backdrop-click and Escape-to-close for free, wired to the same `onClose` prop the 4 views already pass.

Drag-and-drop-to-attach (`useDropzone`) stays a single hook call in the component; `getRootProps()`/`isDragActive` apply to whichever wrapper is currently rendered, so drag-and-drop keeps working in both modes.

## Toggle control

Small icon button (lucide `Maximize2` for side→modal, `Minimize2` for modal→side) placed in the header row next to the existing close (X) button. Calls `useTaskViewStore().toggleMode()`. Switching mode does not close the task — same open task, different chrome, instant re-render.

## Hydration guard

zustand + `persist` reading `localStorage` on an SSR app has a known first-paint mismatch: server always renders the default (`"side"`), client may then swap to a persisted `"modal"` value. Guard with a `mounted` boolean (`useState` + `useEffect(() => setMounted(true), [])`) that forces `"side"` for rendering until the client has mounted, then uses the real store value — avoids a hydration warning/flash.

## Out of scope

No changes to the 4 view files. No DB/backend changes. No change to what's inside the panel body — only its outer chrome and how it's toggled.
