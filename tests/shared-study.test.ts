import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import {
  createPhoneStore,
  phoneApi,
  exportPhone,
  restorePhone,
} from "../mobile/store";
import catalog from "../src/content/shared-study.json";
it("loads original shared notes automatically without exposing textbook extracts or overwriting edits", async () => {
  const db = createPhoneStore(`shared-${crypto.randomUUID()}`);
  try {
    const api = phoneApi(db);
    const state = await api("state");
    expect(catalog.entries).toHaveLength(53);
    expect(catalog.cases).toHaveLength(56);
    for (const entry of [...catalog.entries, ...catalog.cases]) {
      expect(entry).not.toHaveProperty("parentExcerptId");
      expect(entry).not.toHaveProperty("text");
      expect(entry).not.toHaveProperty("filename");
    }
    const source = state.courses[0].sources.find(
      (s: any) => s.id === "shared-notes-CL650-v5",
    );
    expect(source.type).toBe("notes");
    expect(source.rights).toContain("not included");
    const card = await db
      .table("flashcard")
      .filter((r) => r.origin === "Shared study draft")
      .first();
    await db.table("flashcard").update(card.id, {
      answer: "My reviewed answer",
      repetitions: 4,
      due: "2030-01-01T00:00:00.000Z",
    });
    await db.table("meta").delete("shared-study-v5");
    await api("state");
    const retained = await db.table("flashcard").get(card.id);
    expect(retained.answer).toBe("My reviewed answer");
    expect(retained.repetitions).toBe(4);
    expect(retained.due).toBe("2030-01-01T00:00:00.000Z");
    const backup = await exportPhone(db);
    const counts = {
      notes: await db.table("note").count(),
      cards: await db.table("flashcard").count(),
    };
    await restorePhone(db, backup);
    await api("state");
    expect(await db.table("note").count()).toBe(counts.notes);
    expect(await db.table("flashcard").count()).toBe(counts.cards);
  } finally {
    await db.delete();
  }
});
