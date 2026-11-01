"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { LoanCard } from "@/components/LoanCard";
import { ToolCard } from "@/components/ToolCard";
import { Badge, Button, Card, EmptyState, ErrorText, LoadingCards, PageHeader } from "@/components/ui";
import { timeAgo, todayUtc } from "@/lib/format";
import { useSubmit } from "@/lib/useSubmit";

export default function AdminPage() {
  const me = useQuery(api.users.me);
  if (me === undefined) return <LoadingCards />;
  // The admin queries reject non-admins on the server; this just avoids calling them.
  if (me?.role !== "admin") {
    return <EmptyState title="Admins only">Ask an admin if you need access.</EmptyState>;
  }
  return (
    <>
      <PageHeader title="Admin" description="Automation health, members, all loans and all listings." />
      <div className="space-y-10">
        <AutomationHealth />
        <Members myId={me._id} />
        <AllLoans />
        <AllListings />
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function AutomationHealth() {
  const health = useQuery(api.admin.automationHealth);
  const retry = useSubmit(useMutation(api.admin.retryEvent));
  if (health === undefined) return <LoadingCards count={1} />;
  const healthy = health.failedEvents.length === 0 && health.workflowFailures.length === 0;

  return (
    <Section title="Automation health">
      <p className="mb-3 text-sm text-muted">
        {health.pendingCount === 0 ? "No events waiting for delivery." : `${health.pendingCount} event(s) waiting for delivery or retry.`}
      </p>
      {healthy ? (
        <EmptyState title="All clear">No failed deliveries and no failed n8n runs.</EmptyState>
      ) : (
        <div className="space-y-3">
          {health.failedEvents.map((event) => (
            <Card key={event._id} className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 text-sm">
                <p className="font-medium">
                  Webhook not delivered: {event.type} ({event.status})
                </p>
                <p className="text-muted">
                  {event.attempts} attempts · {timeAgo(event.at)} · {event.lastError}
                </p>
              </div>
              <Button variant="secondary" disabled={retry.pending} onClick={() => void retry.run({ outboxId: event._id })}>
                Retry
              </Button>
            </Card>
          ))}
          {health.workflowFailures.map((failure) => (
            <Card key={failure._id} className="text-sm">
              <p className="font-medium">
                n8n run failed: {failure.workflow}
                {failure.node ? ` at "${failure.node}"` : ""}
              </p>
              <p className="text-muted">
                Execution {failure.executionId} · {timeAgo(failure.at)} · {failure.message}
              </p>
            </Card>
          ))}
          <ErrorText>{retry.error}</ErrorText>
        </div>
      )}
    </Section>
  );
}

type Member = FunctionReturnType<typeof api.admin.listUsers>[number];

function Members({ myId }: { myId: Member["_id"] }) {
  const users = useQuery(api.admin.listUsers);
  return (
    <Section title="Members">
      {users === undefined ? (
        <LoadingCards count={1} />
      ) : (
        <Card className="divide-y divide-line p-0">
          {users.map((user) => (
            <MemberRow key={user._id} user={user} isMe={user._id === myId} />
          ))}
        </Card>
      )}
    </Section>
  );
}

function MemberRow({ user, isMe }: { user: Member; isMe: boolean }) {
  const setTrusted = useSubmit(useMutation(api.admin.setTrustedLender));
  const setRole = useSubmit(useMutation(api.admin.setRole));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0 text-sm">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {user.name} {isMe && <span className="text-muted">(you)</span>}
          {user.role === "admin" && <Badge tone="blue">Admin</Badge>}
          {user.trustedLender && <Badge tone="violet">Trusted Lender</Badge>}
        </p>
        <p className="truncate text-muted">{user.email ?? "No email"}</p>
        <ErrorText>{setTrusted.error ?? setRole.error}</ErrorText>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={setTrusted.pending}
          onClick={() => void setTrusted.run({ userId: user._id, trusted: !user.trustedLender })}
        >
          {user.trustedLender ? "Remove trusted badge" : "Mark Trusted Lender"}
        </Button>
        {!isMe && (
          <Button
            variant="ghost"
            disabled={setRole.pending}
            onClick={() => void setRole.run({ userId: user._id, role: user.role === "admin" ? "user" : "admin" })}
          >
            {user.role === "admin" ? "Make user" : "Make admin"}
          </Button>
        )}
      </div>
    </div>
  );
}

function AllLoans() {
  const loans = useQuery(api.admin.listLoans, { today: todayUtc() });
  const markReturned = useSubmit(useMutation(api.loans.markReturned));
  return (
    <Section title="All loans">
      {loans === undefined ? (
        <LoadingCards />
      ) : loans.length === 0 ? (
        <EmptyState title="No loans yet" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {loans.map((loan) => (
            <LoanCard
              key={loan._id}
              loan={loan}
              perspective="admin"
              actions={
                loan.status === "approved" ? (
                  <Button variant="secondary" disabled={markReturned.pending} onClick={() => void markReturned.run({ loanId: loan._id })}>
                    Mark returned
                  </Button>
                ) : undefined
              }
            />
          ))}
        </div>
      )}
      <ErrorText>{markReturned.error}</ErrorText>
    </Section>
  );
}

function AllListings() {
  const tools = useQuery(api.tools.list, { today: todayUtc() });
  const remove = useSubmit(useMutation(api.tools.remove));
  return (
    <Section title="All listings">
      {tools === undefined ? (
        <LoadingCards />
      ) : tools.length === 0 ? (
        <EmptyState title="No listings yet" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {tools.map((tool) => (
            <ToolCard
              key={tool._id}
              tool={tool}
              action={
                <Button
                  variant="danger"
                  disabled={remove.pending}
                  onClick={() => {
                    if (confirm(`Remove "${tool.name}" for everyone? Pending requests will be declined.`)) {
                      void remove.run({ toolId: tool._id });
                    }
                  }}
                >
                  Remove listing
                </Button>
              }
            />
          ))}
        </div>
      )}
      <ErrorText>{remove.error}</ErrorText>
    </Section>
  );
}
