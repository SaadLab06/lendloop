// Access checks used by every public query and mutation.
// The UI hides buttons a user cannot use, but these helpers are what actually enforce the rules.
import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/** The signed-in user's row, or null when signed out or not stored yet. */
export async function getCurrentUser(ctx: QueryCtx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
}

export async function requireUser(ctx: QueryCtx): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (user === null) {
    throw new ConvexError("Please sign in to continue.");
  }
  return user;
}

export async function requireAdmin(ctx: QueryCtx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") {
    throw new ConvexError("Only admins can do this.");
  }
  return user;
}

export function isAdmin(user: Doc<"users">): boolean {
  return user.role === "admin";
}

/** Owners manage their own listings. Admins may only remove listings, which tools.remove checks separately. */
export function assertToolOwner(user: Doc<"users">, tool: Doc<"tools">): void {
  if (tool.ownerId !== user._id) {
    throw new ConvexError("You can only change your own listings.");
  }
}

export function assertLender(user: Doc<"users">, loan: Doc<"loans">): void {
  if (loan.lenderId !== user._id) {
    throw new ConvexError("Only the lender can do this.");
  }
}

export function assertBorrower(user: Doc<"users">, loan: Doc<"loans">): void {
  if (loan.borrowerId !== user._id) {
    throw new ConvexError("Only the borrower can do this.");
  }
}
