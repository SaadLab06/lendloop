"use client";

import { SignInButton } from "@clerk/nextjs";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import Link from "next/link";
import { Button } from "./ui";

/** "Sign in to lend or borrow" for visitors, a link into the app for signed-in users. */
export function HomeAuthButton({ compact = false }: { compact?: boolean }) {
  return (
    <>
      <AuthLoading>
        <span className={`inline-block rounded-lg bg-stone-200/70 ${compact ? "h-9 w-20" : "h-11 w-56"} animate-pulse`} />
      </AuthLoading>
      <Unauthenticated>
        <SignInButton mode="modal" forceRedirectUrl="/tools">
          {compact ? (
            <Button variant="secondary">Sign in</Button>
          ) : (
            <Button className="px-5 py-3 text-base">Sign in to lend or borrow</Button>
          )}
        </SignInButton>
      </Unauthenticated>
      <Authenticated>
        <Link
          href="/tools"
          className={`inline-flex items-center rounded-lg bg-brand font-medium text-white hover:bg-[#185a3c] ${compact ? "px-3.5 py-2 text-sm" : "px-5 py-3 text-base"}`}
        >
          Open the board
        </Link>
      </Authenticated>
    </>
  );
}
