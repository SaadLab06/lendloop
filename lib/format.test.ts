import { describe, expect, test } from "vitest";
import { nextDays } from "./format";

describe("nextDays", () => {
  test("crosses month ends and the October DST change without skipping a day", () => {
    expect(nextDays("2026-10-30", 4)).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });
});
