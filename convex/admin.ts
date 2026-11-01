// Admin-only functions. Every handler starts with requireAdmin, so a non-admin gets an error
// even if they call these directly with the Convex client.
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import { roleValidator } from "./lib/constants";
import { describeLoan } from "./lib/loans";

export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").order("desc").take(200);
    return users.map((user) => ({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      trustedLender: user.trustedLender,
    }));
  },
});

export const listLoans = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const loans = await ctx.db.query("loans").order("desc").take(200);
    return await Promise.all(loans.map((loan) => describeLoan(ctx, loan)));
  },
});

export const setRole = mutation({
  args: { userId: v.id("users"), role: roleValidator },
  handler: async (ctx, { userId, role }) => {
    const admin = await requireAdmin(ctx);
    if (userId === admin._id) {
      // Stops an admin from locking everyone out by demoting themselves.
      throw new ConvexError("You cannot change your own role.");
    }
    const user = await ctx.db.get("users", userId);
    if (user === null) throw new ConvexError("User not found.");
    await ctx.db.patch("users", userId, { role });
  },
});

export const setTrustedLender = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, { userId, trusted }) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get("users", userId);
    if (user === null) throw new ConvexError("User not found.");
    await ctx.db.patch("users", userId, { trustedLender: trusted });
  },
});

/** Everything that went wrong in the automation: undelivered outbox events and failed n8n runs. */
export const automationHealth = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const [failedEvents, pendingEvents, failures] = await Promise.all([
      ctx.db
        .query("outbox")
        .withIndex("by_state", (q) => q.eq("state", "failed"))
        .order("desc")
        .take(50),
      ctx.db
        .query("outbox")
        .withIndex("by_state", (q) => q.eq("state", "pending"))
        .take(50),
      ctx.db.query("automationFailures").order("desc").take(50),
    ]);
    return {
      pendingCount: pendingEvents.length,
      failedEvents: failedEvents.map((event) => ({
        _id: event._id,
        loanId: event.loanId,
        type: event.type,
        status: event.status,
        attempts: event.attempts,
        lastError: event.lastError,
        at: event._creationTime,
      })),
      workflowFailures: failures.map((failure) => ({
        _id: failure._id,
        workflow: failure.workflow,
        node: failure.node,
        message: failure.message,
        executionId: failure.executionId,
        at: failure._creationTime,
      })),
    };
  },
});

/** Puts a failed outbox event back in the queue, for example after fixing the webhook URL. */
export const retryEvent = mutation({
  args: { outboxId: v.id("outbox") },
  handler: async (ctx, { outboxId }) => {
    await requireAdmin(ctx);
    const event = await ctx.db.get("outbox", outboxId);
    if (event === null || event.state !== "failed") {
      throw new ConvexError("Only failed events can be retried.");
    }
    await ctx.db.patch("outbox", outboxId, { state: "pending", attempts: 0, lastError: undefined });
    await ctx.scheduler.runAfter(0, internal.outbox.deliver, { outboxId });
  },
});
