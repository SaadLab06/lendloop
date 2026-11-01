// The signed HTTP endpoints n8n calls: signature checks, scoped data, and idempotent write-backs.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { todayIso } from "./lib/dates";
import { signJws } from "./lib/jws";
import { days, listTool, setupTest, signIn, TEST_SECRETS, type TestConvex } from "./test.setup";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

let jtiCounter = 0;

/** Builds a token the way the n8n JWT node does, with the n8n -> Convex secret. */
async function n8nToken(claims: Record<string, unknown>, options: { secret?: string; lifetime?: number } = {}) {
  const iat = Math.floor(Date.now() / 1000);
  return await signJws(
    {
      iss: "lendloop-n8n",
      aud: "lendloop-convex",
      jti: `test-${++jtiCounter}`,
      iat,
      exp: iat + (options.lifetime ?? 300),
      ...claims,
    },
    options.secret ?? TEST_SECRETS.N8N_API_SECRET,
  );
}

async function call(t: TestConvex, method: "GET" | "POST", path: string, claims: Record<string, unknown>, options = {}) {
  const token = await n8nToken(claims, options);
  const response = await t.fetch(path, { method, headers: { Authorization: `Bearer ${token}` } });
  return { status: response.status, body: await response.json() };
}

async function pendingRequest() {
  const t = setupTest();
  const lender = await signIn(t, "Alice");
  const borrower = await signIn(t, "Bob");
  const toolId = await listTool(lender.as);
  const loanId = await borrower.as.mutation(api.loans.request, { toolId, startDate: days(1), endDate: days(2) });
  const [event] = await t.run((ctx) => ctx.db.query("outbox").collect());
  return { t, lender, borrower, toolId, loanId, eventId: event._id };
}

describe("signature checks", () => {
  test("rejects a missing token, a wrong secret and the other direction's secret", async () => {
    const { t, loanId, eventId } = await pendingRequest();
    const claims = { scope: "loan-context", loanId, eventId };

    const noToken = await t.fetch("/n8n/loan-context", { method: "GET" });
    expect(noToken.status).toBe(401);
    expect((await call(t, "GET", "/n8n/loan-context", claims, { secret: "wrong" })).status).toBe(401);
    expect((await call(t, "GET", "/n8n/loan-context", claims, { secret: TEST_SECRETS.N8N_WEBHOOK_SECRET })).status).toBe(401);
    expect((await call(t, "GET", "/n8n/loan-context", claims)).status).toBe(200);
  });

  test("rejects a token whose signature no longer matches its claims", async () => {
    const { t, loanId, eventId } = await pendingRequest();
    const token = await n8nToken({ scope: "loan-context", loanId, eventId });
    const [header, , signature] = token.split(".");
    const forgedClaims = btoa(JSON.stringify({ scope: "overdue-loans" })).replace(/=+$/, "");
    const response = await t.fetch("/n8n/overdue-loans", {
      method: "GET",
      headers: { Authorization: `Bearer ${header}.${forgedClaims}.${signature}` },
    });
    expect(response.status).toBe(401);
  });

  test("rejects expired tokens, overlong lifetimes and tokens meant for another endpoint", async () => {
    const { t, loanId, eventId } = await pendingRequest();
    const claims = { scope: "loan-context", loanId, eventId };
    const token = await n8nToken(claims);
    vi.advanceTimersByTime(301_000);
    const expired = await t.fetch("/n8n/loan-context", { method: "GET", headers: { Authorization: `Bearer ${token}` } });
    expect(expired.status).toBe(401);

    expect((await call(t, "GET", "/n8n/loan-context", claims, { lifetime: 3600 })).status).toBe(401);
    expect((await call(t, "POST", "/n8n/notifications", { ...claims, status: "sent" })).status).toBe(403);
  });
});

describe("request notification", () => {
  test("loan context is scoped to one event and holds only what the message needs", async () => {
    const { t, loanId, eventId } = await pendingRequest();
    const { status, body } = await call(t, "GET", "/n8n/loan-context", { scope: "loan-context", loanId, eventId });

    expect(status).toBe(200);
    expect(Object.keys(body).sort()).toEqual([
      "alreadyNotified",
      "audience",
      "endDate",
      "recipient",
      "startDate",
      "status",
      "toolName",
    ]);
    // A new request goes to the lender.
    expect(body).toMatchObject({ audience: "lender", alreadyNotified: false, status: "pending" });
    expect(body.recipient).toEqual({ email: "alice@example.com", firstName: "Alice" });
  });

  test("an event id that does not belong to the loan gets a 404", async () => {
    const { t, lender, borrower, eventId } = await pendingRequest();
    const otherTool = await listTool(lender.as, "Ladder");
    const otherLoan = await borrower.as.mutation(api.loans.request, {
      toolId: otherTool,
      startDate: days(1),
      endDate: days(2),
    });
    const { status } = await call(t, "GET", "/n8n/loan-context", { scope: "loan-context", loanId: otherLoan, eventId });
    expect(status).toBe(404);
  });

  test("ids that are not Convex ids are a 400, caught by the argument validators", async () => {
    const { t, eventId } = await pendingRequest();
    const { status } = await call(t, "GET", "/n8n/loan-context", { scope: "loan-context", loanId: "not-a-loan", eventId });
    expect(status).toBe(400);
  });

  test("the activity write-back is idempotent on the event id", async () => {
    const { t, borrower, loanId, eventId } = await pendingRequest();
    const claims = { scope: "notification", loanId, eventId, status: "sent" };

    expect((await call(t, "POST", "/n8n/notifications", claims)).body).toEqual({ created: true });
    expect((await call(t, "POST", "/n8n/notifications", claims)).body).toEqual({ created: false });

    const activity = await t.run((ctx) => ctx.db.query("activity").collect());
    expect(activity).toHaveLength(1);
    const context = await call(t, "GET", "/n8n/loan-context", { scope: "loan-context", loanId, eventId });
    expect(context.body.alreadyNotified).toBe(true);

    // The bonus feature: the borrower sees the automation activity on the loan.
    const [loan] = await borrower.as.query(api.loans.myRequests, { today: days(0) });
    expect(loan.activity[0].summary).toBe("Lender notified of the new request");
  });
});

describe("overdue reminders", () => {
  async function overdueLoans() {
    const t = setupTest();
    const lender = await signIn(t, "Alice");
    const bob = await signIn(t, "Bob");
    const carol = await signIn(t, "Carol");
    const drill = await listTool(lender.as, "Drill");
    const saw = await listTool(lender.as, "Saw");
    const tent = await listTool(lender.as, "Tent");
    // Past loans cannot be created through loans.request, so insert them directly.
    const insert = (toolId: Id<"tools">, borrowerId: Id<"users">, endDate: string) =>
      t.run((ctx) =>
        ctx.db.insert("loans", {
          toolId,
          lenderId: lender.id,
          borrowerId,
          startDate: days(-10),
          endDate,
          status: "approved",
        }),
      );
    const loans = [
      await insert(drill, bob.id, days(-2)),
      await insert(saw, bob.id, days(-1)),
      await insert(tent, carol.id, days(-3)),
    ];
    return { t, loans };
  }

  test("lists overdue loans grouped by borrower with only the fields a reminder needs", async () => {
    const { t } = await overdueLoans();
    const { status, body } = await call(t, "GET", "/n8n/overdue-loans", { scope: "overdue-loans" });

    expect(status).toBe(200);
    expect(body.date).toBe(todayIso());
    expect(body.borrowers).toHaveLength(2);
    const bob = body.borrowers.find((b: { firstName: string }) => b.firstName === "Bob");
    expect(Object.keys(bob).sort()).toEqual(["email", "firstName", "loans"]);
    expect(bob.loans).toHaveLength(2);
    expect(Object.keys(bob.loans[0]).sort()).toEqual(["daysOverdue", "endDate", "loanId", "toolName"]);
  });

  test("writing reminders back twice creates one record per loan per day", async () => {
    const { t, loans } = await overdueLoans();
    const claims = { scope: "reminders", date: todayIso(), loanIds: loans, status: "sent" };

    expect((await call(t, "POST", "/n8n/reminders", claims)).body).toEqual({ created: 3, skipped: 0 });
    expect((await call(t, "POST", "/n8n/reminders", claims)).body).toEqual({ created: 0, skipped: 3 });
    expect(await t.run((ctx) => ctx.db.query("activity").collect())).toHaveLength(3);

    // A second run on the same day finds nothing left to remind.
    const rerun = await call(t, "GET", "/n8n/overdue-loans", { scope: "overdue-loans" });
    expect(rerun.body.borrowers).toEqual([]);
  });

  test("rejects a malformed reminder batch", async () => {
    const { t, loans } = await overdueLoans();
    const bad = await call(t, "POST", "/n8n/reminders", { scope: "reminders", date: "yesterday", loanIds: loans, status: "sent" });
    expect(bad.status).toBe(400);
  });
});

test("the error workflow's failure report is stored once per execution", async () => {
  const t = setupTest();
  const claims = {
    scope: "automation-failure",
    executionId: "1234",
    workflow: "LendLoop: request notification",
    node: "Fetch loan context",
    message: "404 Not Found",
  };
  expect((await call(t, "POST", "/n8n/automation-failures", claims)).body).toEqual({ created: true });
  expect((await call(t, "POST", "/n8n/automation-failures", claims)).body).toEqual({ created: false });
  expect(await t.run((ctx) => ctx.db.query("automationFailures").collect())).toHaveLength(1);
});
