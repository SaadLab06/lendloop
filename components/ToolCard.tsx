"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState, type FormEvent, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { categoryLabel, conditionLabel, formatRange, todayUtc } from "@/lib/format";
import { useSubmit } from "@/lib/useSubmit";
import { Badge, Button, Card, ErrorText, Field, inputClass } from "./ui";

export type ToolView = FunctionReturnType<typeof api.tools.list>[number];

/** One tool on the Browse page, with an inline form to request it. */
export function ToolCard({ tool, action }: { tool: ToolView; action?: ReactNode }) {
  const [requesting, setRequesting] = useState(false);
  const [sent, setSent] = useState(false);
  // An overdue loan blocks new requests until the lender marks the tool returned.
  const overdue = tool.bookings.some((booking) => booking.overdue);

  // Pages can pass their own action (the admin view passes "Remove"). Otherwise others' tools get a request button.
  let footerAction = action;
  if (footerAction === undefined && !tool.isMine && !overdue) {
    if (sent) {
      footerAction = <span className="text-brand">Request sent. Track it under My requests.</span>;
    } else if (!requesting) {
      footerAction = (
        <Button variant="secondary" onClick={() => setRequesting(true)}>
          Request to borrow
        </Button>
      );
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{tool.name}</h3>
          <p className="mt-0.5 text-sm text-muted">
            {categoryLabel(tool.category)} · {conditionLabel(tool.condition)}
          </p>
        </div>
        {tool.available ? (
          <Badge tone="green">Available</Badge>
        ) : overdue ? (
          <Badge tone="red">Overdue</Badge>
        ) : (
          <Badge tone="amber">On loan</Badge>
        )}
      </div>

      <p className="text-sm">{tool.description}</p>

      {tool.bookings.length > 0 && (
        <p className="text-xs text-muted">
          {overdue ? "Not returned yet. " : ""}
          Booked: {tool.bookings.map((b) => formatRange(b.startDate, b.endDate)).join(", ")}
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-sm">
        <span className="flex items-center gap-2 text-muted">
          {tool.isMine ? "Your listing" : `Lent by ${tool.ownerName}`}
          {tool.ownerTrusted && <Badge tone="violet">Trusted Lender</Badge>}
        </span>
        {footerAction}
      </div>

      {requesting && !sent && (
        <RequestForm
          toolId={tool._id}
          onCancel={() => setRequesting(false)}
          onSent={() => {
            setRequesting(false);
            setSent(true);
          }}
        />
      )}
    </Card>
  );
}

function RequestForm({ toolId, onCancel, onSent }: { toolId: ToolView["_id"]; onCancel: () => void; onSent: () => void }) {
  const today = todayUtc();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [message, setMessage] = useState("");
  const request = useSubmit(useMutation(api.loans.request));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await request.run({ toolId, startDate, endDate, message: message.trim() || undefined })) onSent();
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-lg bg-stone-50 p-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="From">
          <input type="date" required min={today} value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Until">
          <input type="date" required min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
        </Field>
      </div>
      <Field label="Message (optional)" hint="Up to 280 characters. Shown to the lender only.">
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={280} rows={2} className={inputClass} />
      </Field>
      <ErrorText>{request.error}</ErrorText>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={request.pending}>
          {request.pending ? "Sending..." : "Send request"}
        </Button>
      </div>
    </form>
  );
}
