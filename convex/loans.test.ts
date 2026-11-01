// Borrowing rules: own tools, date validation, overlaps and duplicate requests.
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { days, listTool, setupTest, signIn } from "./test.setup";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function setup() {
  const t = setupTest();
  const lender = await signIn(t, "Alice");
  const borrower = await signIn(t, "Bob");
  const toolId = await listTool(lender.as);
  return { t, lender, borrower, toolId };
}

test("a user cannot request their own tool", async () => {
  const { lender, toolId } = await setup();
  await expect(
    lender.as.mutation(api.loans.request, { toolId, startDate: days(1), endDate: days(2) }),
  ).rejects.toThrow(/your own tool/);
});

test.each([
  ["a malformed date", "2026/01/01", "2026-01-02", /valid days/],
  ["an impossible date", "2027-02-30", "2027-03-01", /valid days/],
  ["a start in the past", days(-1), days(1), /in the past/],
  ["an end before the start", days(3), days(2), /on or after/],
  ["a loan longer than 30 days", days(1), days(31), /at most 30 days/],
  ["a start too far ahead", days(181), days(182), /at most 180 days ahead/],
])("rejects %s", async (_label, startDate, endDate, error) => {
  const { borrower, toolId } = await setup();
  await expect(borrower.as.mutation(api.loans.request, { toolId, startDate, endDate })).rejects.toThrow(error);
});

test("rejects a request whose dates overlap an approved loan", async () => {
  const { t, lender, borrower, toolId } = await setup();
  const carol = await signIn(t, "Carol");
  const loanId = await borrower.as.mutation(api.loans.request, { toolId, startDate: days(2), endDate: days(5) });
  await lender.as.mutation(api.loans.approve, { loanId });

  // Ranges are inclusive, so sharing even one day (day 5) counts as an overlap.
  await expect(
    carol.as.mutation(api.loans.request, { toolId, startDate: days(5), endDate: days(7) }),
  ).rejects.toThrow(/overlap an approved loan/);
  // The day after the loan ends is free.
  await carol.as.mutation(api.loans.request, { toolId, startDate: days(6), endDate: days(7) });
});

test("approving re-checks overlaps, so only one of two overlapping requests can win", async () => {
  const { t, lender, borrower, toolId } = await setup();
  const carol = await signIn(t, "Carol");
  const first = await borrower.as.mutation(api.loans.request, { toolId, startDate: days(1), endDate: days(4) });
  const second = await carol.as.mutation(api.loans.request, { toolId, startDate: days(3), endDate: days(6) });

  await lender.as.mutation(api.loans.approve, { loanId: first });
  await expect(lender.as.mutation(api.loans.approve, { loanId: second })).rejects.toThrow(/overlap/);
});

test("a borrower cannot stack pending requests for the same tool", async () => {
  const { borrower, toolId } = await setup();
  await borrower.as.mutation(api.loans.request, { toolId, startDate: days(1), endDate: days(2) });
  await expect(
    borrower.as.mutation(api.loans.request, { toolId, startDate: days(10), endDate: days(12) }),
  ).rejects.toThrow(/already have a pending request/);
});

test("status changes follow the allowed order", async () => {
  const { lender, borrower, toolId } = await setup();
  const loanId = await borrower.as.mutation(api.loans.request, { toolId, startDate: days(1), endDate: days(2) });
  await expect(lender.as.mutation(api.loans.markReturned, { loanId })).rejects.toThrow(/Only approved loans/);
  await lender.as.mutation(api.loans.approve, { loanId });
  await expect(lender.as.mutation(api.loans.decline, { loanId })).rejects.toThrow(/Only pending/);
  await expect(borrower.as.mutation(api.loans.cancel, { loanId })).rejects.toThrow(/Only pending/);
});

test("text fields are trimmed and length-limited", async () => {
  const { borrower, toolId } = await setup();
  await expect(
    borrower.as.mutation(api.tools.create, { name: "   ", category: "garden", condition: "good", description: "x" }),
  ).rejects.toThrow(/Name is required/);
  await expect(
    borrower.as.mutation(api.loans.request, {
      toolId,
      startDate: days(1),
      endDate: days(2),
      message: "x".repeat(281),
    }),
  ).rejects.toThrow(/280 characters/);
});

test("every request and status change writes one outbox event", async () => {
  const { t, lender, borrower, toolId } = await setup();
  const loanId = await borrower.as.mutation(api.loans.request, { toolId, startDate: days(0), endDate: days(1) });
  await lender.as.mutation(api.loans.approve, { loanId });
  await lender.as.mutation(api.loans.markReturned, { loanId });

  const events = await t.run((ctx) => ctx.db.query("outbox").collect());
  expect(events.map((e) => [e.type, e.status])).toEqual([
    ["request.created", "pending"],
    ["request.status_changed", "approved"],
    ["request.status_changed", "returned"],
  ]);
  expect(events.every((e) => e.loanId === loanId && e.state === "pending")).toBe(true);
});
