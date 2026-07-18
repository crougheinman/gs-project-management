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
      <div className="mt-1 flex gap-2 pb-1">
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
