import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import guides from "../src/content/reading-guides.json";
import catalog from "../src/content/shared-study.json";
import { createPhoneStore, phoneApi } from "../mobile/store";
import { courseName, moduleName, cleanLabel } from "../src/lib/display";
it("maps every assignment and distinguishes missing and supplemental readings", () => {
  expect(guides.assignments).toHaveLength(45);
  expect(new Set(guides.assignments.map((a) => a.moduleId)).size).toBe(45);
  expect(guides.guides).toHaveLength(47);
  expect(catalog.cases).toHaveLength(56);
  for (const g of guides.guides) {
    expect(g.references.length).toBeGreaterThan(0);
    expect(g.sections.length).toBeGreaterThanOrEqual(3);
    expect(
      g.sections
        .map((s) => s.body)
        .join(" ")
        .split(/\s+/).length,
    ).toBeGreaterThan(150);
  }
  expect(
    guides.assignments.find((a) => a.moduleId === "CL650-M04")!.status,
  ).toBe("Partial primary reading available");
  expect(
    guides.guides.find((g) => g.moduleId === "CL685-M01")!.scope,
  ).toContain("not the assigned");
  expect(
    guides.assignments.find((a) => a.moduleId === "CL700-M14")!.status,
  ).toBe("No assigned reading");
  expect(cleanLabel("CL700-M12 · CL700")).toBe(
    "Module 12 · Business Organizations",
  );
  expect(courseName("CL685")).toBe("Criminal Procedure");
  expect(moduleName("CL650-M03")).toBe("Module 3");
});
it("adds substantial reading notes and cases without replacing an earlier edited note or exam response", async () => {
  const db = createPhoneStore(`reading-${crypto.randomUUID()}`);
  try {
    const api = phoneApi(db);
    await api("state");
    const old = await db
      .table("note")
      .filter((n) => n.origin === "Shared study draft")
      .first();
    await db.table("note").update(old.id, { body: "My edited earlier note" });
    await db
      .table("note")
      .filter((n) => n.kind === "Detailed reading notes")
      .delete();
    await db
      .table("caseBrief")
      .filter((c) => c.id.startsWith("study-case-reading-"))
      .delete();
    await db.table("meta").delete("shared-study-v4");
    await db.table("meta").put({ id: "shared-study-v1", value: true });
    const state = await api("state");
    expect(
      await db
        .table("note")
        .filter((n) => n.kind === "Detailed reading notes")
        .count(),
    ).toBe(47);
    expect((await db.table("note").get(old.id)).body).toBe(
      "My edited earlier note",
    );
    const cases = state.courses
      .flatMap((c: any) => c.modules.flatMap((m: any) => m.cases))
      .filter((c: any) => c.holding);
    expect(cases).toHaveLength(56);
    expect(
      await db
        .table("note")
        .filter((n) => n.kind === "assigned reading")
        .count(),
    ).toBe(45);
    await api("state");
    expect(
      await db
        .table("note")
        .filter((n) => n.kind === "Detailed reading notes")
        .count(),
    ).toBe(47);
  } finally {
    await db.delete();
  }
});

it("normalizes legacy display text while preserving record identifiers and stored values", async () => {
  const { displayState } = await import("../src/lib/display");
  const raw = {
    id: "CL700-M01",
    courseId: "CL700",
    moduleId: "CL700-M01",
    title: "CL700 notes",
    body: "CL 700 and cl-685 reading",
    source: { filename: "CL700.txt", section: "CL650 Module 2" },
  };
  const shown = displayState(raw);
  expect(shown.title).toBe("Business Organizations notes");
  expect(shown.body).toBe(
    "Business Organizations and Criminal Procedure reading",
  );
  expect(shown.source.section).toBe("Constitutional Law Module 2");
  expect(shown.id).toBe(raw.id);
  expect(shown.courseId).toBe(raw.courseId);
  expect(shown.source.filename).toBe(raw.source.filename);
  expect(raw.title).toBe("CL700 notes");
});

it("preserves saved exam lookup titles and question IDs in the display copy", async () => {
  const { displayState } = await import("../src/lib/display");
  const exam = {
    id: "saved",
    title: "Mini module exam: CL700-M01",
    rule: '["study-card-CL700-M01"]',
    application: '{"study-card-CL700-M01":"Answer"}',
    checklist: "[]",
  };
  expect(displayState({ drafts: [exam] }).drafts[0]).toEqual(exam);
});

it("includes optional assignments and explicitly authored questions with sourced answers", () => {
  expect(
    guides.assignments.filter((a) => a.optionalReadings.length).length,
  ).toBe(10);
  expect(
    guides.assignments
      .find((a) => a.moduleId === "CL650-M05")!
      .optionalReadings.join(" "),
  ).toContain("Alden");
  const questions = guides.guides.flatMap((g) => g.examQuestions);
  expect(questions).toHaveLength(100);
  for (const q of questions) {
    expect(q.question.length).toBeGreaterThan(30);
    expect(q.answer.length).toBeGreaterThan(40);
    expect(q.explanation.length).toBeGreaterThan(20);
  }
  expect(
    catalog.cases.filter((c) => c.scope.startsWith("Optional reading")),
  ).toHaveLength(5);
});
