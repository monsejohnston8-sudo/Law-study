import type Dexie from "dexie";
import { courseName } from "../src/lib/display";
import catalog from "../src/content/shared-study.json";
import readings from "../src/content/reading-guides.json";
// This catalog contains original explanations, never extracted textbook text.
export async function seedSharedStudy(db: Dexie) {
  const revision = `shared-study-v${catalog.version}`;
  if (await db.table("meta").get(revision)) return;
  const stamp = new Date().toISOString();
  const prepared = await Promise.all(
    ["CL650", "CL685", "CL700"].map(async (courseId) => {
      const entries = catalog.entries.filter((e) =>
        e.moduleId.startsWith(courseId),
      );
      const cases = catalog.cases.filter((e) =>
        e.moduleId.startsWith(courseId),
      );
      const guides = readings.guides.filter((g) =>
        g.moduleId.startsWith(courseId),
      );
      const assignments = readings.assignments.filter((g) =>
        g.moduleId.startsWith(courseId),
      );
      const passages = [
        ...guides.map((g) => ({
          id: g.id,
          text: `${g.title}\n\n${g.sections.map((s) => `${s.heading}\n${s.body}`).join("\n\n")}\n\nReferences: ${g.references.join("; ")}\nSource scope: ${g.scope}`,
        })),
        ...assignments.map((a) => ({
          id: `reading-assignment-${a.moduleId}`,
          text: `Assigned reading list for ${a.title}\n\n${a.reading}\n\nAvailability: ${a.status}. A reading list is not proof of source completion.`,
        })),
        ...entries.map((e) => ({
          id: e.id,
          text: `${e.title}\n\n${e.summary}\n\nExam checklist: ${e.checklist}\n\nQuestion: ${e.question}\nAnswer: ${e.answer}\n\nReference: ${e.locator}\nScope: ${e.scope}`,
        })),
        ...cases.map((e) => ({
          id: e.id,
          text: `${e.title}\n${e.citation}\n\n${Object.entries(e.fields)
            .map(([k, v]) => `${k}: ${v}`)
            .join("\n\n")}\n\nReference: ${e.locator}\nScope: ${e.scope}`,
        })),
      ];
      const text = `Original shared study drafts — ${courseName(courseId)}\nNot a textbook or an extract from a textbook. Review against your assigned sources.\n\n${passages.map((p) => p.text).join("\n\n---\n\n")}`;
      const bytes = new TextEncoder().encode(text);
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      )
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
      return {
        courseId,
        entries,
        cases,
        guides,
        assignments,
        passages,
        text,
        hash,
      };
    }),
  );
  await db.transaction("rw", db.tables, async () => {
    if (await db.table("meta").get(revision)) return;
    for (const c of prepared) {
      if (!(await db.table("course").get(c.courseId))) continue;
      const sourceId = `shared-notes-${c.courseId}-v${catalog.version}`,
        filename = `${sourceId}.txt`;
      const source = {
        id: sourceId,
        courseId: c.courseId,
        moduleId: null,
        title: `Shared study notes — ${courseName(c.courseId)}`,
        author: "Law Study original study explanations",
        edition: `Study catalog ${catalog.version}`,
        hash: c.hash,
        type: "notes",
        rights:
          "Original concise study notes. Referenced textbooks are not included or redistributed.",
        filename,
        mime: "text/plain",
        status: "extracted",
        createdAt: stamp,
        updatedAt: stamp,
      };
      if (!(await db.table("source").get(sourceId)))
        await db.table("source").add(source);
      if (!(await db.table("original").get(filename)))
        await db.table("original").put({
          id: filename,
          blob: new Blob([c.text], { type: "text/plain" }),
        });
      for (const item of [
        ...c.guides.map((g) => ({
          id: g.id,
          moduleId: g.moduleId,
          title: g.title,
          kind: "Detailed reading notes",
          origin: "Reading guide draft",
          section: g.references.join("; "),
        })),
        ...c.assignments.map((a) => ({
          id: `reading-assignment-${a.moduleId}`,
          moduleId: a.moduleId,
          title: `Assigned readings — ${a.title}`,
          kind: "assigned reading",
          origin: "Reading assignment",
          section: `Supplied course outline: ${a.title}`,
        })),
      ]) {
        if (!(await db.table("module").get(item.moduleId))) continue;
        const passage = c.passages.find((p) => p.id === item.id)!;
        const excerptId = `shared-source-${item.id}`;
        const ex = {
          id: excerptId,
          sourceId,
          page: 0,
          section: item.section,
          locatorVerified: true,
          text: passage.text,
          createdAt: stamp,
          updatedAt: stamp,
        };
        if (!(await db.table("sourceExcerpt").get(excerptId))) {
          await db.table("sourceExcerpt").add(ex);
          const { text, ...meta } = ex;
          await db.table("excerptMeta").put(meta);
        }
        if (!(await db.table("note").get(item.id)))
          await db.table("note").add({
            id: item.id,
            moduleId: item.moduleId,
            title: item.title,
            kind: item.kind,
            origin: item.origin,
            status: "needs_review",
            excerptId,
            body: passage.text,
            createdAt: stamp,
            updatedAt: stamp,
          });
      }
      for (const guide of c.guides) {
        if (!(await db.table("module").get(guide.moduleId))) continue;
        for (const q of guide.examQuestions) {
          if (!(await db.table("flashcard").get(q.id)))
            await db
              .table("flashcard")
              .add({
                id: q.id,
                moduleId: guide.moduleId,
                title: q.question,
                body: q.explanation,
                answer: q.answer,
                status: "needs_review",
                origin: "Shared study draft",
                excerptId: `shared-source-${guide.id}`,
                interval: 0,
                ease: 2.5,
                repetitions: 0,
                due: stamp,
                createdAt: stamp,
                updatedAt: stamp,
              });
        }
      }
      for (const entry of [...c.entries, ...c.cases]) {
        if (!(await db.table("module").get(entry.moduleId))) continue;
        const excerptId = `shared-source-${entry.id}`;
        const ex = {
          id: excerptId,
          sourceId,
          page: 0,
          section: `Original study note: ${entry.title}. Reference: ${entry.locator}`,
          locatorVerified: true,
          text: c.passages.find((p) => p.id === entry.id)!.text,
          createdAt: stamp,
          updatedAt: stamp,
        };
        if (!(await db.table("sourceExcerpt").get(excerptId))) {
          await db.table("sourceExcerpt").add(ex);
          const { text, ...meta } = ex;
          await db.table("excerptMeta").put(meta);
        }
        const common = {
          moduleId: entry.moduleId,
          title: entry.title,
          body: entry.scope,
          status: "needs_review",
          origin: "Shared study draft",
          excerptId,
          createdAt: stamp,
          updatedAt: stamp,
        };
        const add = async (
          table: string,
          row: Record<string, unknown> & { id: string },
        ) => {
          if (!(await db.table(table).get(row.id)))
            await db.table(table).add(row);
        };
        if ("summary" in entry) {
          await add("rule", {
            ...common,
            id: `study-rule-${entry.id}`,
            body: entry.summary,
            jurisdiction: "",
            elements: entry.checklist,
            exceptions: "",
            standardOfReview: "",
            policy: entry.scope,
            examples: "",
            counterarguments: "",
          });
          await add("note", {
            ...common,
            id: `study-note-${entry.id}`,
            body: `${entry.summary}\n\nExam checklist: ${entry.checklist}\n\nReference: ${entry.locator}\nSource scope: ${entry.scope}`,
            kind: "Source study draft",
          });
          await add("flashcard", {
            ...common,
            id: `study-card-${entry.id}`,
            title: entry.question,
            body: `${entry.scope}\nReference: ${entry.locator}`,
            answer: entry.answer,
            interval: 0,
            ease: 2.5,
            repetitions: 0,
            due: stamp,
          });
        } else
          await add("caseBrief", {
            ...common,
            id: `study-case-${entry.id}`,
            citation: entry.citation,
            ...entry.fields,
            dissent: "",
          });
      }
    }
    await db.table("meta").put({ id: revision, value: true });
  });
}
