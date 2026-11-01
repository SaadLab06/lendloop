import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { assertBorrower, assertLender, isAdmin, requireUser } from "./lib/auth";
import { LIMITS } from "./lib/constants";
import { assertValidLoanRange, todayIso } from "./lib/dates";
import { assertNoApprovedOverlap, changeLoanStatus, describeLoan } from "./lib/loans";
import { cleanText } from "./lib/validation";
import { enqueueLoanEvent } from "./outbox";

async function getLoan(ctx: QueryCtx, loanId: Id<"loans">) {
  const loan = await ctx.db.get("loans", loanId);
  if (loan === null) throw new ConvexError("This request no longer exists.");
  return loan;
}

export const request = mutation({
  args: {
    toolId: v.id("tools"),
    startDate: v.string(),
    endDate: v.string(),
    message: v.optional(v.string()),
  },
  handler: async (ctx, { toolId, startDate, endDate, message }) => {
    const user = await requireUser(ctx);
    const tool = await ctx.db.get("tools", toolId);
    if (tool === null || tool.status !== "listed") {
      throw new ConvexError("This tool is no longer listed.");
    }
    if (tool.ownerId === user._id) {
      throw new ConvexError("You cannot borrow your own tool.");
    }
    const range = { startDate, endDate };
    assertValidLoanRange(range, todayIso());
    await assertNoApprovedOverlap(ctx, toolId, range);

    const pending = await ctx.db
      .query("loans")
      .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "pending"))
      .collect();
    if (pending.some((loan) => loan.borrowerId === user._id)) {
      throw new ConvexError("You already have a pending request for this tool.");
    }

    const note = cleanText(message ?? "", "Message", { max: LIMITS.message, required: false });
    const loanId = await ctx.db.insert("loans", {
      toolId,
      lenderId: tool.ownerId,
      borrowerId: user._id,
      startDate,
      endDate,
      message: note === "" ? undefined : note,
      status: "pending",
    });
    await enqueueLoanEvent(ctx, loanId, "request.created", "pending");
    return loanId;
  },
});

export const approve = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const user = await requireUser(ctx);
    const loan = await getLoan(ctx, loanId);
    assertLender(user, loan);
    if (loan.status !== "pending") throw new ConvexError("Only pending requests can be approved.");
    if (loan.startDate < todayIso()) {
      throw new ConvexError("The start date has passed. Ask the borrower for new dates.");
    }
    const tool = await ctx.db.get("tools", loan.toolId);
    if (tool === null || tool.status !== "listed") {
      throw new ConvexError("This tool is no longer listed.");
    }
    // Checked again here: two pending requests may overlap, and only one can win.
    await assertNoApprovedOverlap(ctx, loan.toolId, loan);
    await changeLoanStatus(ctx, loan, "approved", { decidedAt: Date.now() });
  },
});

export const decline = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const user = await requireUser(ctx);
    const loan = await getLoan(ctx, loanId);
    assertLender(user, loan);
    if (loan.status !== "pending") throw new ConvexError("Only pending requests can be declined.");
    await changeLoanStatus(ctx, loan, "declined", { decidedAt: Date.now() });
  },
});

/** The borrower withdraws a request that has not been answered yet. */
export const cancel = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const user = await requireUser(ctx);
    const loan = await getLoan(ctx, loanId);
    assertBorrower(user, loan);
    if (loan.status !== "pending") throw new ConvexError("Only pending requests can be cancelled.");
    await changeLoanStatus(ctx, loan, "cancelled", { decidedAt: Date.now() });
  },
});

/** The lender (who gets the tool back) or an admin closes an approved loan. */
export const markReturned = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const user = await requireUser(ctx);
    const loan = await getLoan(ctx, loanId);
    if (!isAdmin(user)) assertLender(user, loan);
    if (loan.status !== "approved") throw new ConvexError("Only approved loans can be marked returned.");
    await changeLoanStatus(ctx, loan, "returned", { returnedAt: Date.now() });
  },
});

/** Requests the signed-in user made as a borrower. */
export const myRequests = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", user._id))
      .order("desc")
      .take(100);
    return await Promise.all(loans.map((loan) => describeLoan(ctx, loan)));
  },
});

/** Requests for the signed-in user's tools. */
export const incoming = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_lender", (q) => q.eq("lenderId", user._id))
      .order("desc")
      .take(100);
    return await Promise.all(loans.map((loan) => describeLoan(ctx, loan)));
  },
});
