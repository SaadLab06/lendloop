import { clerkMiddleware } from "@clerk/nextjs/server";

// Makes the Clerk session available to server components (auth() in app/(app)/layout.tsx).
// Access is checked where the data is: the (app) layout for pages, each Convex function for data.
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and static files.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
