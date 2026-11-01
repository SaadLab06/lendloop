import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Re-queues outbox events whose delivery action died without recording a result.
crons.interval("requeue stuck outbox events", { minutes: 10 }, internal.outbox.requeueStuck, {});

export default crons;
