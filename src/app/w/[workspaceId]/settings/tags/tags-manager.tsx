"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { Tag } from "@/lib/types";
import {
  createWorkspaceTag,
  deleteWorkspaceTag,
  updateWorkspaceTagColor,
} from "./actions";

const COLORS = ["#4f46e5", "#7c3aed", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#64748b"];

export function TagsManager({
  workspaceId,
  tags,
  canDelete,
}: {
  workspaceId: string;
  tags: Tag[];
  canDelete: boolean;
}) {
  const [, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      try {
        await action();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <div>
      {tags.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {tags.map((tag) => (
            <li key={tag.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <Badge
                style={tag.color ? { backgroundColor: tag.color, color: "#fff" } : undefined}
                variant={tag.color ? "default" : "secondary"}
              >
                {tag.name}
              </Badge>
              <div className="flex items-center gap-1">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Set ${tag.name} color`}
                    className="size-4 cursor-pointer rounded-full border border-border"
                    style={{ backgroundColor: c }}
                    onClick={() => run(() => updateWorkspaceTagColor(workspaceId, tag.id, c))}
                  />
                ))}
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete tag ${tag.name}`}
                    onClick={() => run(() => deleteWorkspaceTag(workspaceId, tag.id))}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="new-tag" className="text-xs text-muted-foreground">
            New tag
          </label>
          <Input
            id="new-tag"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. urgent"
            className="h-8 w-40 text-sm"
          />
        </div>
        <div className="flex items-center gap-1 pb-1">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Pick color ${c}`}
              aria-pressed={color === c}
              className="size-5 cursor-pointer rounded-full border-2"
              style={{ backgroundColor: c, borderColor: color === c ? "#0f172a" : "transparent" }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <Button
          size="sm"
          onClick={() => {
            if (!name.trim()) return;
            const n = name.trim();
            setName("");
            run(() => createWorkspaceTag(workspaceId, n, color));
          }}
        >
          Add tag
        </Button>
      </div>
    </div>
  );
}
