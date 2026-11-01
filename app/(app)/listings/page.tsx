"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { todayUtc } from "@/lib/format";
import { ToolCard, type ToolView } from "@/components/ToolCard";
import { ToolForm } from "@/components/ToolForm";
import { Button, Card, EmptyState, ErrorText, LoadingCards, PageHeader } from "@/components/ui";
import { useSubmit } from "@/lib/useSubmit";

export default function MyListingsPage() {
  const tools = useQuery(api.tools.mine, { today: todayUtc() });
  const [adding, setAdding] = useState(false);
  const create = useSubmit(useMutation(api.tools.create));

  return (
    <>
      <PageHeader
        title="My listings"
        description="Tools you lend. Requests for them show up under Incoming requests."
        action={!adding && <Button onClick={() => setAdding(true)}>List a tool</Button>}
      />

      {adding && (
        <Card className="mb-6">
          <h2 className="mb-4 font-semibold">List a tool</h2>
          <ToolForm
            submitLabel="Publish listing"
            pending={create.pending}
            error={create.error}
            onCancel={() => setAdding(false)}
            onSubmit={async (fields) => {
              if (await create.run(fields)) setAdding(false);
            }}
          />
        </Card>
      )}

      {tools === undefined ? (
        <LoadingCards />
      ) : tools.length === 0 ? (
        !adding && <EmptyState title="You are not lending anything yet">List a tool and neighbors can ask to borrow it.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {tools.map((tool) => (
            <MyListing key={tool._id} tool={tool} />
          ))}
        </div>
      )}
    </>
  );
}

function MyListing({ tool }: { tool: ToolView }) {
  const [editing, setEditing] = useState(false);
  const update = useSubmit(useMutation(api.tools.update));
  const remove = useSubmit(useMutation(api.tools.remove));

  if (editing) {
    return (
      <Card>
        <ToolForm
          initial={{ name: tool.name, category: tool.category, condition: tool.condition, description: tool.description }}
          submitLabel="Save changes"
          pending={update.pending}
          error={update.error}
          onCancel={() => setEditing(false)}
          onSubmit={async (fields) => {
            if (await update.run({ toolId: tool._id, ...fields })) setEditing(false);
          }}
        />
      </Card>
    );
  }

  return (
    <div>
      <ToolCard
        tool={tool}
        action={
          <span className="flex gap-2">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              variant="danger"
              disabled={remove.pending}
              onClick={() => {
                if (confirm(`Delete "${tool.name}"? Pending requests for it will be declined.`)) {
                  void remove.run({ toolId: tool._id });
                }
              }}
            >
              Delete
            </Button>
          </span>
        }
      />
      <ErrorText>{remove.error}</ErrorText>
    </div>
  );
}
