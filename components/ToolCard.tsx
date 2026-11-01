"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState, type FormEvent, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { categoryLabel, conditionLabel, formatRange, nextDays, todayUtc } from "@/lib/format";
import { useSubmit } from "@/lib/useSubmit";
import { Badge, Button, Card, ErrorText, Field, inputClass, Status } from "./ui";

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
      footerAction = <span className="text-muted">Request sent. Track it under My requests.</span>;
    } else if (!requesting) {
      footerAction = (
        <Button variant="secondary" onClick={() => setRequesting(true)}>
          Request to borrow
        </Button>
      );
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-medium">{tool.name}</h3>
          <p className="mt-0.5 text-sm text-muted">
            {categoryLabel(tool.category)} · {conditionLabel(tool.condition)}
          </p>
        </div>
        {tool.available ? (
          <Status tone="free">Available</Status>
        ) : overdue ? (
          <Status tone="late">Overdue</Status>
        ) : (
          <Status tone="loan">On loan</Status>
        )}
      </div>

      <p className="text-sm">{tool.description}</p>

      <div className="grid gap-2">
        <DayStrip bookings={tool.bookings} overdue={overdue} />
        <p className="font-mono text-xs text-muted">
          {overdue ? "Not returned yet. " : ""}
          {tool.bookings.length > 0
            ? `Booked ${tool.bookings.map((b) => formatRange(b.startDate, b.endDate)).join(", ")}`
            : "No bookings"}
        </p>
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm">
        <span className="flex items-center gap-2 text-muted">
          {tool.isMine ? "Your listing" : `Lent by ${tool.ownerName}`}
          {tool.ownerTrusted && <Badge>Trusted Lender</Badge>}
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

const STRIP_DAYS = 14;

/**
 * The next two weeks at a glance, drawn from the approved bookings the card already has.
 * Hidden from screen readers because the "Booked ..." line under it says the same thing in words.
 */
function DayStrip({ bookings, overdue }: { bookings: ToolView["bookings"]; overdue: boolean }) {
  const today = todayUtc();
  return (
    <div aria-hidden="true" className="grid grid-cols-14 gap-1">
      {nextDays(today, STRIP_DAYS).map((day) => {
        const isToday = day === today;
        const booked = bookings.some((b) => b.startDate <= day && day <= b.endDate);
        // An overdue tool is still out today even though its booking has ended.
        const fill = isToday && overdue ? "bg-danger" : booked ? "bg-loan" : "bg-raised";
        return (
          <div key={day} className="flex flex-col items-center gap-1">
            <span className={`h-5 w-full rounded-sm ${fill} ${isToday ? "ring-1 ring-ink ring-offset-1 ring-offset-card" : ""}`} />
            <span className={`font-mono text-[11px] ${isToday ? "text-ink" : "text-muted"}`}>{Number(day.slice(8))}</span>
          </div>
        );
      })}
    </div>
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
    <form onSubmit={submit} className="grid gap-3 rounded-lg bg-raised/60 p-4">
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
