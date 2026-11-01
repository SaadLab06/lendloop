import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { getCurrentUser } from "./lib/auth";
import { roleValidator } from "./lib/constants";

/**
 * Creates or refreshes the signed-in user's row from their Clerk token.
 * The client calls it once after sign-in. Only profile fields come from the token:
 * role and trustedLender are set to safe defaults on insert and never touched here.
 */
export const store = mutation({
  args: {},
  returns: v.id("users"),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new ConvexError("Please sign in to continue.");
    }
    // Clerk sends empty strings for unset names, hence || rather than ??.
    const profile = {
      email: identity.email || undefined,
      firstName: identity.givenName || undefined,
      name: identity.name || identity.givenName || "Neighbor",
    };
    const existing = await getCurrentUser(ctx);
    if (existing !== null) {
      if (
        existing.email !== profile.email ||
        existing.firstName !== profile.firstName ||
        existing.name !== profile.name
      ) {
        await ctx.db.patch("users", existing._id, profile);
      }
      return existing._id;
    }
    return await ctx.db.insert("users", {
      clerkId: identity.subject,
      ...profile,
      role: "user",
      trustedLender: false,
    });
  },
});

/** The signed-in user's own profile, or null. Used by the UI to show the admin tab and badges. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (user === null) return null;
    return { _id: user._id, name: user.name, role: user.role, trustedLender: user.trustedLender };
  },
});

/**
 * Bootstrap path for the first admin. Internal, so it can only run from the CLI or dashboard:
 *   npx convex run users:setRoleFromCli '{"email":"you@example.com","role":"admin"}'
 */
export const setRoleFromCli = internalMutation({
  args: { email: v.string(), role: roleValidator },
  handler: async (ctx, { email, role }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (user === null) {
      throw new ConvexError(`No user with email ${email}. They must sign in once first.`);
    }
    await ctx.db.patch("users", user._id, { role });
    return `${user.name} is now ${role}`;
  },
});
