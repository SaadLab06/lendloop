import { CATEGORY_LABELS, CONDITION_LABELS, type Category, type Condition } from "@/convex/lib/constants";

export const categoryLabel = (category: Category) => CATEGORY_LABELS[category];
export const conditionLabel = (condition: Condition) => CONDITION_LABELS[condition];

// Loan dates are calendar days stored as "YYYY-MM-DD" in UTC, so format them in UTC too.
const dayFormat = new Intl.DateTimeFormat("en", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export function formatDay(date: string): string {
  return dayFormat.format(new Date(`${date}T00:00:00Z`));
}

export function formatRange(startDate: string, endDate: string): string {
  return startDate === endDate ? formatDay(startDate) : `${formatDay(startDate)} to ${formatDay(endDate)}`;
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "2 days ago", "in 3 hours", "just now". */
export function timeAgo(timestamp: number, now: number = Date.now()): string {
  const diff = timestamp - now;
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return relative.format(Math.round(diff / ms), unit);
  }
  return "just now";
}

/** `count` calendar days as "YYYY-MM-DD", starting with `start`. Stepping in UTC keeps DST from skipping a day. */
export function nextDays(start: string, count: number): string[] {
  const first = Date.parse(`${start}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => new Date(first + i * 86_400_000).toISOString().slice(0, 10));
}

/** Today's date as "YYYY-MM-DD" in UTC, matching the server's notion of today. */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
