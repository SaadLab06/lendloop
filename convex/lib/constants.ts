// Values shared by the schema, the Convex functions and the UI.
// The UI imports the label maps from here so the two sides never drift apart.
import { v, type Infer } from "convex/values";

export const categoryValidator = v.union(
  v.literal("power_tools"),
  v.literal("hand_tools"),
  v.literal("garden"),
  v.literal("kitchen"),
  v.literal("camping"),
  v.literal("cleaning"),
  v.literal("other"),
);
export type Category = Infer<typeof categoryValidator>;

export const CATEGORY_LABELS: Record<Category, string> = {
  power_tools: "Power tools",
  hand_tools: "Hand tools",
  garden: "Garden",
  kitchen: "Kitchen",
  camping: "Camping",
  cleaning: "Cleaning",
  other: "Other",
};

export const conditionValidator = v.union(
  v.literal("like_new"),
  v.literal("good"),
  v.literal("fair"),
  v.literal("worn"),
);
export type Condition = Infer<typeof conditionValidator>;

export const CONDITION_LABELS: Record<Condition, string> = {
  like_new: "Like new",
  good: "Good",
  fair: "Fair",
  worn: "Worn but works",
};

// A loan starts as a pending request. The lender approves or declines it,
// the borrower can cancel it while pending, and an approved loan ends as returned.
export const loanStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("cancelled"),
  v.literal("returned"),
);
export type LoanStatus = Infer<typeof loanStatusValidator>;

export const roleValidator = v.union(v.literal("admin"), v.literal("user"));
export type Role = Infer<typeof roleValidator>;

// Events sent to n8n: a request was created, or its status changed.
export const eventTypeValidator = v.union(
  v.literal("request.created"),
  v.literal("request.status_changed"),
);
export type EventType = Infer<typeof eventTypeValidator>;

export const LIMITS = {
  toolName: 60,
  description: 280,
  message: 280,
  maxLoanDays: 30,
  maxDaysAhead: 180,
};
