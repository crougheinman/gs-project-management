"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { EditorContent, ReactRenderer, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import type { SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";
import { Button } from "@/components/ui/button";
import type { Profile, TiptapDoc } from "@/lib/types";
import { cn } from "@/lib/utils";

type MentionItem = { id: string; label: string };

// ---------------------------------------------------------------------------
// Mention dropdown (rendered into a fixed-position container, no tippy)
// ---------------------------------------------------------------------------

type MentionListHandle = { onKeyDown: (props: SuggestionKeyDownProps) => boolean };

const MentionList = forwardRef<MentionListHandle, SuggestionProps<MentionItem>>(
  function MentionList(props, ref) {
    const [selected, setSelected] = useState(0);

    useEffect(() => setSelected(0), [props.items]);

    function select(index: number) {
      const item = props.items[index];
      if (item) props.command(item);
    }

    useImperativeHandle(ref, () => ({
      onKeyDown({ event }) {
        if (event.key === "ArrowDown") {
          setSelected((s) => (s + 1) % props.items.length);
          return true;
        }
        if (event.key === "ArrowUp") {
          setSelected((s) => (s - 1 + props.items.length) % props.items.length);
          return true;
        }
        if (event.key === "Enter") {
          select(selected);
          return true;
        }
        return false;
      },
    }));

    if (props.items.length === 0) return null;

    return (
      <div className="z-50 min-w-40 overflow-hidden rounded-md border border-border bg-popover p-1 shadow-md">
        {props.items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={cn(
              "block w-full cursor-pointer rounded px-2 py-1 text-left text-sm",
              index === selected ? "bg-accent text-accent-foreground" : "text-popover-foreground",
            )}
            onClick={() => select(index)}
          >
            {item.label}
          </button>
        ))}
      </div>
    );
  },
);

function mentionSuggestion(members: Profile[]) {
  return {
    items: ({ query }: { query: string }): MentionItem[] =>
      members
        .map((m) => ({ id: m.id, label: m.full_name || m.email }))
        .filter((m) => m.label.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 6),
    render: () => {
      let renderer: ReactRenderer<MentionListHandle, SuggestionProps<MentionItem>> | null = null;
      let container: HTMLDivElement | null = null;

      function position(clientRect?: (() => DOMRect | null) | null) {
        if (!container || !clientRect) return;
        const rect = clientRect();
        if (!rect) return;
        container.style.left = `${rect.left}px`;
        container.style.top = `${rect.bottom + 4}px`;
      }

      return {
        onStart: (props: SuggestionProps<MentionItem>) => {
          renderer = new ReactRenderer(MentionList, { props, editor: props.editor });
          container = document.createElement("div");
          container.style.position = "fixed";
          container.style.zIndex = "50";
          container.appendChild(renderer.element);
          document.body.appendChild(container);
          position(props.clientRect);
        },
        onUpdate: (props: SuggestionProps<MentionItem>) => {
          renderer?.updateProps(props);
          position(props.clientRect);
        },
        onKeyDown: (props: SuggestionKeyDownProps) => {
          if (props.event.key === "Escape") return true;
          return renderer?.ref?.onKeyDown(props) ?? false;
        },
        onExit: () => {
          renderer?.destroy();
          container?.remove();
          renderer = null;
          container = null;
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

export function CommentEditor({
  members,
  onSubmit,
  submitting,
}: {
  members: Profile[];
  onSubmit: (body: TiptapDoc) => void;
  submitting?: boolean;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, horizontalRule: false }),
      Mention.configure({
        HTMLAttributes: { class: "rounded bg-accent px-1 text-accent-foreground" },
        suggestion: mentionSuggestion(members),
      }),
    ],
    editorProps: {
      attributes: {
        class:
          "min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring prose-sm",
        "aria-label": "Write a comment. Type @ to mention someone.",
      },
    },
  });

  function submit() {
    if (!editor || editor.isEmpty) return;
    onSubmit(editor.getJSON() as TiptapDoc);
    editor.commands.clearContent();
  }

  return (
    <div className="flex flex-col gap-2">
      <EditorContent editor={editor} />
      <div className="flex justify-end">
        <Button size="sm" onClick={submit} disabled={submitting || !editor}>
          {submitting ? "Posting..." : "Comment"}
        </Button>
      </div>
    </div>
  );
}
