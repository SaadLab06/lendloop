"use client";

import { useState, type FormEvent } from "react";
import { CATEGORY_LABELS, CONDITION_LABELS, LIMITS, type Category, type Condition } from "@/convex/lib/constants";
import { Button, ErrorText, Field, inputClass } from "./ui";

export type ToolFields = { name: string; category: Category; condition: Condition; description: string };

const EMPTY: ToolFields = { name: "", category: "power_tools", condition: "good", description: "" };

/** Create and edit form for a listing. The server validates again; this only helps the user. */
export function ToolForm({
  initial = EMPTY,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  initial?: ToolFields;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (fields: ToolFields) => void;
  onCancel: () => void;
}) {
  const [fields, setFields] = useState<ToolFields>(initial);
  const set = <K extends keyof ToolFields>(key: K, value: ToolFields[K]) => setFields((f) => ({ ...f, [key]: value }));

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit(fields);
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <Field label="Name">
        <input
          required
          maxLength={LIMITS.toolName}
          value={fields.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Cordless drill"
          className={inputClass}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category">
          <select value={fields.category} onChange={(e) => set("category", e.target.value as Category)} className={inputClass}>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Condition">
          <select value={fields.condition} onChange={(e) => set("condition", e.target.value as Condition)} className={inputClass}>
            {Object.entries(CONDITION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Short description" hint={`${fields.description.length}/${LIMITS.description} characters`}>
        <textarea
          required
          maxLength={LIMITS.description}
          rows={3}
          value={fields.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="18V with two batteries. Please return it charged."
          className={inputClass}
        />
      </Field>
      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
