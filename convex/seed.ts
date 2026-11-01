// Demo data for a fresh deployment: npx convex run seed:demo
// Internal, so it cannot be called from the browser. The demo neighbors cannot sign in;
// they only exist to own tools and to have an overdue loan for the reminder workflow.
import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import type { Category } from "./lib/constants";
import { addDays, todayIso } from "./lib/dates";

export const demo = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", "demo_sam"))
      .unique();
    if (existing !== null) return "Demo data already exists.";

    const neighbor = (clerkId: string, name: string, trustedLender = false) =>
      ctx.db.insert("users", {
        clerkId,
        name,
        firstName: name.split(" ")[0],
        email: `${clerkId.replace("demo_", "")}@example.com`,
        role: "user",
        trustedLender,
      });
    const tool = (ownerId: Id<"users">, name: string, category: Category, description: string) =>
      ctx.db.insert("tools", { ownerId, name, category, condition: "good", description, status: "listed" });

    const sam = await neighbor("demo_sam", "Sam Rivera", true);
    const priya = await neighbor("demo_priya", "Priya Shah");
    const tom = await neighbor("demo_tom", "Tom Becker");

    await tool(sam, "Cordless drill", "power_tools", "18V with two batteries and a bit set.");
    const trimmer = await tool(sam, "Hedge trimmer", "garden", "Electric, 60 cm blade. Extension cord included.");
    await tool(priya, "Two-person tent", "camping", "Light and quick to pitch. Pegs and footprint included.");
    await tool(priya, "Stand mixer", "kitchen", "5 litre bowl, whisk and dough hook.");
    await tool(tom, "Pressure washer", "cleaning", "130 bar. Good for patios and bikes.");
    await tool(tom, "Socket wrench set", "hand_tools", "Metric, 40 pieces, in a case.");

    // Tom borrowed Sam's hedge trimmer and is two days late, so the reminder workflow has work to do.
    const today = todayIso();
    await ctx.db.insert("loans", {
      toolId: trimmer,
      lenderId: sam,
      borrowerId: tom,
      startDate: addDays(today, -6),
      endDate: addDays(today, -2),
      status: "approved",
      decidedAt: Date.now(),
    });
    return "Demo data created: 3 neighbors, 6 tools, 1 overdue loan.";
  },
});
