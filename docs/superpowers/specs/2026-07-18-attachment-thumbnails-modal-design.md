# Attachment thumbnails + preview modal — design

## Context

Task attachments currently render as a plain vertical list (filename + download icon + hover-reveal delete icon) in `task-panel.tsx`. User wants an Asana/Trello-style horizontal thumbnail strip instead — click a thumbnail to open a preview modal with download/delete/close actions.

## Architecture

Pure frontend change, one file (`src/components/task-panel.tsx`). No backend changes — thumbnails reuse the existing `/api/attachments/{id}` download route directly as an `<img src>`; `Content-Disposition: attachment` on that route does not prevent browsers from rendering an `<img>` (that header only governs direct-navigation/download behavior, not inline `<img>` decoding).

## Components

**Thumbnail strip** — replaces the current `<ul>`. `overflow-x-auto flex gap-2` row of ~64px square tiles (`rounded-md border`). Images: `<img src={"/api/attachments/" + a.id} loading="lazy" className="h-full w-full object-cover" />`. Non-images: centered lucide icon chosen from `mime_type`/`file_name` extension (FileText for pdf/text, FileSpreadsheet for xls/csv, Archive for zip, File as generic fallback for doc/ppt). `title={a.file_name}` for the native tooltip (no caption text — panel is only 24rem wide, filenames won't fit under 64px tiles). Clicking a tile sets `selectedAttachment` state and opens the Dialog.

**Preview modal** — existing `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter` from `@/components/ui/dialog`. `DialogTitle` = filename (truncated, `title` attr for full name). Body: images get `<img>` capped `max-h-[60vh] object-contain`; PDFs get `<iframe src={...} className="h-[60vh] w-full rounded border">` (native browser PDF rendering); everything else gets a large centered file-type icon + "No preview available — download to view." `DialogFooter`: Download button (calls existing `handleDownload`), Delete button (only rendered when `selectedAttachment.uploaded_by === currentUserId`), Close (the Dialog's built-in corner X covers this — no extra button needed unless `DialogFooter`'s `showCloseButton` reads better visually, decide during implementation).

**Delete confirm** — new: destructive actions currently have zero confirmation anywhere in this file, which is a real gap being touched by this change. Local `confirmingDelete` boolean state, scoped per-modal-open (reset on close / on selecting a different attachment). First click on "Delete" flips the button to "Confirm delete" (destructive-filled style); second click within the same modal session actually calls `deleteAttachment` and closes the modal. No new component — just conditional button label/style/handler.

## Data flow

- `selectedAttachment: Attachment | null` state, `Dialog open={selectedAttachment !== null}`.
- Thumbnail `onClick` sets it; `onOpenChange`/close resets it (and `confirmingDelete`) to `null`.
- Delete success closes the modal and lets the existing `revalidatePath` (already in `deleteAttachment`) refresh the list.

## Out of scope

No thumbnail-resizing backend (full-size bytes load per tile, mitigated by `loading="lazy"`; acceptable given the project's existing no-hard-cap cost stance — revisit only if it becomes a real problem). No changes to upload/drag-drop/paste (already working, untouched). No changes to admin/ or any other file.
