"use client";

import { usePreloadedQuery, type Preloaded } from "convex/react";
import type { api } from "@/convex/_generated/api";
import { categoryLabel } from "@/lib/format";
import { Badge, EmptyState } from "./ui";

/** The signed-out list: name and category only, because that is all the public query returns. */
export function PublicToolList({ preloaded }: { preloaded: Preloaded<typeof api.tools.listPublic> }) {
  const tools = usePreloadedQuery(preloaded);

  if (tools.length === 0) {
    return <EmptyState title="Nothing listed yet">Be the first neighbor to lend something.</EmptyState>;
  }

  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((tool, index) => (
        // The public query has no ids on purpose, so the position is the key.
        <li key={index} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3">
          <span className="truncate font-medium">{tool.name}</span>
          <Badge>{categoryLabel(tool.category)}</Badge>
        </li>
      ))}
    </ul>
  );
}
