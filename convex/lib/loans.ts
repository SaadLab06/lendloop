import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { LoanStatus } from "./constants";
import { rangesOverlap } from "./dates";
import { enqueueLoanEvent } from "./outbox";

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

/**
 * Rejects a date range that clashes with an approved loan. An overdue loan (end date passed,
 * not returned) still holds the tool, so it blocks every new range until the lender marks it returned.
 */
export async function assertNoApprovedOverlap(
  ctx: QueryCtx,
  toolId: Id<"tools">,
  range: { startDate: string; endDate: string },
  today: string,
): Promise<void> {
  for (const loan of await approvedLoans(ctx, toolId)) {
    if (loan.endDate < today) {
      throw new ConvexError("This tool has not come back from its last loan yet.");
    }
    if (rangesOverlap(loan, range)) {
      throw new ConvexError("Those dates overlap an approved loan for this tool.");
    }
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
export async function describeLoan(ctx: QueryCtx, loan: Doc<"loans">, today: string) {
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
    overdue: loan.status === "approved" && loan.endDate < today,
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
