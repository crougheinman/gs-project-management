import type { TiptapDoc, TiptapNode } from "@/lib/types";

// Minimal renderer for the node types the comment editor can produce
// (paragraph, text with basic marks, mention, lists, blockquote).

function renderText(node: TiptapNode, key: number) {
  let el: React.ReactNode = node.text ?? "";
  for (const mark of node.marks ?? []) {
    if (mark.type === "bold") el = <strong>{el}</strong>;
    else if (mark.type === "italic") el = <em>{el}</em>;
    else if (mark.type === "strike") el = <s>{el}</s>;
    else if (mark.type === "code")
      el = <code className="rounded bg-muted px-1 font-mono text-xs">{el}</code>;
  }
  return <span key={key}>{el}</span>;
}

function renderNode(node: TiptapNode, key: number): React.ReactNode {
  const children = (node.content ?? []).map((child, i) => renderNode(child, i));

  switch (node.type) {
    case "text":
      return renderText(node, key);
    case "mention":
      return (
        <span key={key} className="rounded bg-accent px-1 text-accent-foreground">
          @{String(node.attrs?.label ?? "member")}
        </span>
      );
    case "paragraph":
      return (
        <p key={key} className="min-h-4">
          {children}
        </p>
      );
    case "bulletList":
      return (
        <ul key={key} className="list-disc pl-5">
          {children}
        </ul>
      );
    case "orderedList":
      return (
        <ol key={key} className="list-decimal pl-5">
          {children}
        </ol>
      );
    case "listItem":
      return <li key={key}>{children}</li>;
    case "blockquote":
      return (
        <blockquote key={key} className="border-l-2 border-border pl-3 text-muted-foreground">
          {children}
        </blockquote>
      );
    case "hardBreak":
      return <br key={key} />;
    default:
      return <span key={key}>{children}</span>;
  }
}

export function CommentBody({ body }: { body: TiptapDoc }) {
  return (
    <div className="flex flex-col gap-1 text-sm text-foreground">
      {(body.content ?? []).map((node, i) => renderNode(node, i))}
    </div>
  );
}
