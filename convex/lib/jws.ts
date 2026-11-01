// HS256 JSON Web Signatures (RFC 7515) with Web Crypto, for both directions of the n8n integration.
//
// HS256 is HMAC-SHA256 over "base64url(header).base64url(claims)". We use the JWS format rather than
// a home-made signature header because n8n verifies it natively in the Webhook node and signs it in
// the JWT node, both reading the secret from an n8n credential. No secret ends up in workflow JSON.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type Claims = Record<string, unknown> & {
  iss: string;
  aud: string;
  jti: string;
  iat: number;
  exp: number;
};

export class JwsError extends Error {}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new JwsError("Malformed token");
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  let binary: string;
  try {
    binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  } catch {
    throw new JwsError("Malformed token");
  }
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** Compares every byte even after a mismatch, so timing does not reveal how much of a signature was right. */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
}

export async function signJws(claims: Claims, secret: string): Promise<string> {
  const header = base64UrlEncode(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = base64UrlEncode(encoder.encode(JSON.stringify(claims)));
  const signature = await hmacSha256(secret, `${header}.${payload}`);
  return `${header}.${payload}.${base64UrlEncode(signature)}`;
}

export type VerifyOptions = {
  issuer: string;
  audience: string;
  /** Longest accepted lifetime (exp - iat). Keeps the replay window short even if the signer asks for more. */
  maxLifetimeSeconds: number;
  now?: number; // milliseconds, for tests
};

const CLOCK_SKEW_SECONDS = 60;

/** Returns the claims if the signature, issuer, audience and time window are all valid. Throws JwsError otherwise. */
export async function verifyJws(token: string, secret: string, options: VerifyOptions): Promise<Claims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new JwsError("Malformed token");
  const [headerPart, payloadPart, signaturePart] = parts;

  const header = parseJson(headerPart);
  // Pinning the algorithm blocks "alg: none" and algorithm-confusion tricks.
  if (header.alg !== "HS256") throw new JwsError("Unsupported algorithm");

  const expected = await hmacSha256(secret, `${headerPart}.${payloadPart}`);
  if (!constantTimeEqual(expected, base64UrlDecode(signaturePart))) {
    throw new JwsError("Invalid signature");
  }

  const claims = parseJson(payloadPart);
  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
  if (claims.iss !== options.issuer) throw new JwsError("Wrong issuer");
  if (claims.aud !== options.audience) throw new JwsError("Wrong audience");
  if (typeof claims.jti !== "string" || claims.jti.length === 0) throw new JwsError("Missing jti");
  if (typeof claims.iat !== "number" || typeof claims.exp !== "number") {
    throw new JwsError("Missing iat or exp");
  }
  if (claims.exp <= nowSeconds) throw new JwsError("Token expired");
  if (claims.iat > nowSeconds + CLOCK_SKEW_SECONDS) throw new JwsError("Token issued in the future");
  if (claims.exp - claims.iat > options.maxLifetimeSeconds) throw new JwsError("Token lifetime too long");
  return claims as Claims;
}

function parseJson(part: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(decoder.decode(base64UrlDecode(part)));
  } catch {
    throw new JwsError("Malformed token");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new JwsError("Malformed token");
  }
  return value as Record<string, unknown>;
}
