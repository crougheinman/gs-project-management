"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { CustomField, CustomFieldValue, Profile } from "@/lib/types";

const NONE = "__none__";

type ValuePatch = Partial<Omit<CustomFieldValue, "id" | "custom_field_id" | "task_id">>;

export function CustomFieldInput({
  field,
  value,
  members,
  onChange,
}: {
  field: CustomField;
  value: CustomFieldValue | undefined;
  members: Profile[];
  onChange: (patch: ValuePatch) => void;
}) {
  switch (field.field_type) {
    case "text":
      return (
        <Input
          defaultValue={value?.value_text ?? ""}
          aria-label={field.name}
          className="h-8 text-sm"
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v !== (value?.value_text ?? "")) onChange({ value_text: v || null });
          }}
        />
      );
    case "number":
      return (
        <Input
          type="number"
          defaultValue={value?.value_number ?? ""}
          aria-label={field.name}
          className="h-8 text-sm"
          onBlur={(e) => {
            const v = e.target.value === "" ? null : Number(e.target.value);
            if (v !== (value?.value_number ?? null)) onChange({ value_number: v });
          }}
        />
      );
    case "date":
      return (
        <input
          type="date"
          value={value?.value_date ?? ""}
          aria-label={field.name}
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(e) => onChange({ value_date: e.target.value || null })}
        />
      );
    case "checkbox":
      return (
        <Checkbox
          checked={value?.value_boolean ?? false}
          aria-label={field.name}
          onCheckedChange={(c) => onChange({ value_boolean: c === true })}
        />
      );
    case "person":
      return (
        <Select
          value={value?.value_user_id ?? NONE}
          onValueChange={(v) => onChange({ value_user_id: v === NONE ? null : v })}
        >
          <SelectTrigger aria-label={field.name} className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>None</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.full_name || m.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "single_select": {
      const current = value?.value_option_ids?.[0] ?? NONE;
      return (
        <Select
          value={current}
          onValueChange={(v) => onChange({ value_option_ids: !v || v === NONE ? null : [v] })}
        >
          <SelectTrigger aria-label={field.name} className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>None</SelectItem>
            {field.options.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    case "multi_select": {
      const selected = new Set(value?.value_option_ids ?? []);
      return (
        <div className="flex flex-wrap gap-1">
          {field.options.map((o) => {
            const on = selected.has(o.id);
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={on}
                aria-label={`${field.name}: ${o.label}`}
                className="cursor-pointer"
                onClick={() => {
                  const next = new Set(selected);
                  if (on) next.delete(o.id);
                  else next.add(o.id);
                  onChange({ value_option_ids: next.size ? [...next] : null });
                }}
              >
                <Badge variant={on ? "default" : "outline"}>{o.label}</Badge>
              </button>
            );
          })}
        </div>
      );
    }
    default:
      return null;
  }
}
