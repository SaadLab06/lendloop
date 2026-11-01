import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Signed-out visitors who open an app page are sent to sign in.
// This is a convenience only: every Convex function checks access itself.
const isAppRoute = createRouteMatcher(["/tools(.*)", "/listings(.*)", "/requests(.*)", "/incoming(.*)", "/admin(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  if (isAppRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
