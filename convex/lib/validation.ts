import { ConvexError } from "convex/values";

/**
 * Trims a user-supplied string and enforces a length range.
 * Convex validators already guarantee the type; this adds the business limits.
 */
export function cleanText(
  value: string,
  field: string,
  { max, required = true }: { max: number; required?: boolean },
): string {
  const text = value.trim();
  if (required && text.length === 0) {
    throw new ConvexError(`${field} is required.`);
  }
  if (text.length > max) {
    throw new ConvexError(`${field} must be ${max} characters or fewer.`);
  }
  return text;
}
