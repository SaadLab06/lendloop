"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { todayUtc } from "@/lib/format";
import { LoanCard, type LoanView } from "@/components/LoanCard";
import { Button, EmptyState, ErrorText, LoadingCards, PageHeader } from "@/components/ui";
import { useSubmit } from "@/lib/useSubmit";

export default function IncomingRequestsPage() {
  const loans = useQuery(api.loans.incoming, { today: todayUtc() });
  const open = loans?.filter((loan) => loan.status === "pending" || loan.status === "approved") ?? [];
  const closed = loans?.filter((loan) => loan.status !== "pending" && loan.status !== "approved") ?? [];

  return (
    <>
      <PageHeader title="Incoming requests" description="Neighbors asking to borrow your tools. Approve, decline, and close loans here." />
      {loans === undefined ? (
        <LoadingCards />
      ) : loans.length === 0 ? (
        <EmptyState title="No requests for your tools yet">They will appear here as soon as someone asks.</EmptyState>
      ) : (
        <div className="space-y-8">
          <LoanList title="Needs your attention" loans={open} empty="Nothing waiting on you." />
          <LoanList title="History" loans={closed} empty="No finished requests yet." />
        </div>
      )}
    </>
  );
}

function LoanList({ title, loans, empty }: { title: string; loans: LoanView[]; empty: string }) {
  return (
    <section>
      <h2 className="mb-3 font-medium">{title}</h2>
      {loans.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {loans.map((loan) => (
            <IncomingRequest key={loan._id} loan={loan} />
          ))}
        </div>
      )}
    </section>
  );
}

function IncomingRequest({ loan }: { loan: LoanView }) {
  const approve = useSubmit(useMutation(api.loans.approve));
  const decline = useSubmit(useMutation(api.loans.decline));
  const markReturned = useSubmit(useMutation(api.loans.markReturned));
  const busy = approve.pending || decline.pending || markReturned.pending;

  return (
    <div>
      <LoanCard
        loan={loan}
        perspective="lender"
        actions={
          loan.status === "pending" ? (
            <>
              <Button variant="secondary" disabled={busy} onClick={() => void decline.run({ loanId: loan._id })}>
                Decline
              </Button>
              <Button disabled={busy} onClick={() => void approve.run({ loanId: loan._id })}>
                Approve
              </Button>
            </>
          ) : loan.status === "approved" ? (
            <Button variant="secondary" disabled={busy} onClick={() => void markReturned.run({ loanId: loan._id })}>
              Mark returned
            </Button>
          ) : undefined
        }
      />
      <ErrorText>{approve.error ?? decline.error ?? markReturned.error}</ErrorText>
    </div>
  );
}
