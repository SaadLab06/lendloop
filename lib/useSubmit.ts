"use client";

import { ConvexError } from "convex/values";
import { useCallback, useState } from "react";

/** Turns an error from a Convex call into a sentence we can show the user. */
export function errorMessage(error: unknown): string {
  if (error instanceof ConvexError && typeof error.data === "string") return error.data;
  return "Something went wrong. Please try again.";
}

/**
 * Wraps an async action (usually a Convex mutation) with pending and error state,
 * so buttons can disable themselves and forms can show the server's message.
 * run() resolves to true when the action succeeded.
 */
export function useSubmit<Args extends unknown[]>(action: (...args: Args) => Promise<unknown>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (...args: Args): Promise<boolean> => {
      setPending(true);
      setError(null);
      try {
        await action(...args);
        return true;
      } catch (caught) {
        setError(errorMessage(caught));
        return false;
      } finally {
        setPending(false);
      }
    },
    [action],
  );

  return { run, pending, error };
}
