// Small presentational building blocks shared by every page.
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-strong disabled:bg-brand/50",
  secondary: "border border-line bg-card text-ink hover:bg-raised disabled:text-muted",
  danger: "border border-line bg-card text-danger hover:bg-raised disabled:text-danger/50",
  ghost: "text-muted hover:bg-raised hover:text-ink",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-[color,background-color,border-color,transform] duration-150 ease-out active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

/** A quiet text tag, for roles and categories. */
export function Badge({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-md bg-raised px-2 py-0.5 text-xs font-medium text-muted">{children}</span>;
}

type Tone = "free" | "loan" | "late" | "done";

const DOTS: Record<Tone, string> = {
  free: "bg-brand",
  loan: "bg-loan",
  late: "bg-danger",
  done: "bg-muted/40",
};

/** Where a tool or loan stands: a colored dot and plain text, so the color never has to carry the meaning alone. */
export function Status({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-2 whitespace-nowrap text-sm ${tone === "late" ? "text-danger" : "text-muted"}`}>
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${DOTS[tone]}`} />
      {children}
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-card p-5 shadow-sm shadow-ink/5 ${className}`}>{children}</div>;
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-medium">{title}</h1>
        {description && <p className="mt-2 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-card/60 px-6 py-10 text-center">
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
        <div key={i} className="h-28 rounded-xl border border-line bg-card/60" />
      ))}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm text-danger">
      {children}
    </p>
  );
}

export const inputClass =
  "w-full rounded-lg border border-line bg-card px-3 py-2 text-sm placeholder:text-muted/70 focus:border-brand focus:outline-none";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
