import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { createPhoneStore, phoneApi, exportPhone } from "../mobile/store";
import { mergeStudyPackage } from "../mobile/merge-package";
async function makePackage(
  db: ReturnType<typeof createPhoneStore>,
  input: unknown,
) {
  const files: Record<string, Uint8Array> = {
    "backup.json": strToU8(JSON.stringify(input)),
  };
  for (const source of (input as any).data.source) {
    const original = await db.table("original").get(source.filename);
    files[`originals/${source.filename}`] = new Uint8Array(
      await original.blob.arrayBuffer(),
    );
  }
  return new File([new Uint8Array(zipSync(files))], "update.zip");
}
it("adds materials idempotently while preserving writing, saved exams, and progress", async () => {
  const db = createPhoneStore(`merge-${crypto.randomUUID()}`),
    api = phoneApi(db);
  try {
    await api("state");
    const note = await api("item", {
      kind: "note",
      moduleId: "CL650-M01",
      title: "My work",
      body: "Keep me",
      fields: { kind: "notes" },
    });
    const exam = await api("essay", {
      moduleId: "CL650-M01",
      title: "Mini module exam: CL650-M01",
      issue: "",
      rule: "",
      application: '{"q":"My answer"}',
      conclusion: "",
      assessment: "submitted",
      checklist: "[]",
      seconds: 12,
    });
    await api("progress", {
      moduleId: "CL650-M01",
      completed: true,
      mastery: 74,
    });
    const before = await exportPhone(db);
    const incoming = structuredClone(before);
    incoming.data.note.push({
      ...incoming.data.note[0],
      id: "new-source-note",
      origin: "AI-generated draft",
      title: "New draft",
      body: "Source-based fixture",
    });
    incoming.data.note[0].body = "Do not overwrite";
    incoming.data.essayDraft = [];
    incoming.data.masteryProgress = [];
    const file = await makePackage(db, incoming);
    const result = await mergeStudyPackage(db, file);
    expect(result.added).toBe(1);
    expect((await db.table("note").get(note.id)).body).toBe("Keep me");
    expect((await db.table("essayDraft").get(exam.id)).application).toBe(
      '{"q":"My answer"}',
    );
    expect((await exportPhone(db)).data.masteryProgress).toEqual(
      before.data.masteryProgress,
    );
    expect((await mergeStudyPackage(db, file)).added).toBe(0);
  } finally {
    await db.delete();
  }
});
it("rolls back incoming records with missing module references", async () => {
  const db = createPhoneStore(`merge-${crypto.randomUUID()}`);
  try {
    await phoneApi(db)("state");
    const incoming = await exportPhone(db);
    incoming.data.note.push({
      id: "bad",
      moduleId: "missing",
      origin: "AI-generated draft",
      title: "Broken",
    });
    const file = await makePackage(db, incoming);
    await expect(mergeStudyPackage(db, file)).rejects.toThrow("missing module");
    expect(await db.table("note").get("bad")).toBeUndefined();
  } finally {
    await db.delete();
  }
});
