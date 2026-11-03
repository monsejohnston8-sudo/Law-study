import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import guides from "../src/content/reading-guides.json";
import catalog from "../src/content/shared-study.json";
import { createPhoneStore, phoneApi } from "../mobile/store";
import { courseName, moduleName, cleanLabel } from "../src/lib/display";
it("maps every assignment and distinguishes missing and supplemental readings", () => {
  expect(guides.assignments).toHaveLength(45);
  expect(new Set(guides.assignments.map((a) => a.moduleId)).size).toBe(45);
  expect(guides.guides).toHaveLength(31);
  expect(catalog.cases).toHaveLength(36);
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
  ).toBe("Assigned source text missing");
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
    await db.table("meta").delete("shared-study-v2");
    await db.table("meta").put({ id: "shared-study-v1", value: true });
    const state = await api("state");
    expect(
      await db
        .table("note")
        .filter((n) => n.kind === "Detailed reading notes")
        .count(),
    ).toBe(31);
    expect((await db.table("note").get(old.id)).body).toBe(
      "My edited earlier note",
    );
    const cases = state.courses
      .flatMap((c: any) => c.modules.flatMap((m: any) => m.cases))
      .filter((c: any) => c.holding);
    expect(cases).toHaveLength(36);
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
    ).toBe(31);
  } finally {
    await db.delete();
  }
});
