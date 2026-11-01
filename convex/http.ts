// Signed HTTP endpoints for n8n. Every request must carry "Authorization: Bearer <HS256 JWS>"
// signed with N8N_API_SECRET (a different secret from the one Convex uses to sign webhooks).
// The token's claims are the request: we never read a body that the signature does not cover.
import { httpRouter } from "convex/server";
import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction, type ActionCtx } from "./_generated/server";
import { todayIso } from "./lib/dates";
import { JwsError, verifyJws, type Claims } from "./lib/jws";

const TOKEN_MAX_LIFETIME_SECONDS = 300;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/**
 * Wraps a handler with the checks every n8n call needs: a valid signature from n8n, a short-lived
 * token, and a `scope` claim naming this endpoint, so a token minted for one call cannot be replayed
 * against another. A null result becomes a 404.
 */
function n8nEndpoint(scope: string, handler: (ctx: ActionCtx, claims: Claims) => Promise<unknown>) {
  return httpAction(async (ctx, request) => {
    const secret = process.env.N8N_API_SECRET;
    if (!secret) {
      console.error("N8N_API_SECRET is not set");
      return json({ error: "Not configured" }, 500);
    }
    const token = request.headers.get("Authorization")?.match(/^Bearer (\S+)$/)?.[1];
    if (!token) return json({ error: "Missing bearer token" }, 401);

    let claims: Claims;
    try {
      claims = await verifyJws(token, secret, {
        issuer: "lendloop-n8n",
        audience: "lendloop-convex",
        maxLifetimeSeconds: TOKEN_MAX_LIFETIME_SECONDS,
      });
    } catch (error) {
      // The caller gets a generic answer; the reason stays in the Convex logs.
      console.warn(`Rejected call to ${scope}: ${error instanceof JwsError ? error.message : "invalid token"}`);
      return json({ error: "Invalid token" }, 401);
    }
    if (claims.scope !== scope) return json({ error: "Token not valid for this endpoint" }, 403);

    try {
      const result = await handler(ctx, claims);
      return result === null ? json({ error: "Not found" }, 404) : json(result, 200);
    } catch (error) {
      console.error(`Call to ${scope} failed (jti ${claims.jti}):`, error);
      // Claims with the wrong shape are rejected by the internal functions' argument validators
      // or by a ConvexError: that is the caller's fault (400). Anything else is ours (500).
      const message = error instanceof Error ? error.message : String(error);
      // (Convex reports validator failures as "ArgumentValidationError"; convex-test as "Validator error".)
      const badInput = error instanceof ConvexError || /ArgumentValidationError|Validator error/i.test(message);
      return badInput ? json({ error: "Bad request" }, 400) : json({ error: "Internal error" }, 500);
    }
  });
}

const http = httpRouter();

// Claims are cast to the expected types here; the internal functions' validators check them at runtime.
http.route({
  path: "/n8n/loan-context",
  method: "GET",
  handler: n8nEndpoint("loan-context", (ctx, claims) =>
    ctx.runQuery(internal.n8n.loanContext, {
      eventId: claims.eventId as Id<"outbox">,
      loanId: claims.loanId as Id<"loans">,
    }),
  ),
});

http.route({
  path: "/n8n/notifications",
  method: "POST",
  handler: n8nEndpoint("notification", (ctx, claims) =>
    ctx.runMutation(internal.n8n.recordNotification, {
      eventId: claims.eventId as Id<"outbox">,
      loanId: claims.loanId as Id<"loans">,
      status: claims.status as "sent" | "failed",
    }),
  ),
});

http.route({
  path: "/n8n/overdue-loans",
  method: "GET",
  handler: n8nEndpoint("overdue-loans", (ctx) => ctx.runQuery(internal.n8n.overdueLoans, { date: todayIso() })),
});

http.route({
  path: "/n8n/reminders",
  method: "POST",
  handler: n8nEndpoint("reminders", (ctx, claims) =>
    ctx.runMutation(internal.n8n.recordReminders, {
      date: claims.date as string,
      loanIds: claims.loanIds as Id<"loans">[],
      status: claims.status as "sent" | "failed",
    }),
  ),
});

http.route({
  path: "/n8n/automation-failures",
  method: "POST",
  handler: n8nEndpoint("automation-failure", (ctx, claims) =>
    ctx.runMutation(internal.n8n.recordFailure, {
      executionId: claims.executionId as string,
      workflow: claims.workflow as string,
      node: claims.node as string | undefined,
      message: claims.message as string,
    }),
  ),
});

export default http;
