// @vitest-environment node
// Runs in Node so it can use jsonwebtoken, the library n8n's Webhook and JWT nodes use.
// That proves both directions interoperate with n8n, not just with our own code.
import jwt from "jsonwebtoken";
import { describe, expect, test } from "vitest";
import { base64UrlEncode, constantTimeEqual, signJws, verifyJws, type Claims } from "./lib/jws";

const SECRET = "a-long-random-shared-secret";
const NOW = Date.UTC(2026, 10, 1, 12, 0, 0);
const nowSeconds = NOW / 1000;
const options = { issuer: "lendloop-n8n", audience: "lendloop-convex", maxLifetimeSeconds: 300, now: NOW };

function claims(overrides: Partial<Claims> = {}): Claims {
  return { iss: "lendloop-n8n", aud: "lendloop-convex", jti: "abc", iat: nowSeconds, exp: nowSeconds + 300, ...overrides };
}

describe("interop with jsonwebtoken (n8n)", () => {
  test("a token Convex signs verifies with jsonwebtoken, as in the n8n Webhook node", async () => {
    const token = await signJws(claims({ loanId: "k123" }), SECRET);
    const verified = jwt.verify(token, SECRET, { algorithms: ["HS256"], clockTimestamp: nowSeconds }) as jwt.JwtPayload;
    expect(verified.loanId).toBe("k123");
  });

  test("a token jsonwebtoken signs, as in the n8n JWT node, verifies in Convex", async () => {
    const token = jwt.sign({ iss: "lendloop-n8n", aud: "lendloop-convex", jti: "x", iat: nowSeconds, exp: nowSeconds + 300 }, SECRET, {
      algorithm: "HS256",
    });
    await expect(verifyJws(token, SECRET, options)).resolves.toMatchObject({ jti: "x" });
  });
});

describe("verifyJws rejects", () => {
  test("a wrong secret", async () => {
    const token = await signJws(claims(), "another-secret");
    await expect(verifyJws(token, SECRET, options)).rejects.toThrow("Invalid signature");
  });

  test("a tampered payload", async () => {
    const [header, , signature] = (await signJws(claims(), SECRET)).split(".");
    const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(claims({ jti: "forged" }))));
    await expect(verifyJws(`${header}.${payload}.${signature}`, SECRET, options)).rejects.toThrow("Invalid signature");
  });

  test('the "none" algorithm', async () => {
    const encode = (value: object) => base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
    const token = `${encode({ alg: "none", typ: "JWT" })}.${encode(claims())}.`;
    await expect(verifyJws(token, SECRET, options)).rejects.toThrow("Unsupported algorithm");
  });

  test.each([
    ["an expired token", claims({ iat: nowSeconds - 400, exp: nowSeconds - 100 }), "Token expired"],
    ["a lifetime above the limit", claims({ exp: nowSeconds + 3600 }), "Token lifetime too long"],
    ["an iat in the future", claims({ iat: nowSeconds + 120, exp: nowSeconds + 300 }), "Token issued in the future"],
    ["the wrong audience", claims({ aud: "lendloop-n8n" }), "Wrong audience"],
    ["the wrong issuer", claims({ iss: "lendloop-convex" }), "Wrong issuer"],
    ["a missing jti", claims({ jti: "" }), "Missing jti"],
  ])("%s", async (_label, tokenClaims, error) => {
    await expect(verifyJws(await signJws(tokenClaims, SECRET), SECRET, options)).rejects.toThrow(error);
  });

  test("malformed tokens", async () => {
    await expect(verifyJws("not-a-token", SECRET, options)).rejects.toThrow("Malformed token");
    await expect(verifyJws("a.b.c", SECRET, options)).rejects.toThrow("Malformed token");
  });
});

test("constantTimeEqual compares whole buffers", () => {
  expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
  expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
  expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
});
