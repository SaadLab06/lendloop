// Role-based access control, enforced in Convex functions. Each test calls the functions directly,
// the way a malicious client could, rather than going through the UI.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { days, listTool, makeAdmin, setupTest, signIn } from "./test.setup";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const edit = { name: "Renamed", category: "garden", condition: "fair", description: "Changed." } as const;

describe("listings", () => {
  test("a user edits and deletes only their own listings", async () => {
    const t = setupTest();
    const alice = await signIn(t, "Alice");
    const bob = await signIn(t, "Bob");
    const drill = await listTool(alice.as);

    await expect(bob.as.mutation(api.tools.update, { toolId: drill, ...edit })).rejects.toThrow(/your own listings/);
    await expect(bob.as.mutation(api.tools.remove, { toolId: drill })).rejects.toThrow(/your own listings/);

    await alice.as.mutation(api.tools.update, { toolId: drill, ...edit });
    const tool = await t.run((ctx) => ctx.db.get("tools", drill));
    expect(tool?.name).toBe("Renamed");

    await alice.as.mutation(api.tools.remove, { toolId: drill });
    expect((await t.run((ctx) => ctx.db.get("tools", drill)))?.status).toBe("removed");
  });

  test("an admin can remove any listing but not edit it", async () => {
    const t = setupTest();
    const alice = await signIn(t, "Alice");
    const admin = await signIn(t, "Ada");
    await makeAdmin(t, admin.id);
    const drill = await listTool(alice.as);

    await expect(admin.as.mutation(api.tools.update, { toolId: drill, ...edit })).rejects.toThrow(/your own listings/);
    await admin.as.mutation(api.tools.remove, { toolId: drill });
    const tool = await t.run((ctx) => ctx.db.get("tools", drill));
    expect(tool?.status).toBe("removed");
    expect(tool?.removedBy).toBe(admin.id);
  });

  test("removing a listing declines its pending requests and queues a notification", async () => {
    const t = setupTest();
    const alice = await signIn(t, "Alice");
    const bob = await signIn(t, "Bob");
    const drill = await listTool(alice.as);
    const loanId = await bob.as.mutation(api.loans.request, { toolId: drill, startDate: days(1), endDate: days(2) });

    await alice.as.mutation(api.tools.remove, { toolId: drill });

    expect((await t.run((ctx) => ctx.db.get("loans", loanId)))?.status).toBe("declined");
    const events = await t.run((ctx) => ctx.db.query("outbox").collect());
    expect(events.map((e) => e.status)).toEqual(["pending", "declined"]);
  });
});

describe("requests and loans", () => {
  async function scenario() {
    const t = setupTest();
    const lender = await signIn(t, "Alice");
    const borrower = await signIn(t, "Bob");
    const stranger = await signIn(t, "Carol");
    const toolId = await listTool(lender.as);
    const loanId = await borrower.as.mutation(api.loans.request, { toolId, startDate: days(1), endDate: days(3) });
    return { t, lender, borrower, stranger, toolId, loanId };
  }

  test("only the lender can approve or decline", async () => {
    const { lender, borrower, stranger, loanId } = await scenario();
    await expect(borrower.as.mutation(api.loans.approve, { loanId })).rejects.toThrow(/Only the lender/);
    await expect(stranger.as.mutation(api.loans.approve, { loanId })).rejects.toThrow(/Only the lender/);
    await expect(stranger.as.mutation(api.loans.decline, { loanId })).rejects.toThrow(/Only the lender/);
    await lender.as.mutation(api.loans.decline, { loanId });
  });

  test("an admin cannot approve on a lender's behalf", async () => {
    const { t, loanId } = await scenario();
    const admin = await signIn(t, "Ada");
    await makeAdmin(t, admin.id);
    await expect(admin.as.mutation(api.loans.approve, { loanId })).rejects.toThrow(/Only the lender/);
  });

  test("only the borrower can cancel a pending request", async () => {
    const { t, lender, stranger, borrower, loanId } = await scenario();
    await expect(lender.as.mutation(api.loans.cancel, { loanId })).rejects.toThrow(/Only the borrower/);
    await expect(stranger.as.mutation(api.loans.cancel, { loanId })).rejects.toThrow(/Only the borrower/);
    await borrower.as.mutation(api.loans.cancel, { loanId });
    expect((await t.run((ctx) => ctx.db.get("loans", loanId)))?.status).toBe("cancelled");
  });

  test("the lender or an admin marks a loan returned, nobody else", async () => {
    const { t, lender, borrower, stranger, loanId } = await scenario();
    await lender.as.mutation(api.loans.approve, { loanId });
    await expect(borrower.as.mutation(api.loans.markReturned, { loanId })).rejects.toThrow(/Only the lender/);
    await expect(stranger.as.mutation(api.loans.markReturned, { loanId })).rejects.toThrow(/Only the lender/);

    const admin = await signIn(t, "Ada");
    await makeAdmin(t, admin.id);
    await admin.as.mutation(api.loans.markReturned, { loanId });
    expect((await t.run((ctx) => ctx.db.get("loans", loanId)))?.status).toBe("returned");
  });

  test("each user sees only their own requests and incoming requests", async () => {
    const { lender, borrower, stranger } = await scenario();
    expect(await borrower.as.query(api.loans.myRequests, { today: days(0) })).toHaveLength(1);
    expect(await borrower.as.query(api.loans.incoming, { today: days(0) })).toHaveLength(0);
    expect(await lender.as.query(api.loans.incoming, { today: days(0) })).toHaveLength(1);
    expect(await stranger.as.query(api.loans.myRequests, { today: days(0) })).toHaveLength(0);
    expect(await stranger.as.query(api.loans.incoming, { today: days(0) })).toHaveLength(0);
  });
});

describe("admin powers", () => {
  test("admin queries reject regular users", async () => {
    const t = setupTest();
    const bob = await signIn(t, "Bob");
    await expect(bob.as.query(api.admin.listLoans, { today: days(0) })).rejects.toThrow(/Only admins/);
    await expect(bob.as.query(api.admin.listUsers, {})).rejects.toThrow(/Only admins/);
    await expect(bob.as.query(api.admin.automationHealth, {})).rejects.toThrow(/Only admins/);
  });

  test("an admin views all loans and marks a lender as trusted", async () => {
    const t = setupTest();
    const alice = await signIn(t, "Alice");
    const bob = await signIn(t, "Bob");
    const admin = await signIn(t, "Ada");
    await makeAdmin(t, admin.id);
    const toolId = await listTool(alice.as);
    await bob.as.mutation(api.loans.request, { toolId, startDate: days(1), endDate: days(2) });

    expect(await admin.as.query(api.admin.listLoans, { today: days(0) })).toHaveLength(1);

    await expect(bob.as.mutation(api.admin.setTrustedLender, { userId: alice.id, trusted: true })).rejects.toThrow(
      /Only admins/,
    );
    await admin.as.mutation(api.admin.setTrustedLender, { userId: alice.id, trusted: true });
    const tools = await bob.as.query(api.tools.list, { today: days(0) });
    expect(tools[0].ownerTrusted).toBe(true);
  });

  test("a user cannot promote themselves, and signing in again keeps the stored role", async () => {
    const t = setupTest();
    const bob = await signIn(t, "Bob");
    await expect(bob.as.mutation(api.admin.setRole, { userId: bob.id, role: "admin" })).rejects.toThrow(/Only admins/);

    await t.mutation(internal.users.setRoleFromCli, { email: "bob@example.com", role: "admin" });
    expect((await bob.as.query(api.users.me, {}))?.role).toBe("admin");

    // store() refreshes profile fields only; it never resets or sets the role.
    await bob.as.mutation(api.users.store, {});
    expect((await bob.as.query(api.users.me, {}))?.role).toBe("admin");
  });

  test("an admin changes other users' roles but not their own", async () => {
    const t = setupTest();
    const bob = await signIn(t, "Bob");
    const admin = await signIn(t, "Ada");
    await makeAdmin(t, admin.id);

    await admin.as.mutation(api.admin.setRole, { userId: bob.id, role: "admin" });
    expect((await bob.as.query(api.users.me, {}))?.role).toBe("admin");
    await expect(admin.as.mutation(api.admin.setRole, { userId: admin.id, role: "user" })).rejects.toThrow(
      /your own role/,
    );
  });
});
