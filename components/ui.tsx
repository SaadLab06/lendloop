// Small presentational building blocks shared by every page.
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-[#185a3c] disabled:bg-brand/50",
  secondary: "border border-line bg-white text-ink hover:bg-stone-50 disabled:text-muted",
  danger: "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 disabled:text-rose-300",
  ghost: "text-muted hover:text-ink hover:bg-stone-100",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

type Tone = "green" | "amber" | "blue" | "red" | "gray" | "violet";

const TONES: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  blue: "bg-sky-50 text-sky-800 ring-sky-200",
  red: "bg-rose-50 text-rose-800 ring-rose-200",
  gray: "bg-stone-100 text-stone-700 ring-stone-200",
  violet: "bg-violet-50 text-violet-800 ring-violet-200",
};

export function Badge({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-white p-4 shadow-sm shadow-stone-900/5 ${className}`}>{children}</div>;
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-white/60 px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

/** Placeholder cards shown while a query loads. */
export function LoadingCards({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-28 animate-pulse rounded-xl border border-line bg-white" />
      ))}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm text-rose-700">
      {children}
    </p>
  );
}

export const inputClass =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm placeholder:text-stone-400 focus:border-brand focus:outline-none";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
