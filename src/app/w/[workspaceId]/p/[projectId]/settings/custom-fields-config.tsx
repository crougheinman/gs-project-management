"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CustomField, CustomFieldType, SelectOption } from "@/lib/types";
import { createCustomField, deleteCustomField } from "../actions";

const FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "single_select", label: "Single select" },
  { value: "multi_select", label: "Multi select" },
  { value: "date", label: "Date" },
  { value: "checkbox", label: "Checkbox" },
  { value: "person", label: "Person" },
];

function slug(label: string) {
  return label.toLowerCase().replace(/\s+/g, "-").slice(0, 40) + "-" + Math.random().toString(36).slice(2, 6);
}

export function CustomFieldsConfig({
  workspaceId,
  projectId,
  fields,
}: {
  workspaceId: string;
  projectId: string;
  fields: CustomField[];
}) {
  const [, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [fieldType, setFieldType] = useState<CustomFieldType>("text");
  const [optionsText, setOptionsText] = useState("");

  const needsOptions = fieldType === "single_select" || fieldType === "multi_select";

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      try {
        await action();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const options: SelectOption[] = needsOptions
      ? optionsText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((label) => ({ id: slug(label), label }))
      : [];
    if (needsOptions && options.length === 0) {
      toast.error("Add at least one comma-separated option");
      return;
    }
    setName("");
    setOptionsText("");
    run(() => createCustomField(workspaceId, projectId, { name: trimmed, fieldType, options }));
  }

  return (
    <div>
      <h3 className="text-sm font-medium text-foreground">Custom fields</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Extra structured columns shown on every task in this project.
      </p>

      {fields.length > 0 && (
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
          {fields.map((field) => (
            <li key={field.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="text-sm text-foreground">{field.name}</span>
                <Badge variant="secondary">{field.field_type.replace("_", " ")}</Badge>
                {field.options.map((o) => (
                  <Badge key={o.id} variant="outline">
                    {o.label}
                  </Badge>
                ))}
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete field ${field.name}`}
                onClick={() => run(() => deleteCustomField(workspaceId, projectId, field.id))}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="cf-name" className="text-xs">
            Field name
          </Label>
          <Input
            id="cf-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Priority"
            className="h-8 w-40 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="cf-type" className="text-xs">
            Type
          </Label>
          <Select
            value={fieldType}
            items={Object.fromEntries(FIELD_TYPES.map((t) => [t.value, t.label]))}
            onValueChange={(v) => v && setFieldType(v as CustomFieldType)}
          >
            <SelectTrigger id="cf-type" className="h-8 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FIELD_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {needsOptions && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="cf-options" className="text-xs">
              Options (comma-separated)
            </Label>
            <Input
              id="cf-options"
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              placeholder="Low, Medium, High"
              className="h-8 w-56 text-sm"
            />
          </div>
        )}
        <Button size="sm" onClick={add}>
          Add field
        </Button>
      </div>
    </div>
  );
}
