import { auth } from "@clerk/nextjs/server";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";

/**
 * Every page in this group needs a signed-in user. Signed-out visitors are sent to sign in.
 * This only guards the pages: the data is protected separately by the checks in each Convex function.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  await auth.protect();
  return <AppShell>{children}</AppShell>;
}
