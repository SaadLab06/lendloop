import { ConvexError } from "convex/values";
import { LIMITS } from "./constants";

// Dates are plain calendar days ("YYYY-MM-DD"). Plain string comparison orders them
// correctly, which keeps the overlap check and the overdue index simple.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  // Rejects impossible days such as 2026-02-30, which Date would roll over.
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Validates a date passed in as a query argument.
 * Queries take "today" as an argument instead of reading the clock: Convex caches a query's result
 * until the data it read changes, and the date changing is not a data change.
 */
export function assertIsoDate(value: string, field = "Date"): string {
  if (!isIsoDate(value)) {
    throw new ConvexError(`${field} must be a valid day in the format YYYY-MM-DD.`);
  }
  return value;
}

/** Today's date in UTC. Mutations use it for every rule; queries receive it as an argument. */
export function todayIso(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

type DateRange = { startDate: string; endDate: string };

/** Both ranges include their first and last day, so a loan ending on the 10th blocks one starting on the 10th. */
export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

/** Throws a user-facing error when a requested range is not acceptable. */
export function assertValidLoanRange(range: DateRange, today: string): void {
  const { startDate, endDate } = range;
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
    throw new ConvexError("Dates must be valid days in the format YYYY-MM-DD.");
  }
  if (startDate < today) {
    throw new ConvexError("The start date cannot be in the past.");
  }
  if (endDate < startDate) {
    throw new ConvexError("The end date must be on or after the start date.");
  }
  if (daysBetween(startDate, endDate) + 1 > LIMITS.maxLoanDays) {
    throw new ConvexError(`A loan can last at most ${LIMITS.maxLoanDays} days.`);
  }
  if (daysBetween(today, startDate) > LIMITS.maxDaysAhead) {
    throw new ConvexError(`Requests can start at most ${LIMITS.maxDaysAhead} days ahead.`);
  }
}
