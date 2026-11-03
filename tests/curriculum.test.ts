import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
describe("curriculum integrity", () => {
  it("preserves 3 courses, 45 stable module IDs and missing answers", () => {
    const maps = ["CL650", "CL685", "CL700"].map((code) =>
      JSON.parse(readFileSync(`curriculum/${code}.json`, "utf8")),
    );
    expect(maps.flatMap((c) => c.modules)).toHaveLength(45);
    expect(
      new Set(maps.flatMap((c) => c.modules.map((m: { id: string }) => m.id)))
        .size,
    ).toBe(45);
    for (const c of maps)
      for (const m of c.modules)
        for (const f of m.flashcards) expect(f.answer).toBeNull();
  });
});
