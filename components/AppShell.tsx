"use client";

import { UserButton } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { Logo } from "./Logo";
import { Badge, EmptyState, LoadingCards } from "./ui";

const NAV = [
  { href: "/tools", label: "Browse" },
  { href: "/listings", label: "My listings" },
  { href: "/requests", label: "My requests" },
  { href: "/incoming", label: "Incoming requests" },
];

/**
 * Creates the user's Convex row on first sign-in (users.store) before rendering any page,
 * so every query can rely on requireUser finding it.
 */
function useStoredUser() {
  const { isAuthenticated } = useConvexAuth();
  const store = useMutation(api.users.store);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    if (!isAuthenticated) return;
    store({}).then(
      () => setState("ready"),
      () => setState("error"),
    );
  }, [isAuthenticated, store]);
  return state;
}

export function AppShell({ children }: { children: ReactNode }) {
  const userState = useStoredUser();
  const stored = userState === "ready";
  const me = useQuery(api.users.me, stored ? {} : "skip");
  const pathname = usePathname();
  const nav = me?.role === "admin" ? [...NAV, { href: "/admin", label: "Admin" }] : NAV;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line bg-paper">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Logo href="/tools" />
          <div className="flex items-center gap-3">
            {me?.trustedLender && <Badge>Trusted Lender</Badge>}
            <UserButton />
          </div>
        </div>
        {/* The list's negative margin lines the first label up with the logo. */}
        <nav aria-label="Main" className="mx-auto max-w-5xl overflow-x-auto px-4 sm:px-6">
          <ul className="-mx-3 flex gap-1 pb-2">
            {nav.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`block whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors duration-150 ease-out ${active ? "bg-raised font-medium text-ink" : "text-muted hover:bg-raised/60 hover:text-ink"}`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {userState === "ready" && children}
        {userState === "loading" && <LoadingCards />}
        {userState === "error" && (
          <EmptyState title="We could not load your account">Refresh the page to try again.</EmptyState>
        )}
      </main>
    </div>
  );
}
