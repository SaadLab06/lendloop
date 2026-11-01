import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { assertToolOwner, isAdmin, requireUser } from "./lib/auth";
import { categoryValidator, conditionValidator, LIMITS } from "./lib/constants";
import { todayIso } from "./lib/dates";
import { approvedLoans, changeLoanStatus, firstName, isOnLoan } from "./lib/loans";
import { cleanText } from "./lib/validation";

const PUBLIC_LIST_LIMIT = 100;

/**
 * The only query that works without signing in. It returns the name and category of tools
 * that are available today and nothing else: no ids, owners, descriptions or conditions.
 * The `returns` validator makes Convex reject the response if any other field slips in.
 */
export const listPublic = query({
  args: {},
  returns: v.array(v.object({ name: v.string(), category: categoryValidator })),
  handler: async (ctx) => {
    const today = todayIso();
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_status_category", (q) => q.eq("status", "listed"))
      .take(PUBLIC_LIST_LIMIT);
    const available = [];
    for (const tool of tools) {
      if (!(await isOnLoan(ctx, tool._id, today))) {
        available.push({ name: tool.name, category: tool.category });
      }
    }
    return available;
  },
});

async function withAvailability(ctx: QueryCtx, tools: Doc<"tools">[], viewer: Doc<"users">) {
  const today = todayIso();
  return await Promise.all(
    tools.map(async (tool) => {
      const [owner, loans] = await Promise.all([ctx.db.get("users", tool.ownerId), approvedLoans(ctx, tool._id)]);
      return {
        _id: tool._id,
        name: tool.name,
        category: tool.category,
        condition: tool.condition,
        description: tool.description,
        available: !loans.some((loan) => loan.startDate <= today),
        // Upcoming approved dates, so borrowers can pick free days before requesting.
        bookings: loans
          .filter((loan) => loan.endDate >= today)
          .map((loan) => ({ startDate: loan.startDate, endDate: loan.endDate }))
          .sort((a, b) => a.startDate.localeCompare(b.startDate)),
        isMine: tool.ownerId === viewer._id,
        // Other members see a first name and the trusted badge, never an email.
        ownerName: firstName(owner),
        ownerTrusted: owner?.trustedLender ?? false,
      };
    }),
  );
}

/** All listed tools with availability, optionally filtered by category. Signed-in users only. */
export const list = query({
  args: { category: v.optional(categoryValidator) },
  handler: async (ctx, { category }) => {
    const viewer = await requireUser(ctx);
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_status_category", (q) =>
        category === undefined ? q.eq("status", "listed") : q.eq("status", "listed").eq("category", category),
      )
      .take(200);
    return await withAvailability(ctx, tools, viewer);
  },
});

/** The signed-in user's own listings. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireUser(ctx);
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_owner_status", (q) => q.eq("ownerId", viewer._id).eq("status", "listed"))
      .collect();
    return await withAvailability(ctx, tools, viewer);
  },
});

const toolFields = {
  name: v.string(),
  category: categoryValidator,
  condition: conditionValidator,
  description: v.string(),
};

function cleanToolFields(fields: { name: string; description: string }) {
  return {
    name: cleanText(fields.name, "Name", { max: LIMITS.toolName }),
    description: cleanText(fields.description, "Description", { max: LIMITS.description }),
  };
}

export const create = mutation({
  args: toolFields,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return await ctx.db.insert("tools", {
      ownerId: user._id,
      category: args.category,
      condition: args.condition,
      ...cleanToolFields(args),
      status: "listed",
    });
  },
});

export const update = mutation({
  args: { toolId: v.id("tools"), ...toolFields },
  handler: async (ctx, { toolId, ...args }) => {
    const user = await requireUser(ctx);
    const tool = await ctx.db.get("tools", toolId);
    if (tool === null || tool.status !== "listed") {
      throw new ConvexError("This listing no longer exists.");
    }
    assertToolOwner(user, tool);
    await ctx.db.patch("tools", toolId, {
      category: args.category,
      condition: args.condition,
      ...cleanToolFields(args),
    });
  },
});

/**
 * Owners delete their own listings; admins can remove any listing.
 * Pending requests for the tool are declined, which notifies their borrowers.
 * Approved loans stay as they are so the lender can still mark them returned.
 */
export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    const user = await requireUser(ctx);
    const tool = await ctx.db.get("tools", toolId);
    if (tool === null || tool.status !== "listed") {
      throw new ConvexError("This listing no longer exists.");
    }
    if (!isAdmin(user)) {
      assertToolOwner(user, tool);
    }
    await ctx.db.patch("tools", toolId, { status: "removed", removedBy: user._id });
    const pending = await ctx.db
      .query("loans")
      .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "pending"))
      .collect();
    for (const loan of pending) {
      await changeLoanStatus(ctx, loan, "declined", { decidedAt: Date.now() });
    }
  },
});
