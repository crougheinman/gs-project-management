# Attachment Thumbnails + Preview Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the vertical attachment list in the task panel with a horizontal thumbnail strip; clicking a thumbnail opens a preview modal with download/delete/close.

**Architecture:** New presentational component `AttachmentGallery` (thumbnail strip + modal, owns its own open/delete-confirm state) extracted out of the already-large `task-panel.tsx`, which now just renders it and passes data + the two existing action callbacks. No backend changes — thumbnails and the modal's image/PDF preview both point straight at the existing `/api/attachments/{id}` route as an `<img>`/`<iframe>` source.

**Tech Stack:** Next.js 16 App Router, React 19, existing shadcn-style `Dialog` (`@base-ui/react/dialog`), `lucide-react`, Tailwind v4.

## Global Constraints

- Do not run `git commit` — the user commits manually.
- `Content-Disposition: attachment` on `/api/attachments/{id}` does not block `<img>`/`<iframe>` rendering — only affects direct-navigation/download behavior. No backend change needed for this feature.
- No new dependencies — `lucide-react` and the existing `Dialog` primitive cover everything.
- Destructive delete requires a two-click confirm (click "Delete" → button flips to "Confirm delete" → second click deletes) — there was previously zero confirmation on attachment delete.

---

## Task 1: `AttachmentGallery` component

**Files:**
- Create: `project-management/src/components/attachment-gallery.tsx`

**Interfaces:**
- Produces: `AttachmentGallery({ attachments, currentUserId, onDownload, onDelete })` — a client component. `attachments: Attachment[]`, `currentUserId: string | null`, `onDownload: (attachment: Attachment) => void`, `onDelete: (attachmentId: string) => void`. Renders `null` when `attachments.length === 0`. Consumed by Task 2 in `task-panel.tsx` (not part of this task).

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useState } from "react";
import { Archive, Download, File as FileIcon, FileSpreadsheet, FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Attachment } from "@/lib/types";

function isImageAttachment(a: Attachment) {
  return a.mime_type?.startsWith("image/") ?? false;
}

function attachmentIcon(mimeType: string | null) {
  if (mimeType === "application/pdf") return FileText;
  if (
    mimeType === "text/csv" ||
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return FileSpreadsheet;
  }
  if (mimeType === "application/zip" || mimeType === "application/x-zip-compressed") {
    return Archive;
  }
  return FileIcon;
}

export function AttachmentGallery({
  attachments,
  currentUserId,
  onDownload,
  onDelete,
}: {
  attachments: Attachment[];
  currentUserId: string | null;
  onDownload: (attachment: Attachment) => void;
  onDelete: (attachmentId: string) => void;
}) {
  const [selectedAttachment, setSelectedAttachment] = useState<Attachment | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function closeModal() {
    setSelectedAttachment(null);
    setConfirmingDelete(false);
  }

  function handleDeleteClick() {
    if (!selectedAttachment) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    onDelete(selectedAttachment.id);
    closeModal();
  }

  if (attachments.length === 0) return null;

  return (
    <>
      <div className="mt-1 flex gap-2 overflow-x-auto pb-1">
        {attachments.map((a) => {
          const Icon = attachmentIcon(a.mime_type);
          return (
            <button
              key={a.id}
              type="button"
              title={a.file_name}
              aria-label={`Open ${a.file_name}`}
              onClick={() => setSelectedAttachment(a)}
              className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted"
            >
              {isImageAttachment(a) ? (
                // eslint-disable-next-line @next/next/no-img-element -- dynamic, auth-gated route; next/image's optimizer would bypass the session cookie
                <img
                  src={`/api/attachments/${a.id}`}
                  alt={a.file_name}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <Icon aria-hidden="true" className="size-6 text-muted-foreground" />
              )}
            </button>
          );
        })}
      </div>

      <Dialog
        open={selectedAttachment !== null}
        onOpenChange={(open) => {
          if (!open) closeModal();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          {selectedAttachment && (
            <>
              <DialogHeader>
                <DialogTitle className="truncate" title={selectedAttachment.file_name}>
                  {selectedAttachment.file_name}
                </DialogTitle>
              </DialogHeader>
              <div className="flex max-h-[60vh] items-center justify-center overflow-auto rounded border border-border bg-muted">
                {isImageAttachment(selectedAttachment) ? (
                  // eslint-disable-next-line @next/next/no-img-element -- dynamic, auth-gated route; next/image's optimizer would bypass the session cookie
                  <img
                    src={`/api/attachments/${selectedAttachment.id}`}
                    alt={selectedAttachment.file_name}
                    className="max-h-[60vh] w-full object-contain"
                  />
                ) : selectedAttachment.mime_type === "application/pdf" ? (
                  <iframe
                    src={`/api/attachments/${selectedAttachment.id}`}
                    title={selectedAttachment.file_name}
                    className="h-[60vh] w-full rounded border-0"
                  />
                ) : (
                  (() => {
                    const Icon = attachmentIcon(selectedAttachment.mime_type);
                    return (
                      <div className="flex flex-col items-center gap-2 p-8 text-muted-foreground">
                        <Icon aria-hidden="true" className="size-12" />
                        <p className="text-sm">No preview available</p>
                      </div>
                    );
                  })()
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => onDownload(selectedAttachment)}>
                  <Download aria-hidden="true" />
                  Download
                </Button>
                {selectedAttachment.uploaded_by === currentUserId && (
                  <Button variant="destructive" onClick={handleDeleteClick}>
                    <Trash2 aria-hidden="true" />
                    {confirmingDelete ? "Confirm delete" : "Delete"}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Type-check**

Run (from `project-management/`): `npx tsc -b --noEmit`
Expected: no errors from this new file (errors elsewhere, if any, belong to Task 2 — this file isn't imported anywhere yet).

No commit — user commits manually.

---

## Task 2: Wire `AttachmentGallery` into `task-panel.tsx`

**Files:**
- Modify: `project-management/src/components/task-panel.tsx`

**Interfaces:**
- Consumes: `AttachmentGallery` (Task 1), the existing `handleDownload(attachment: Attachment)` function and `deleteAttachment(workspaceId, projectId, attachmentId)` action already in this file (both untouched by this task).

- [ ] **Step 1: Remove the now-unused `Download` icon import**

Find the `lucide-react` import block (top of the file):

```tsx
import {
  ChevronRight,
  Download,
  Paperclip,
  Plus,
  Tag as TagIcon,
  Trash2,
  X,
} from "lucide-react";
```

Replace with (drop `Download` — after Step 3 below, the only remaining `Download` icon usage in this file moves into `AttachmentGallery`; `Trash2` stays imported, it's still used by the subtask/dependency delete buttons elsewhere in this file):

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

- [ ] **Step 2: Import `AttachmentGallery`**

Find:

```tsx
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
```

- [ ] **Step 3: Replace the attachments list block**

Find this exact block (the current thumbnail-less vertical list, right after the "Drop to attach" hint paragraph):

```tsx
      {taskAttachments.length > 0 && (
        <ul className="mt-1 flex flex-col gap-1">
          {taskAttachments.map((a) => (
            <li key={a.id} className="group flex items-center gap-2 text-sm">
              <button
                type="button"
                className="min-w-0 flex-1 cursor-pointer truncate text-left text-foreground underline-offset-4 hover:underline"
                onClick={() => handleDownload(a)}
              >
                {a.file_name}
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Download ${a.file_name}`}
                onClick={() => handleDownload(a)}
              >
                <Download aria-hidden="true" />
              </Button>
              {a.uploaded_by === currentUserId && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${a.file_name}`}
                  className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => run(() => deleteAttachment(workspaceId, projectId, a.id))}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
```

Replace with:

```tsx
      <AttachmentGallery
        attachments={taskAttachments}
        currentUserId={currentUserId}
        onDownload={handleDownload}
        onDelete={(attachmentId) => run(() => deleteAttachment(workspaceId, projectId, attachmentId))}
      />
```

- [ ] **Step 4: Type-check**

Run (from `project-management/`): `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 5: Lint**

Run (from `project-management/`): `npx eslint src/components/task-panel.tsx src/components/attachment-gallery.tsx`
Expected: no errors. The two `@next/next/no-img-element` warnings in `attachment-gallery.tsx` are suppressed by the inline disable comments already in Task 1's code — confirm they're actually suppressed, not just present as dead comments (i.e. lint output shouldn't list them).

- [ ] **Step 6: Manual browser verification**

Dev server should already be running from earlier work (`npm run dev` if not). Open a task that has at least one image attachment, one PDF, and one other type (e.g. a .txt or .zip) — reuse ones already uploaded during the previous feature's testing, or upload fresh ones via the existing Attach button. Check:

1. Attachments render as a horizontal row of thumbnails, image attachments show an actual image, others show a file-type icon. Row scrolls horizontally if there are enough to overflow the panel width.
2. Click an image thumbnail → modal opens showing the full image, capped in height, not distorted.
3. Click a PDF thumbnail → modal shows the PDF rendered inline (browser's native PDF viewer).
4. Click a non-previewable file (txt/zip/docx) → modal shows a large icon + "No preview available".
5. In the modal: Download button downloads the file. Delete button (only visible if you uploaded it) — first click changes it to "Confirm delete", second click actually deletes and closes the modal; the thumbnail disappears from the strip. Close via the corner X, clicking outside the modal, and Escape all dismiss it without deleting anything.
6. Open the modal, click "Delete" once (button now says "Confirm delete"), then close the modal via X instead of confirming — reopen the same attachment's modal and verify it starts back at "Delete" (not stuck on "Confirm delete") — confirms the confirm-state reset on close.

No commit — user commits manually.

---

## Self-review

**Spec coverage:** horizontal thumbnail strip (Task 1 Step 1's grid), click→modal (`selectedAttachment` state), image/PDF/other preview branching, download/delete/close footer, two-click delete confirm, no backend changes — all present. Task 2 fully removes the old list markup and its now-dead `Download` import.

**Type consistency:** `AttachmentGallery`'s prop names (`attachments`, `currentUserId`, `onDownload`, `onDelete`) match exactly what Task 2 Step 3 passes. `onDelete` takes `attachmentId: string` matching `deleteAttachment`'s 3rd parameter; `onDownload` takes the full `Attachment` object matching the existing `handleDownload(attachment: Attachment)` signature already in `task-panel.tsx`.

**Placeholder scan:** none — every step has complete, runnable code.
