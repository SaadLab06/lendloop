"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { todayUtc } from "@/lib/format";
import { CATEGORY_LABELS, type Category } from "@/convex/lib/constants";
import { ToolCard } from "@/components/ToolCard";
import { EmptyState, LoadingCards, PageHeader } from "@/components/ui";

const CATEGORIES = Object.entries(CATEGORY_LABELS) as [Category, string][];

export default function BrowsePage() {
  const [category, setCategory] = useState<Category | undefined>(undefined);
  const tools = useQuery(api.tools.list, { category, today: todayUtc() });

  return (
    <>
      <PageHeader title="All tools" description="Everything your neighbors are lending, with what is free right now." />

      <div role="group" aria-label="Filter by category" className="-mx-1 mb-6 flex flex-wrap gap-2">
        <FilterChip label="All" active={category === undefined} onClick={() => setCategory(undefined)} />
        {CATEGORIES.map(([value, label]) => (
          <FilterChip key={value} label={label} active={category === value} onClick={() => setCategory(value)} />
        ))}
      </div>

      {tools === undefined ? (
        <LoadingCards count={4} />
      ) : tools.length === 0 ? (
        <EmptyState title={category ? `No ${CATEGORY_LABELS[category].toLowerCase()} listed yet` : "No tools listed yet"}>
          Have something to share? Add it under My listings.
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {tools.map((tool) => (
            <ToolCard key={tool._id} tool={tool} />
          ))}
        </div>
      )}
    </>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-sm ${active ? "border-brand bg-brand text-white" : "border-line bg-white text-ink hover:bg-stone-50"}`}
    >
      {label}
    </button>
  );
}
