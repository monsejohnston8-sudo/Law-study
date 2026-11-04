import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import definitions from "../src/content/definitions.json";
import guides from "../src/content/reading-guides.json";
import sources from "../src/content/primary-sources.json";
import { createPhoneStore, phoneApi } from "../mobile/store";
it("covers every module with substantive notes and retains primary-source limits", () => {
  expect(new Set(guides.guides.map((g) => g.moduleId)).size).toBe(45);
  expect(guides.guides).toHaveLength(47);
  for (const g of guides.guides) {
    expect(
      g.sections
        .map((s) => s.body)
        .join(" ")
        .split(/\s+/).length,
    ).toBeGreaterThan(150);
    for (const id of g.primarySourceIds)
      expect(sources.sources.some((s) => s.id === id)).toBe(true);
  }
  expect(
    sources.sources.find((s) => s.id === "mcculloch")!.sourceNote,
  ).toContain("incorrectly");
  expect(
    guides.guides.find((g) => g.moduleId === "CL650-M14")!.scope,
  ).toContain("Newer assigned decisions");
});
it("includes all 20 uploaded terms with examples, boundaries and page references", () => {
  expect(definitions.terms).toHaveLength(20);
  expect(new Set(definitions.terms.map((t) => t.id)).size).toBe(20);
  for (const t of definitions.terms) {
    expect(t.moduleIds).toContain("CL685-M08");
    expect([1, 2]).toContain(t.page);
    expect(t.definition.length).toBeGreaterThan(50);
    expect(t.explanation.length).toBeGreaterThan(150);
    expect(t.example).toContain("Hypothetical:");
    expect(t.pitfall.length).toBeGreaterThan(60);
    expect(t.reference).toContain(`PDF page ${t.page}`);
  }
  expect(
    definitions.terms.find((t) => t.id === "custodial-interrogation")!
      .explanation,
  ).toContain("two inquiries");
  expect(
    definitions.terms.find((t) => t.id === "protective-sweep")!.explanation,
  ).toContain("Buie");
});
it("installs definitions in relevant modules without overwriting personal edits on rerun", async () => {
  const db = createPhoneStore(`definitions-${crypto.randomUUID()}`);
  try {
    const api = phoneApi(db);
    const state = await api("state");
    const modules = state.courses.flatMap((c: any) => c.modules);
    expect(
      modules.every((m: any) =>
        m.notes.some((n: any) => n.kind === "Detailed reading notes"),
      ),
    ).toBe(true);
    const m8 = modules.find((m: any) => m.id === "CL685-M08");
    expect(
      m8.notes.filter((n: any) => n.kind === "Definitions & explanations"),
    ).toHaveLength(20);
    expect(
      modules
        .find((m: any) => m.id === "CL685-M05")
        .notes.some((n: any) => n.title === "Stop and frisk"),
    ).toBe(true);
    const id = "definition-note-custodial-interrogation-CL685-M08";
    await db.table("note").update(id, { body: "My own explanation" });
    await db.table("meta").delete("shared-study-v4");
    await api("state");
    expect((await db.table("note").get(id)).body).toBe("My own explanation");
    expect(
      await db
        .table("flashcard")
        .filter((q) => q.id.startsWith("definition-card-"))
        .count(),
    ).toBe(20);
  } finally {
    await db.delete();
  }
});
