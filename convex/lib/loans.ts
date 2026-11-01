import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { enqueueLoanEvent } from "../outbox";
import type { LoanStatus } from "./constants";
import { rangesOverlap, todayIso } from "./dates";

export async function approvedLoans(ctx: QueryCtx, toolId: Id<"tools">) {
  return await ctx.db
    .query("loans")
    .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "approved"))
    .collect();
}

/** A tool is on loan from the start of an approved loan until the lender marks it returned (even when overdue). */
export async function isOnLoan(ctx: QueryCtx, toolId: Id<"tools">, today: string): Promise<boolean> {
  const loans = await approvedLoans(ctx, toolId);
  return loans.some((loan) => loan.startDate <= today);
}

export async function assertNoApprovedOverlap(
  ctx: QueryCtx,
  toolId: Id<"tools">,
  range: { startDate: string; endDate: string },
): Promise<void> {
  const loans = await approvedLoans(ctx, toolId);
  if (loans.some((loan) => rangesOverlap(loan, range))) {
    throw new ConvexError("Those dates overlap an approved loan for this tool.");
  }
}

/**
 * Moves a loan to a new status and queues the matching n8n event in the same transaction.
 * Every status change goes through here, so none can skip the notification.
 */
export async function changeLoanStatus(
  ctx: MutationCtx,
  loan: Doc<"loans">,
  status: LoanStatus,
  timestamps: { decidedAt?: number; returnedAt?: number } = {},
): Promise<void> {
  await ctx.db.patch("loans", loan._id, { status, ...timestamps });
  await enqueueLoanEvent(ctx, loan._id, "request.status_changed", status);
}

export function firstName(user: Doc<"users"> | null): string {
  return user?.firstName ?? user?.name ?? "A neighbor";
}

/** The shape every loan list in the UI uses. People appear by first name only. */
export async function describeLoan(ctx: QueryCtx, loan: Doc<"loans">) {
  const [tool, lender, borrower, activity] = await Promise.all([
    ctx.db.get("tools", loan.toolId),
    ctx.db.get("users", loan.lenderId),
    ctx.db.get("users", loan.borrowerId),
    ctx.db
      .query("activity")
      .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
      .order("desc")
      .take(3),
  ]);
  return {
    _id: loan._id,
    toolName: tool?.name ?? "Removed tool",
    startDate: loan.startDate,
    endDate: loan.endDate,
    message: loan.message,
    status: loan.status,
    overdue: loan.status === "approved" && loan.endDate < todayIso(),
    lenderName: firstName(lender),
    borrowerName: firstName(borrower),
    requestedAt: loan._creationTime,
    // Bonus: recent automation activity, e.g. "Reminder sent" with a time the UI shows as "2 days ago".
    activity: activity.map((row) => ({
      kind: row.kind,
      status: row.status,
      summary: row.summary,
      at: row._creationTime,
    })),
  };
}
