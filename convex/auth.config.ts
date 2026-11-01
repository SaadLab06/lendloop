import type { AuthConfig } from "convex/server";

// Convex accepts Clerk-issued JWTs whose issuer is this Clerk Frontend API URL and whose
// audience is "convex". Set CLERK_JWT_ISSUER_DOMAIN on the Convex deployment
// (npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-app>.clerk.accounts.dev).
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
