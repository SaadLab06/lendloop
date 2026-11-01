import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  categoryValidator,
  conditionValidator,
  eventTypeValidator,
  loanStatusValidator,
  roleValidator,
} from "./lib/constants";

export default defineSchema({
  // One row per Clerk user. The role is never taken from the client or the token:
  // it defaults to "user" and only changes through admin.setRole or users.setRoleFromCli.
  users: defineTable({
    clerkId: v.string(), // the Clerk subject, e.g. "user_2abc..."
    email: v.optional(v.string()), // used only for notifications, never shown to other users
    firstName: v.optional(v.string()),
    name: v.string(), // display name shown to other signed-in users
    role: roleValidator,
    trustedLender: v.boolean(),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_email", ["email"]),

  // Removing a listing keeps the row (status "removed") so past loans still have a tool name.
  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: categoryValidator,
    condition: conditionValidator,
    description: v.string(),
    status: v.union(v.literal("listed"), v.literal("removed")),
    removedBy: v.optional(v.id("users")),
  })
    .index("by_status_category", ["status", "category"])
    .index("by_owner_status", ["ownerId", "status"]),

  // A borrow request and, once approved, the loan itself. Dates are inclusive "YYYY-MM-DD".
  loans: defineTable({
    toolId: v.id("tools"),
    lenderId: v.id("users"),
    borrowerId: v.id("users"),
    startDate: v.string(),
    endDate: v.string(),
    message: v.optional(v.string()),
    status: loanStatusValidator,
    decidedAt: v.optional(v.number()),
    returnedAt: v.optional(v.number()),
  })
    .index("by_tool_status", ["toolId", "status"])
    .index("by_borrower", ["borrowerId"])
    .index("by_lender", ["lenderId"])
    .index("by_status_end_date", ["status", "endDate"]),

  // Transactional outbox: written in the same mutation as the loan change,
  // then delivered to the n8n webhook by outbox.deliver with retries.
  // The row id doubles as the event id sent to n8n.
  outbox: defineTable({
    loanId: v.id("loans"),
    type: eventTypeValidator,
    status: loanStatusValidator,
    state: v.union(v.literal("pending"), v.literal("delivered"), v.literal("failed")),
    attempts: v.number(),
    nextAttemptAt: v.number(), // when the next delivery is due; lets the cron spot stuck rows
    lastError: v.optional(v.string()),
    deliveredAt: v.optional(v.number()),
  })
    .index("by_state", ["state"])
    .index("by_state_next_attempt", ["state", "nextAttemptAt"]),

  // What n8n did for a loan: notifications (keyed by event id) and
  // overdue reminders (keyed by "loanId:YYYY-MM-DD"). The unique key makes write-backs idempotent.
  activity: defineTable({
    loanId: v.id("loans"),
    kind: v.union(v.literal("notification"), v.literal("reminder")),
    idempotencyKey: v.string(),
    status: v.union(v.literal("sent"), v.literal("failed")),
    summary: v.string(),
  })
    .index("by_idempotency_key", ["idempotencyKey"])
    .index("by_loan", ["loanId"]),

  // Failed n8n executions reported by the n8n error workflow, shown in the admin view.
  automationFailures: defineTable({
    executionId: v.string(),
    workflow: v.string(),
    node: v.optional(v.string()),
    message: v.string(),
  }).index("by_execution_id", ["executionId"]),
});
