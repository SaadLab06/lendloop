/// <reference types="vite/client" />
// Shared helpers for the convex-test suites. Not deployed: Convex skips files with more than one dot.
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { addDays, todayIso } from "./lib/dates";

export const modules = import.meta.glob("./**/*.ts");

export const TEST_SECRETS = {
  N8N_WEBHOOK_URL: "https://n8n.test/webhook/lendloop-loan-event",
  N8N_WEBHOOK_SECRET: "test-webhook-secret-convex-to-n8n",
  N8N_API_SECRET: "test-api-secret-n8n-to-convex",
};

export function setupTest() {
  for (const [key, value] of Object.entries(TEST_SECRETS)) process.env[key] = value;
  return convexTest(schema, modules);
}

export type TestConvex = ReturnType<typeof setupTest>;

/** Signs a user in with a fake Clerk identity and stores their row, the way the app does after sign-in. */
export async function signIn(t: TestConvex, name: string) {
  const as = t.withIdentity({
    subject: `user_${name.toLowerCase()}`,
    issuer: "https://clerk.test",
    name: `${name} Example`,
    givenName: name,
    email: `${name.toLowerCase()}@example.com`,
  });
  const id = await as.mutation(api.users.store, {});
  return { as, id };
}

export async function makeAdmin(t: TestConvex, userId: Id<"users">) {
  await t.run(async (ctx) => ctx.db.patch("users", userId, { role: "admin" }));
}

export async function listTool(as: Awaited<ReturnType<typeof signIn>>["as"], name = "Cordless drill") {
  return await as.mutation(api.tools.create, {
    name,
    category: "power_tools",
    condition: "good",
    description: "18V, two batteries, charger included.",
  });
}

export const days = (n: number) => addDays(todayIso(), n);
