import "fake-indexeddb/auto";
import { afterEach, describe, it, expect } from "vitest";
import {
  createPhoneStore,
  phoneApi,
  exportPhone,
  restorePhone,
} from "../mobile/store";
const stores: ReturnType<typeof createPhoneStore>[] = [];
const make = () => {
  const db = createPhoneStore(`test-${crypto.randomUUID()}`);
  stores.push(db);
  return { db, api: phoneApi(db) };
};
afterEach(async () => {
  for (const db of stores.splice(0)) await db.delete();
});
describe("iPhone local persistence", () => {
  it("seeds exactly 45 modules and preserves missing answers across reloads", async () => {
    const { db, api } = make();
    const state = await api("state");
    expect(state.courses).toHaveLength(3);
    expect(state.courses.flatMap((c: any) => c.modules)).toHaveLength(45);
    const cards = state.courses.flatMap((c: any) =>
      c.modules.flatMap((m: any) => m.flashcards),
    );
    expect(
      cards
        .filter((c: any) => c.origin === "curriculum")
        .every((c: any) => c.answer === null),
    ).toBe(true);
    expect(
      cards.filter((c: any) => c.origin === "Shared study draft"),
    ).toHaveLength(117);
    const note = await api("item", {
      kind: "note",
      moduleId: "CL650-M01",
      title: "Local phone note",
      body: "Original persisted content",
      fields: { kind: "notes" },
    });
    db.close();
    await db.open();
    const stored = await phoneApi(db)(`item?kind=note&id=${note.id}`);
    expect(stored.body).toBe("Original persisted content");
  });
  it("grades real saved answers, schedules verified cards, and resumes essays", async () => {
    const { api } = make();
    const card = await api("item", {
      kind: "flashcard",
      moduleId: "CL650-M01",
      title: "Original phone fixture",
      status: "verified",
      fields: { answer: "A saved answer" },
    });
    await api("review", { id: card.id, rating: 2 });
    expect((await api(`item?kind=flashcard&id=${card.id}`)).repetitions).toBe(
      1,
    );
    const q = await api("item", {
      kind: "mCQ",
      moduleId: "CL650-M01",
      title: "Which follows A?",
      status: "verified",
      fields: {
        options: JSON.stringify(["B", "C", "D", "E"]),
        correct: 0,
        explanations: JSON.stringify([
          "B follows A",
          "Not immediately",
          "Not immediately",
          "Not immediately",
        ]),
      },
    });
    const state = await api("state");
    expect(state.courses[0].modules[0].mcqs[0].correct).toBeUndefined();
    expect((await api("quiz", { id: q.id, selected: 0 })).correct).toBe(true);
    const d = await api("essay", {
      moduleId: "CL650-M01",
      title: "Original draft",
      issue: "Issue",
      rule: "Rule",
      application: "My analysis",
      conclusion: "Conclusion",
      assessment: "Self-assessment",
      checklist: "[0]",
      seconds: 25,
    });
    expect(
      (await api("state")).courses[0].modules[0].drafts.find(
        (r: any) => r.id === d.id,
      ).application,
    ).toBe("My analysis");
  });
  it("restores atomically and rejects broken references without deleting edits", async () => {
    const { db, api } = make();
    await api("state");
    await api("item", {
      kind: "note",
      moduleId: "CL650-M01",
      title: "Keep me",
      fields: {},
    });
    const backup = await exportPhone(db);
    await restorePhone(db, backup);
    const broken = structuredClone(backup);
    broken.data.note[0].moduleId = "missing-module";
    await expect(restorePhone(db, broken)).rejects.toThrow();
    expect((await api("state")).courses[0].modules[0].notes[0].title).toBe(
      "Keep me",
    );
    await api("delete", { confirm: "DELETE" });
    expect((await api("state")).courses).toHaveLength(0);
  });
  it("retains natural EPUB section order after restoring records with tied timestamps", async () => {
    const { db, api } = make();
    await api("state");
    const data = await exportPhone(db),
      stamp = "2026-01-01T00:00:00.000Z";
    data.data.source.push({
      id: "source-order",
      courseId: "CL650",
      moduleId: null,
      title: "Order fixture",
      hash: "a".repeat(64),
      filename: "order.epub",
      status: "needs_review",
      type: "notes",
      rights: "Original test material",
      mime: "application/epub+zip",
      author: "",
      edition: "",
      createdAt: stamp,
      updatedAt: stamp,
    });
    for (const [id, number] of [
      ["a", 10],
      ["z", 2],
    ] as const)
      data.data.sourceExcerpt.push({
        id,
        sourceId: "source-order",
        page: 0,
        section: `EPUB spine ${number} · section.xhtml`,
        text: "Original test section.",
        locatorVerified: false,
        createdAt: stamp,
        updatedAt: stamp,
      });
    await restorePhone(db, data);
    const sections = (await api("state")).courses[0].sources.find(
      (s: any) => s.id === "source-order",
    ).excerpts;
    expect(sections.map((e: any) => e.section)).toEqual([
      "EPUB spine 2 · section.xhtml",
      "EPUB spine 10 · section.xhtml",
    ]);
  });
});
