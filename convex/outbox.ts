// Transactional outbox for Convex -> n8n events.
//
// A mutation that changes a loan calls enqueueLoanEvent in the same transaction, so the loan change
// and the event either both commit or both roll back. deliver() then POSTs a signed event to the
// n8n webhook. Failed attempts are retried with exponential backoff, and after MAX_ATTEMPTS the row
// is marked "failed" so it shows up in the admin view instead of disappearing.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import type { EventType, LoanStatus } from "./lib/constants";
import { signJws } from "./lib/jws";

export const MAX_ATTEMPTS = 5;
export const BASE_RETRY_DELAY_MS = 10_000; // 10s, 20s, 40s, 80s between the five attempts
const REQUEST_TIMEOUT_MS = 10_000;
const TOKEN_LIFETIME_SECONDS = 300;

export function retryDelayMs(attempts: number): number {
  return BASE_RETRY_DELAY_MS * 2 ** (attempts - 1);
}

export async function enqueueLoanEvent(
  ctx: MutationCtx,
  loanId: Id<"loans">,
  type: EventType,
  status: LoanStatus,
): Promise<Id<"outbox">> {
  const outboxId = await ctx.db.insert("outbox", { loanId, type, status, state: "pending", attempts: 0 });
  await ctx.scheduler.runAfter(0, internal.outbox.deliver, { outboxId });
  return outboxId;
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
    if (event === null) return;
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
    await ctx.db.patch("outbox", outboxId, { attempts, lastError });
    await ctx.scheduler.runAfter(retryDelayMs(attempts), internal.outbox.deliver, { outboxId });
  },
});
