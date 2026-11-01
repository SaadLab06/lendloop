// Delivery side of the transactional outbox (Convex -> n8n).
//
// Mutations queue events with enqueueLoanEvent (lib/outbox.ts) in the same transaction as the
// loan change. deliver() then POSTs a signed event to the n8n webhook. Failed attempts are
// retried with exponential backoff; after MAX_ATTEMPTS the row is marked "failed" and shows up
// in the admin view. A cron re-queues rows whose delivery action died without recording anything.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { signJws } from "./lib/jws";

export const MAX_ATTEMPTS = 5;
export const BASE_RETRY_DELAY_MS = 10_000; // 10s, 20s, 40s, 80s between the five attempts
export const STUCK_AFTER_MS = 5 * 60_000; // longer than any retry delay
const REQUEST_TIMEOUT_MS = 10_000;
const TOKEN_LIFETIME_SECONDS = 300;

export function retryDelayMs(attempts: number): number {
  return BASE_RETRY_DELAY_MS * 2 ** (attempts - 1);
}

export const get = internalQuery({
  args: { outboxId: v.id("outbox") },
  handler: async (ctx, { outboxId }) => await ctx.db.get("outbox", outboxId),
});

export const deliver = internalAction({
  args: { outboxId: v.id("outbox") },
  handler: async (ctx, { outboxId }) => {
    const event = await ctx.runQuery(internal.outbox.get, { outboxId });
    if (event === null || event.state !== "pending") return;

    try {
      const url = process.env.N8N_WEBHOOK_URL;
      const secret = process.env.N8N_WEBHOOK_SECRET;
      if (!url || !secret) {
        throw new Error("N8N_WEBHOOK_URL or N8N_WEBHOOK_SECRET is not set");
      }
      const iat = Math.floor(Date.now() / 1000);
      // Data minimization: the event carries ids and a status only. n8n fetches the few
      // fields it needs for the message from the signed /n8n/loan-context endpoint.
      const token = await signJws(
        {
          iss: "lendloop-convex",
          aud: "lendloop-n8n",
          jti: event._id, // the event id; n8n dedupes on it
          iat,
          exp: iat + TOKEN_LIFETIME_SECONDS,
          loanId: event.loanId,
          type: event.type,
          status: event.status,
        },
        secret,
      );
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "User-Agent": "LendLoop-Outbox/1.0" },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) {
        throw new Error(`n8n webhook responded with HTTP ${response.status}`);
      }
      await ctx.runMutation(internal.outbox.markDelivered, { outboxId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.outbox.recordFailedAttempt, { outboxId, error: message });
    }
  },
});

export const markDelivered = internalMutation({
  args: { outboxId: v.id("outbox") },
  handler: async (ctx, { outboxId }) => {
    const event = await ctx.db.get("outbox", outboxId);
    if (event === null || event.state === "delivered") return;
    await ctx.db.patch("outbox", outboxId, {
      state: "delivered",
      attempts: event.attempts + 1,
      deliveredAt: Date.now(),
      lastError: undefined,
    });
  },
});

export const recordFailedAttempt = internalMutation({
  args: { outboxId: v.id("outbox"), error: v.string() },
  handler: async (ctx, { outboxId, error }) => {
    const event = await ctx.db.get("outbox", outboxId);
    if (event === null || event.state !== "pending") return;
    const attempts = event.attempts + 1;
    const lastError = error.slice(0, 500);
    if (attempts >= MAX_ATTEMPTS) {
      console.error(`Outbox ${outboxId} failed after ${attempts} attempts: ${lastError}`);
      await ctx.db.patch("outbox", outboxId, { state: "failed", attempts, lastError });
      return;
    }
    const delay = retryDelayMs(attempts);
    await ctx.db.patch("outbox", outboxId, { attempts, lastError, nextAttemptAt: Date.now() + delay });
    await ctx.scheduler.runAfter(delay, internal.outbox.deliver, { outboxId });
  },
});

/**
 * Safety net, run by a cron (crons.ts). If a delivery action crashed or timed out before it could
 * record success or failure, its row would stay "pending" with nothing scheduled. Re-queue those.
 * A duplicate delivery is harmless: n8n dedupes on the event id.
 */
export const requeueStuck = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const stuck = await ctx.db
      .query("outbox")
      .withIndex("by_state_next_attempt", (q) => q.eq("state", "pending").lt("nextAttemptAt", now - STUCK_AFTER_MS))
      .take(50);
    for (const event of stuck) {
      await ctx.db.patch("outbox", event._id, { nextAttemptAt: now });
      await ctx.scheduler.runAfter(0, internal.outbox.deliver, { outboxId: event._id });
    }
    return stuck.length;
  },
});
