import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import {
  createPhoneStore,
  phoneApi,
  exportPhone,
  restorePhone,
} from "../mobile/store";
import { seedSharedStudy } from "../mobile/shared-study";
import curriculum from "../src/content/module-practice.json";
import exercises from "../src/content/irac-exercises.json";
it("provides substantial sourced guides, 20 answered cards and two complete authored questions per module", async () => {
  const db = createPhoneStore(`complete-${crypto.randomUUID()}`);
  try {
    const api = phoneApi(db),
      state = await api("state");
    const modules = state.courses.flatMap((c: any) => c.modules);
    expect(modules).toHaveLength(45);
    expect(curriculum.modules).toHaveLength(45);
    for (const m of modules) {
      const cards = m.flashcards.filter(
        (c: any) => c.answer?.trim() && c.status !== "missing",
      );
      expect(cards.length, m.id).toBeGreaterThanOrEqual(20);
      expect(new Set(cards.map((c: any) => c.id)).size).toBe(cards.length);
      const guide = curriculum.modules.find((u) => u.moduleId === m.id)!;
      expect(guide.wordCount).toBeGreaterThan(600);
      expect(guide.references.length).toBeGreaterThan(0);
      const authored = m.mcqs.filter(
        (q: any) => q.origin === "Casebook authored",
      );
      expect(authored).toHaveLength(2);
      expect(
        authored.every(
          (q: any) => q.practiceReady && !q.gradable && q.correct === undefined,
        ),
      ).toBe(true);
    }
    const m = modules[0],
      card = m.flashcards.find((c: any) => c.origin === "Casebook authored");
    await expect(api("review", { id: card.id, rating: 2 })).rejects.toThrow();
    await api("review", { id: card.id, rating: 2, allowDrafts: true });
    const q = m.mcqs.find((q: any) => q.origin === "Casebook authored");
    await expect(api("quiz", { id: q.id, selected: 0 })).rejects.toThrow();
    const result = await api("quiz", {
      id: q.id,
      selected: 0,
      allowDraft: true,
    });
    expect(result.keyStatus).toBe("needs_review");
    expect(result.explanations).toHaveLength(4);
    await seedSharedStudy(db, true);
    expect((await db.table("flashcard").get(card.id)).repetitions).toBe(1);
    expect(await db.table("quizAttempt").count()).toBe(1);
  } finally {
    await db.delete();
  }
});
it("persists all twelve essay prompts and requires a complete response to submit", async () => {
  const db = createPhoneStore(`essay-${crypto.randomUUID()}`);
  try {
    const api = phoneApi(db);
    await api("state");
    expect(exercises.essays).toHaveLength(12);
    expect(new Set(exercises.essays.map((e) => e.moduleId)).size).toBe(12);
    for (const course of ["CL650", "CL685", "CL700"])
      for (const n of [4, 8, 10, 14])
        expect(
          exercises.essays.some(
            (e) => e.moduleId === `${course}-M${String(n).padStart(2, "0")}`,
          ),
        ).toBe(true);
    const prompt = exercises.essays[0];
    const payload = {
      moduleId: prompt.moduleId,
      promptId: prompt.id,
      title: prompt.title,
      issue: "Issue",
      rule: "Rule",
      application: "",
      conclusion: "Conclusion",
      assessment: "",
      checklist: "[]",
      seconds: 12,
      submittedAt: new Date().toISOString(),
    };
    await expect(api("essay", payload)).rejects.toThrow(/four IRAC/);
    const saved = await api("essay", {
      ...payload,
      application: "Facts, counterargument, analysis",
    });
    await restorePhone(db, await exportPhone(db));
    const restored = await db.table("essayDraft").get(saved.id);
    expect(restored.promptId).toBe(prompt.id);
    expect(restored.submittedAt).toBe(payload.submittedAt);
    await api("essay", {
      ...restored,
      submittedAt: null,
      application: "Revised analysis",
    });
    expect((await db.table("essayDraft").get(saved.id)).submittedAt).toBeNull();
  } finally {
    await db.delete();
  }
});
