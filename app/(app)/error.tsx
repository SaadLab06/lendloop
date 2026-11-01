"use client";

import { errorMessage } from "@/lib/useSubmit";
import { Button, EmptyState } from "@/components/ui";

/** Shown when a query throws, for example if a session expires mid-visit. */
export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <EmptyState title="This page could not load">
      <p>{errorMessage(error)}</p>
      <Button variant="secondary" className="mt-4" onClick={reset}>
        Try again
      </Button>
    </EmptyState>
  );
}
