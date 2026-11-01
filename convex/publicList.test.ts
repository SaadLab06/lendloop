import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { days, listTool, setupTest, signIn } from "./test.setup";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test("the public list works signed out and returns only name and category", async () => {
  const t = setupTest();
  const alice = await signIn(t, "Alice");
  await listTool(alice.as, "Cordless drill");
  await alice.as.mutation(api.tools.create, {
    name: "Camping stove",
    category: "camping",
    condition: "like_new",
    description: "Two burners. Gas canister not included.",
  });

  const tools = await t.query(api.tools.listPublic, { today: days(0) });

  expect(tools).toHaveLength(2);
  for (const tool of tools) {
    // No id, owner, description or condition: exactly these two keys.
    expect(Object.keys(tool).sort()).toEqual(["category", "name"]);
  }
  expect(tools).toContainEqual({ name: "Camping stove", category: "camping" });
  const serialized = JSON.stringify(tools);
  expect(serialized).not.toContain("Alice");
  expect(serialized).not.toContain("alice@example.com");
  expect(serialized).not.toContain("batteries");
});

test("the public list leaves out tools that are on loan or removed", async () => {
  const t = setupTest();
  const alice = await signIn(t, "Alice");
  const bob = await signIn(t, "Bob");
  const drill = await listTool(alice.as, "Cordless drill");
  const ladder = await listTool(alice.as, "Ladder");
  await listTool(alice.as, "Hedge trimmer");

  const loanId = await bob.as.mutation(api.loans.request, { toolId: drill, startDate: days(0), endDate: days(2) });
  await alice.as.mutation(api.loans.approve, { loanId });
  await alice.as.mutation(api.tools.remove, { toolId: ladder });

  const names = (await t.query(api.tools.listPublic, { today: days(0) })).map((tool) => tool.name);
  expect(names).toEqual(["Hedge trimmer"]);
});

test("queries take today as a validated argument instead of reading the clock", async () => {
  const t = setupTest();
  await expect(t.query(api.tools.listPublic, { today: "tomorrow" })).rejects.toThrow(/valid day/);
});

test("everything except the public list requires sign-in", async () => {
  const t = setupTest();
  await expect(t.query(api.tools.list, { today: days(0) })).rejects.toThrow(/sign in/);
  await expect(t.query(api.loans.myRequests, { today: days(0) })).rejects.toThrow(/sign in/);
  await expect(
    t.mutation(api.tools.create, { name: "Saw", category: "hand_tools", condition: "good", description: "Sharp." }),
  ).rejects.toThrow(/sign in/);
});
