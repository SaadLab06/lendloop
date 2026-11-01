"use client";

import type { FunctionReturnType } from "convex/server";
import type { ReactNode } from "react";
import type { api } from "@/convex/_generated/api";
import type { LoanStatus } from "@/convex/lib/constants";
import { formatRange, timeAgo } from "@/lib/format";
import { Card, Status } from "./ui";

export type LoanView = FunctionReturnType<typeof api.loans.myRequests>[number];

const STATUS: Record<LoanStatus, { label: string; tone: "free" | "loan" | "done" }> = {
  pending: { label: "Waiting for the lender", tone: "loan" },
  approved: { label: "Approved", tone: "free" },
  declined: { label: "Declined", tone: "done" },
  cancelled: { label: "Cancelled", tone: "done" },
  returned: { label: "Returned", tone: "done" },
};

/**
 * A request or loan. `perspective` decides whose name is shown: borrowers see the lender,
 * lenders see the borrower, and the admin view sees both.
 */
export function LoanCard({
  loan,
  perspective,
  actions,
}: {
  loan: LoanView;
  perspective: "borrower" | "lender" | "admin";
  actions?: ReactNode;
}) {
  const status = STATUS[loan.status];
  const people =
    perspective === "borrower"
      ? `From ${loan.lenderName}`
      : perspective === "lender"
        ? `${loan.borrowerName} wants to borrow it`
        : `${loan.borrowerName} borrows from ${loan.lenderName}`;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-medium">{loan.toolName}</h3>
          <p className="mt-0.5 text-sm text-muted">{people}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {loan.overdue && <Status tone="late">Overdue</Status>}
          <Status tone={status.tone}>{status.label}</Status>
        </div>
      </div>

      <p className="text-sm">
        <span className="font-mono">{formatRange(loan.startDate, loan.endDate)}</span>
        <span className="text-muted"> · requested {timeAgo(loan.requestedAt)}</span>
      </p>

      {loan.message && <p className="rounded-lg bg-raised/60 px-3 py-2 text-sm">&ldquo;{loan.message}&rdquo;</p>}

      {loan.activity.length > 0 && (
        <ul className="space-y-1 border-t border-line pt-4 text-xs text-muted" aria-label="Automation activity">
          {loan.activity.map((item) => (
            <li key={`${item.kind}-${item.at}`} className="flex items-center gap-2">
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${item.status === "sent" ? "bg-brand" : "bg-danger"}`} />
              {item.summary} · {timeAgo(item.at)}
            </li>
          ))}
        </ul>
      )}

      {actions && <div className="flex flex-wrap justify-end gap-2">{actions}</div>}
    </Card>
  );
}
