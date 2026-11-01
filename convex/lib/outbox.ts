import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { EventType, LoanStatus } from "./constants";

/**
 * Queues an n8n event in the caller's transaction (the transactional outbox).
 * If the mutation rolls back, the event disappears with it; if it commits, delivery is scheduled.
 */
export async function enqueueLoanEvent(
  ctx: MutationCtx,
  loanId: Id<"loans">,
  type: EventType,
  status: LoanStatus,
): Promise<Id<"outbox">> {
  const outboxId = await ctx.db.insert("outbox", {
    loanId,
    type,
    status,
    state: "pending",
    attempts: 0,
    nextAttemptAt: Date.now(),
  });
  await ctx.scheduler.runAfter(0, internal.outbox.deliver, { outboxId });
  return outboxId;
}
