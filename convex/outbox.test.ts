// The transactional outbox: signed delivery to n8n, retries with backoff, and failures an admin can see.
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { verifyJws } from "./lib/jws";
import { BASE_RETRY_DELAY_MS, MAX_ATTEMPTS, STUCK_AFTER_MS } from "./outbox";
import { days, listTool, makeAdmin, setupTest, signIn, TEST_SECRETS } from "./test.setup";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function requestALoan() {
  const t = setupTest();
  const lender = await signIn(t, "Alice");
  const borrower = await signIn(t, "Bob");
  const toolId = await listTool(lender.as);
  const loanId = await borrower.as.mutation(api.loans.request, { toolId, startDate: days(1), endDate: days(2) });
  return { t, lender, loanId };
}

test("delivers a signed event that carries only ids, type, status and timestamps", async () => {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response("ok", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  const { t, loanId } = await requestALoan();

  await t.finishAllScheduledFunctions(vi.runAllTimers);

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe(TEST_SECRETS.N8N_WEBHOOK_URL);
  expect(init?.body).toBeUndefined(); // the signed token is the whole payload
  const token = (init?.headers as Record<string, string>).Authorization.replace("Bearer ", "");
  const claims = await verifyJws(token, TEST_SECRETS.N8N_WEBHOOK_SECRET, {
    issuer: "lendloop-convex",
    audience: "lendloop-n8n",
    maxLifetimeSeconds: 300,
  });
  expect(Object.keys(claims).sort()).toEqual(["aud", "exp", "iat", "iss", "jti", "loanId", "status", "type"]);
  expect(claims).toMatchObject({ loanId, type: "request.created", status: "pending" });

  const [event] = await t.run((ctx) => ctx.db.query("outbox").collect());
  expect(claims.jti).toBe(event._id);
  expect(event.state).toBe("delivered");
});

test("retries with exponential backoff, then marks the event failed for the admin view", async () => {
  const attemptTimes: number[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      attemptTimes.push(Date.now());
      return new Response("unavailable", { status: 503 });
    }),
  );
  const { t } = await requestALoan();

  await t.finishAllScheduledFunctions(vi.runAllTimers);

  expect(attemptTimes).toHaveLength(MAX_ATTEMPTS);
  const gaps = attemptTimes.slice(1).map((time, i) => time - attemptTimes[i]);
  expect(gaps).toEqual([1, 2, 4, 8].map((factor) => factor * BASE_RETRY_DELAY_MS));

  const [event] = await t.run((ctx) => ctx.db.query("outbox").collect());
  expect(event).toMatchObject({ state: "failed", attempts: MAX_ATTEMPTS });
  expect(event.lastError).toContain("503");

  const admin = await signIn(t, "Ada");
  await makeAdmin(t, admin.id);
  const health = await admin.as.query(api.admin.automationHealth, {});
  expect(health.failedEvents).toHaveLength(1);
  expect(health.failedEvents[0].lastError).toContain("503");
});

test("an admin can retry a failed event once n8n is back", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 500 })));
  const { t } = await requestALoan();
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const [failed] = await t.run((ctx) => ctx.db.query("outbox").collect());
  expect(failed.state).toBe("failed");

  const admin = await signIn(t, "Ada");
  await makeAdmin(t, admin.id);
  vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { status: 200 })));
  await admin.as.mutation(api.admin.retryEvent, { outboxId: failed._id });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  expect((await t.run((ctx) => ctx.db.get("outbox", failed._id)))?.state).toBe("delivered");
});

test("the cron re-queues an event whose delivery action died without recording anything", async () => {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response("ok", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  const { t, loanId } = await requestALoan();
  // Simulate a crashed action: drop the scheduled delivery, leaving the row pending.
  await t.run(async (ctx) => {
    for (const job of await ctx.db.system.query("_scheduled_functions").collect()) {
      await ctx.scheduler.cancel(job._id);
    }
  });

  expect(await t.mutation(internal.outbox.requeueStuck, {})).toBe(0); // not stuck yet
  vi.advanceTimersByTime(STUCK_AFTER_MS + 1000);
  expect(await t.mutation(internal.outbox.requeueStuck, {})).toBe(1);
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [event] = await t.run((ctx) => ctx.db.query("outbox").collect());
  expect(event).toMatchObject({ loanId, state: "delivered" });
});

test("a missing webhook URL counts as a failure instead of passing silently", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const { t } = await requestALoan();
  delete process.env.N8N_WEBHOOK_URL;

  await t.finishAllScheduledFunctions(vi.runAllTimers);

  expect(fetchMock).not.toHaveBeenCalled();
  const [event] = await t.run((ctx) => ctx.db.query("outbox").collect());
  expect(event.state).toBe("failed");
  expect(event.lastError).toMatch(/not set/);
});
