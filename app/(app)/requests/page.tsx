"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { LoanCard, type LoanView } from "@/components/LoanCard";
import { Button, EmptyState, ErrorText, LoadingCards, PageHeader } from "@/components/ui";
import { useSubmit } from "@/lib/useSubmit";

export default function MyRequestsPage() {
  const loans = useQuery(api.loans.myRequests);

  return (
    <>
      <PageHeader title="My requests" description="Tools you asked to borrow, and where each request stands." />
      {loans === undefined ? (
        <LoadingCards />
      ) : loans.length === 0 ? (
        <EmptyState title="No requests yet">
          Find something on the{" "}
          <Link href="/tools" className="font-medium text-brand underline">
            Browse
          </Link>{" "}
          page and ask to borrow it.
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {loans.map((loan) => (
            <MyRequest key={loan._id} loan={loan} />
          ))}
        </div>
      )}
    </>
  );
}

function MyRequest({ loan }: { loan: LoanView }) {
  const cancel = useSubmit(useMutation(api.loans.cancel));
  return (
    <div>
      <LoanCard
        loan={loan}
        perspective="borrower"
        actions={
          loan.status === "pending" && (
            <Button variant="secondary" disabled={cancel.pending} onClick={() => void cancel.run({ loanId: loan._id })}>
              Cancel request
            </Button>
          )
        }
      />
      <ErrorText>{cancel.error}</ErrorText>
    </div>
  );
}
