import { describe, it, expect } from "vitest";
import { schedule, grade, essayMarkdown } from "../src/lib/study";
describe("SM-2 scheduling", () => {
  it("resets on Again and schedules successful repetitions", () => {
    const c = { interval: 6, ease: 2.5, repetitions: 2 };
    expect(schedule(c, 0).repetitions).toBe(0);
    expect(schedule(c, 0).interval).toBe(1);
    expect(schedule(c, 3).interval).toBeGreaterThan(6);
    expect(() => schedule(c, 4)).toThrow();
  });
});
describe("grading", () => {
  const q = {
    options: JSON.stringify(["a", "b", "c", "d"]),
    correct: 2,
    explanations: JSON.stringify(["why a", "why b", "why c", "why d"]),
    status: "verified",
  };
  it("uses the saved answer and all explanations", () => {
    expect(grade(q, 2).correct).toBe(true);
    expect(grade(q, 0).correct).toBe(false);
  });
  it("rejects missing answers and unreviewed material", () => {
    expect(() => grade({ ...q, correct: null }, 0)).toThrow();
    expect(() => grade({ ...q, status: "needs_review" }, 0)).toThrow();
  });
});
it("exports the actual IRAC draft", () => {
  expect(
    essayMarkdown({
      title: "Draft",
      issue: "My issue",
      rule: "My rule",
      application: "My analysis",
      conclusion: "My conclusion",
      assessment: "My assessment",
    }),
  ).toContain("## Application\nMy analysis");
});
