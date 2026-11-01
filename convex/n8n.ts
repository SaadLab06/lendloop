// Internal functions behind the signed /n8n/* HTTP endpoints in http.ts.
// They are internal, so only those endpoints (after checking the signature) can call them,
// and each one returns only the fields n8n needs for one job.
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import type { LoanStatus } from "./lib/constants";
import { assertIsoDate, daysBetween, isIsoDate } from "./lib/dates";
import { firstName } from "./lib/loans";

const MAX_BATCH = 100;

// Who hears about each status: the lender learns about new and cancelled requests,
// the borrower learns the lender's answer and that the loan is closed.
const RECIPIENT: Record<LoanStatus, "lender" | "borrower"> = {
  pending: "lender",
  cancelled: "lender",
  approved: "borrower",
  declined: "borrower",
  returned: "borrower",
};

const NOTIFICATION_SUMMARY: Record<LoanStatus, string> = {
  pending: "Lender notified of the new request",
  cancelled: "Lender notified that the request was cancelled",
  approved: "Borrower notified of the approval",
  declined: "Borrower notified that the request was declined",
  returned: "Borrower notified that the loan is closed",
};

async function findActivity(ctx: QueryCtx, idempotencyKey: string) {
  return await ctx.db
    .query("activity")
    .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", idempotencyKey))
    .unique();
}

async function getEventForLoan(ctx: QueryCtx, eventId: Id<"outbox">, loanId: Id<"loans">) {
  const event = await ctx.db.get("outbox", eventId);
  // The token names both ids; they must belong together, which scopes the call to one loan.
  if (event === null || event.loanId !== loanId) return null;
  return event;
}

/** The few fields the notification needs, for one event on one loan. */
export const loanContext = internalQuery({
  args: { eventId: v.id("outbox"), loanId: v.id("loans") },
  handler: async (ctx, { eventId, loanId }) => {
    const event = await getEventForLoan(ctx, eventId, loanId);
    const loan = await ctx.db.get("loans", loanId);
    if (event === null || loan === null) return null;
    const tool = await ctx.db.get("tools", loan.toolId);
    const audience = RECIPIENT[event.status];
    const recipient: Doc<"users"> | null = await ctx.db.get(
      "users",
      audience === "lender" ? loan.lenderId : loan.borrowerId,
    );
    return {
      alreadyNotified: (await findActivity(ctx, eventId)) !== null,
      audience,
      status: event.status,
      recipient: { email: recipient?.email ?? null, firstName: firstName(recipient) },
      toolName: tool?.name ?? "a tool",
      startDate: loan.startDate,
      endDate: loan.endDate,
    };
  },
});

/** Idempotent on the event id: n8n retries and duplicate webhook deliveries create one record. */
export const recordNotification = internalMutation({
  args: {
    eventId: v.id("outbox"),
    loanId: v.id("loans"),
    status: v.union(v.literal("sent"), v.literal("failed")),
  },
  handler: async (ctx, { eventId, loanId, status }) => {
    const event = await getEventForLoan(ctx, eventId, loanId);
    if (event === null) return null;
    if ((await findActivity(ctx, eventId)) !== null) return { created: false };
    await ctx.db.insert("activity", {
      loanId,
      kind: "notification",
      idempotencyKey: eventId,
      status,
      summary: status === "sent" ? NOTIFICATION_SUMMARY[event.status] : "Notification could not be sent (no email on file)",
    });
    return { created: true };
  },
});

function reminderKey(loanId: Id<"loans">, date: string): string {
  return `${loanId}:${date}`;
}

/**
 * Approved loans whose end date has passed, grouped by borrower so each borrower gets one reminder.
 * Loans already reminded today are left out, so a second run on the same day sends nothing.
 */
export const overdueLoans = internalQuery({
  args: { date: v.string() }, // today, passed in by http.ts (see assertIsoDate for why)
  handler: async (ctx, args) => {
    const date = assertIsoDate(args.date);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_status_end_date", (q) => q.eq("status", "approved").lt("endDate", date))
      .take(500);

    const byBorrower = new Map<Id<"users">, { loanId: Id<"loans">; toolName: string; endDate: string; daysOverdue: number }[]>();
    for (const loan of loans) {
      if ((await findActivity(ctx, reminderKey(loan._id, date))) !== null) continue;
      const tool = await ctx.db.get("tools", loan.toolId);
      const entry = {
        loanId: loan._id,
        toolName: tool?.name ?? "a tool",
        endDate: loan.endDate,
        daysOverdue: daysBetween(loan.endDate, date),
      };
      byBorrower.set(loan.borrowerId, [...(byBorrower.get(loan.borrowerId) ?? []), entry]);
    }

    const borrowers = [];
    for (const [borrowerId, overdue] of byBorrower) {
      const borrower = await ctx.db.get("users", borrowerId);
      borrowers.push({ email: borrower?.email ?? null, firstName: firstName(borrower), loans: overdue });
    }
    return { date, borrowers };
  },
});

/** Idempotent on "loanId:date": running the workflow twice, or retrying the call, creates one reminder per loan per day. */
export const recordReminders = internalMutation({
  args: {
    date: v.string(),
    loanIds: v.array(v.id("loans")),
    status: v.union(v.literal("sent"), v.literal("failed")),
  },
  handler: async (ctx, { date, loanIds, status }) => {
    if (!isIsoDate(date) || loanIds.length === 0 || loanIds.length > MAX_BATCH) {
      throw new ConvexError("Invalid reminder batch");
    }
    let created = 0;
    let skipped = 0;
    for (const loanId of loanIds) {
      const key = reminderKey(loanId, date);
      if ((await ctx.db.get("loans", loanId)) === null || (await findActivity(ctx, key)) !== null) {
        skipped++;
        continue;
      }
      await ctx.db.insert("activity", {
        loanId,
        kind: "reminder",
        idempotencyKey: key,
        status,
        summary: status === "sent" ? "Overdue reminder sent to the borrower" : "Overdue reminder could not be sent",
      });
      created++;
    }
    return { created, skipped };
  },
});

/** Called by the n8n error workflow. Idempotent on the failed execution's id. */
export const recordFailure = internalMutation({
  args: {
    executionId: v.string(),
    workflow: v.string(),
    node: v.optional(v.string()),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const executionId = args.executionId.slice(0, 100);
    const existing = await ctx.db
      .query("automationFailures")
      .withIndex("by_execution_id", (q) => q.eq("executionId", executionId))
      .unique();
    if (existing !== null) return { created: false };
    const { workflow, node, message } = args;
    await ctx.db.insert("automationFailures", {
      executionId,
      workflow: workflow.slice(0, 200),
      node: node?.slice(0, 200),
      message: message.slice(0, 1000),
    });
    return { created: true };
  },
});
