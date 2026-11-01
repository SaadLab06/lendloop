import Link from "next/link";

/** Two linked rings: one neighbor lends, the other borrows. */
export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 font-semibold tracking-tight">
      <svg width="26" height="18" viewBox="0 0 26 18" fill="none" aria-hidden="true">
        <circle cx="9" cy="9" r="7" stroke="#1f6f4a" strokeWidth="2.5" />
        <circle cx="17" cy="9" r="7" stroke="#d08a2b" strokeWidth="2.5" />
      </svg>
      LendLoop
    </Link>
  );
}
