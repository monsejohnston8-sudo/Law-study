import Dexie from "dexie";
import { z } from "zod";
import { tables, validateBackup } from "../src/lib/backup";
import {
  fieldsByKind,
  itemSchema,
  mcqSchema,
  grade,
  schedule,
} from "../src/lib/study";
import cl650 from "../curriculum/CL650.json";
import cl685 from "../curriculum/CL685.json";
import cl700 from "../curriculum/CL700.json";
export type Row = Record<string, any> & { id: string };
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
export function createPhoneStore(name = "Casebook-iPhone") {
  const db = new Dexie(name);
  const stores: Record<string, string> = Object.fromEntries(
    tables.map((t) => [t, "id"]),
  );
  Object.assign(stores, {
    module: "id,courseId",
    source: "id,courseId,moduleId,&hash",
    sourceExcerpt: "id,sourceId",
    excerptMeta: "id,sourceId",
    original: "id",
    meta: "id",
    topic: "id,moduleId",
    rule: "id,moduleId",
    caseBrief: "id,moduleId",
    flashcard: "id,moduleId,due",
    mCQ: "id,moduleId",
    essayPrompt: "id,moduleId",
    note: "id,moduleId",
    essayDraft: "id,moduleId",
    masteryProgress: "id,&moduleId",
  });
  db.version(1).stores(stores);
  return db;
}
const rows = (db: Dexie, t: string) => db.table<Row, string>(t);
function metadata(row: Row) {
  const { text, ...meta } = row;
  return meta as Row;
}
export async function seedPhone(db: Dexie) {
  await db.transaction("rw", db.tables, async () => {
    if (await rows(db, "meta").get("initialized")) return;
    const stamp = now();
    for (const c of [cl650, cl685, cl700] as any[]) {
      await rows(db, "course").put({
        id: c.course_code,
        title: c.course_title,
        createdAt: stamp,
        updatedAt: stamp,
      });
      for (const m of c.modules) {
        await rows(db, "module").put({
          id: m.id,
          courseId: c.course_code,
          number: m.number,
          title: m.title,
          coverage: m.coverage,
        });
        for (const [i, t] of m.topics.entries())
          await rows(db, "topic").put({
            id: `${m.id}-topic-${i}`,
            moduleId: m.id,
            name: t.name,
            rule: t.rule,
            createdAt: stamp,
            updatedAt: stamp,
          });
        for (const [i, c] of m.cases.entries())
          await rows(db, "caseBrief").put(
            itemDefaults("caseBrief", {
              id: `${m.id}-case-${i}`,
              moduleId: m.id,
              title: c.name,
              body: c.brief,
              status: "missing",
              origin: "curriculum",
            }),
          );
        for (const [i, f] of m.flashcards.entries())
          await rows(db, "flashcard").put(
            itemDefaults("flashcard", {
              id: `${m.id}-card-${i}`,
              moduleId: m.id,
              title: f.question,
              answer: f.answer,
              status: "missing",
              origin: "curriculum",
            }),
          );
      }
    }
    await rows(db, "meta").put({ id: "initialized", value: true });
  });
}
function itemDefaults(kind: string, value: Record<string, any>): Row {
  const fields: Record<string, any> = {};
  for (const key of fieldsByKind[kind as keyof typeof fieldsByKind])
    fields[key] = "";
  if (kind === "flashcard")
    Object.assign(fields, {
      answer: null,
      interval: 0,
      ease: 2.5,
      repetitions: 0,
      due: now(),
    });
  if (kind === "mCQ")
    Object.assign(fields, {
      options: "[]",
      correct: null,
      explanations: "[]",
      topic: "",
      difficulty: "medium",
    });
  if (kind === "essayPrompt")
    Object.assign(fields, { modelAnswer: null, difficulty: "medium" });
  if (kind === "note") fields.kind = "notes";
  return {
    id: id(),
    body: null,
    status: "needs_review",
    origin: "user-written",
    excerptId: null,
    createdAt: now(),
    updatedAt: now(),
    ...fields,
    ...value,
  };
}
function validateRelations(data: ReturnType<typeof validateBackup>["data"]) {
  const sets = Object.fromEntries(
    tables.map((t) => [t, new Set(data[t].map((r) => r.id))]),
  );
  const foreign = (table: string, value: unknown) => {
    if (typeof value !== "string" || !sets[table].has(value as any))
      throw new Error(`Backup has a missing ${table} reference`);
  };
  for (const r of data.module) foreign("course", r.courseId);
  for (const r of data.source) {
    foreign("course", r.courseId);
    if (r.moduleId) foreign("module", r.moduleId);
  }
  for (const r of data.sourceExcerpt) foreign("source", r.sourceId);
  for (const table of [
    "topic",
    "rule",
    "caseBrief",
    "flashcard",
    "mCQ",
    "essayPrompt",
    "note",
    "essayDraft",
    "studySession",
    "masteryProgress",
  ] as const)
    for (const r of data[table]) {
      foreign("module", r.moduleId);
      if (r.excerptId) foreign("sourceExcerpt", r.excerptId);
    }
  for (const r of data.quizAttempt) foreign("mCQ", r.mcqId);
  for (const r of data.flashcardReview) foreign("flashcard", r.flashcardId);
  for (const t of tables)
    if (sets[t].size !== data[t].length)
      throw new Error(`Duplicate ${t} IDs in backup`);
}
export async function exportPhone(db: Dexie) {
  const data: Record<string, Row[]> = {};
  for (const t of tables) data[t] = await rows(db, t).toArray();
  return { version: 1, data };
}
export async function restorePhone(
  db: Dexie,
  input: unknown,
  originals?: { id: string; blob: Blob }[],
) {
  const parsed = validateBackup(input);
  validateRelations(parsed.data);
  await db.transaction("rw", db.tables, async () => {
    for (const t of tables) {
      await rows(db, t).clear();
      if (parsed.data[t].length)
        await rows(db, t).bulkPut(parsed.data[t] as Row[]);
    }
    await rows(db, "excerptMeta").clear();
    if (parsed.data.sourceExcerpt.length)
      await rows(db, "excerptMeta").bulkPut(
        parsed.data.sourceExcerpt.map((r) => metadata(r as Row)),
      );
    if (originals) {
      await rows(db, "original").clear();
      await db.table("original").bulkPut(originals);
    }
    await rows(db, "meta").put({ id: "initialized", value: true });
  });
}
export function phoneApi(db: Dexie) {
  return async (path: string, body?: any): Promise<any> => {
    await seedPhone(db);
    const [route, search = ""] = path.split("?"),
      params = new URLSearchParams(search);
    if (body === undefined) {
      if (route === "export") return exportPhone(db);
      if (route === "excerpt")
        return await rows(db, "sourceExcerpt").get(params.get("id")!);
      if (route === "source") {
        const meta = await rows(db, "excerptMeta")
          .where("sourceId")
          .equals(params.get("id")!)
          .toArray();
        return await rows(db, "sourceExcerpt").get(
          meta[Number(params.get("index") || 0)]?.id,
        );
      }
      if (route === "item") {
        const kind = z
          .enum([
            "note",
            "rule",
            "caseBrief",
            "flashcard",
            "mCQ",
            "essayPrompt",
          ])
          .parse(params.get("kind"));
        return rows(db, kind).get(params.get("id")!);
      }
      if (route === "state") {
        const data: Record<string, Row[]> = {};
        for (const t of tables)
          if (t !== "sourceExcerpt") data[t] = await rows(db, t).toArray();
        const excerpts = await rows(db, "excerptMeta").toArray();
        const sources: Row[] = data.source.map((s) => ({
          ...s,
          excerpts: excerpts
            .filter((e) => e.sourceId === s.id)
            .sort(
              (a, b) =>
                a.page - b.page ||
                String(a.section).localeCompare(String(b.section), undefined, {
                  numeric: true,
                }) ||
                String(a.createdAt).localeCompare(String(b.createdAt)) ||
                a.id.localeCompare(b.id),
            ),
        }));
        const modules: Row[] = data.module
          .sort((a, b) => a.number - b.number)
          .map((m) => ({
            ...m,
            topics: data.topic.filter((r) => r.moduleId === m.id),
            cases: data.caseBrief.filter((r) => r.moduleId === m.id),
            flashcards: data.flashcard.filter((r) => r.moduleId === m.id),
            notes: data.note.filter((r) => r.moduleId === m.id),
            rules: data.rule.filter((r) => r.moduleId === m.id),
            essays: data.essayPrompt.filter((r) => r.moduleId === m.id),
            drafts: data.essayDraft.filter((r) => r.moduleId === m.id),
            sources: sources.filter((r) => r.moduleId === m.id),
            mastery:
              data.masteryProgress.find((r) => r.moduleId === m.id) ?? null,
            mcqs: data.mCQ
              .filter((r) => r.moduleId === m.id)
              .map(({ correct, explanations, ...q }) => ({
                ...q,
                gradable:
                  q.status === "verified" &&
                  correct !== null &&
                  JSON.parse(q.options).length === 4 &&
                  JSON.parse(explanations).length === 4,
              })),
          }));
        return {
          courses: data.course
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((c) => ({
              ...c,
              modules: modules.filter((m) => m.courseId === c.id),
              sources: sources.filter((s) => s.courseId === c.id),
            })),
          sessions: data.studySession
            .sort((a, b) =>
              String(b.createdAt).localeCompare(String(a.createdAt)),
            )
            .slice(0, 30),
          attempts: data.quizAttempt,
          reviews: data.flashcardReview,
          preferences: data.preference.find((r) => r.id === "local") ?? null,
        };
      }
      throw new Error("Unknown local request");
    }
    if (route === "item") {
      const v = itemSchema.parse(body),
        module = await rows(db, "module").get(v.moduleId);
      if (!module) throw new Error("Module not found");
      const fields: Record<string, any> = {};
      for (const key of fieldsByKind[v.kind])
        if (key in v.fields) {
          const value = v.fields[key];
          if (key === "correct") {
            if (value !== null) z.number().int().min(0).max(3).parse(value);
          } else z.string().max(100000).nullable().parse(value);
          fields[key] = value;
        }
      if (v.kind === "mCQ") {
        for (const k of ["options", "explanations"])
          if (fields[k])
            z.array(z.string()).length(4).parse(JSON.parse(fields[k]));
        if (v.status === "verified")
          mcqSchema.parse({
            options: JSON.parse(fields.options),
            explanations: JSON.parse(fields.explanations),
            correct: fields.correct,
          });
      }
      if (v.kind === "flashcard" && v.status === "verified")
        z.string().trim().min(1).parse(fields.answer);
      if (v.excerptId) {
        const ex = await rows(db, "sourceExcerpt").get(v.excerptId);
        const s = ex ? await rows(db, "source").get(ex.sourceId) : null;
        if (
          !ex ||
          !s ||
          s.courseId !== module.courseId ||
          (s.moduleId && s.moduleId !== v.moduleId)
        )
          throw new Error(
            "Source excerpt must belong to this course and module",
          );
        if (!ex.page && !ex.locatorVerified && v.status === "verified")
          throw new Error(
            "Verify the chapter/section locator before verifying this item",
          );
      }
      const old = v.id ? await rows(db, v.kind).get(v.id) : undefined;
      const record = itemDefaults(v.kind, {
        ...old,
        ...(v.id ? { id: v.id } : {}),
        moduleId: v.moduleId,
        title: v.title,
        body: v.body ?? null,
        status: v.status,
        excerptId: v.excerptId ?? null,
        origin: v.excerptId ? "sourced" : "user-written",
        ...fields,
        updatedAt: now(),
      });
      await rows(db, v.kind).put(record);
      return record;
    }
    if (route === "locator") {
      const v = z
          .object({
            id: z.string(),
            section: z.string().trim().min(1).max(500),
          })
          .parse(body),
        old = await rows(db, "sourceExcerpt").get(v.id);
      if (!old) throw new Error("Excerpt not found");
      const record = {
        ...old,
        section: v.section,
        locatorVerified: true,
        updatedAt: now(),
      };
      await db.transaction(
        "rw",
        db.table("sourceExcerpt"),
        db.table("excerptMeta"),
        async () => {
          await rows(db, "sourceExcerpt").put(record);
          await rows(db, "excerptMeta").put(metadata(record));
        },
      );
      return record;
    }
    if (route === "select-excerpt") {
      const v = z
          .object({ id: z.string(), text: z.string().min(1).max(12000) })
          .parse(body),
        old = await rows(db, "sourceExcerpt").get(v.id);
      if (!old) throw new Error("Excerpt not found");
      const start = old.text.indexOf(v.text);
      if (start < 0)
        throw new Error("Selected passage must match extracted text exactly");
      const record = {
        ...old,
        id: id(),
        text: v.text,
        section: `${old.section} · characters ${start + 1}–${start + v.text.length}`,
        createdAt: now(),
        updatedAt: now(),
      };
      await db.transaction(
        "rw",
        db.table("sourceExcerpt"),
        db.table("excerptMeta"),
        async () => {
          await rows(db, "sourceExcerpt").put(record);
          await rows(db, "excerptMeta").put(metadata(record));
        },
      );
      return record;
    }
    if (route === "review") {
      const v = z
        .object({ id: z.string(), rating: z.number().int().min(0).max(3) })
        .parse(body);
      return db.transaction(
        "rw",
        db.table("flashcard"),
        db.table("flashcardReview"),
        db.table("studySession"),
        async () => {
          const card = await rows(db, "flashcard").get(v.id);
          if (!card || !card.answer || card.status !== "verified")
            throw new Error("Only answered verified cards can be studied");
          const next = schedule(card as any, v.rating);
          await rows(db, "flashcard").put({
            ...card,
            ...next,
            due: next.due.toISOString(),
            updatedAt: now(),
          });
          await rows(db, "flashcardReview").add({
            id: id(),
            flashcardId: v.id,
            rating: v.rating,
            interval: next.interval,
            createdAt: now(),
          });
          await rows(db, "studySession").add({
            id: id(),
            moduleId: card.moduleId,
            kind: "flashcard",
            seconds: 0,
            createdAt: now(),
          });
          return next;
        },
      );
    }
    if (route === "quiz") {
      const v = z
        .object({ id: z.string(), selected: z.number().int().min(0).max(3) })
        .parse(body);
      const q = await rows(db, "mCQ").get(v.id);
      if (!q) throw new Error("Question not found");
      const result = grade(q as any, v.selected);
      await db.transaction(
        "rw",
        db.table("quizAttempt"),
        db.table("studySession"),
        async () => {
          await rows(db, "quizAttempt").add({
            id: id(),
            mcqId: q.id,
            selected: v.selected,
            correct: result.correct,
            createdAt: now(),
          });
          await rows(db, "studySession").add({
            id: id(),
            moduleId: q.moduleId,
            kind: "quiz",
            seconds: 0,
            createdAt: now(),
          });
        },
      );
      return result;
    }
    if (route === "essay") {
      const v = z
        .object({
          id: z.string().optional(),
          moduleId: z.string(),
          title: z.string().min(1),
          issue: z.string(),
          rule: z.string(),
          application: z.string(),
          conclusion: z.string(),
          assessment: z.string(),
          checklist: z.string(),
          seconds: z.number().int().min(0),
        })
        .parse(body);
      if (!(await rows(db, "module").get(v.moduleId)))
        throw new Error("Module not found");
      z.array(z.number().int().min(0).max(3)).parse(JSON.parse(v.checklist));
      const old = v.id ? await rows(db, "essayDraft").get(v.id) : null;
      const record = {
        createdAt: old?.createdAt ?? now(),
        ...v,
        id: v.id ?? id(),
        updatedAt: now(),
      };
      await rows(db, "essayDraft").put(record);
      return record;
    }
    if (route === "progress") {
      const v = z
        .object({
          moduleId: z.string(),
          completed: z.boolean(),
          mastery: z.number().int().min(0).max(100),
        })
        .parse(body);
      if (!(await rows(db, "module").get(v.moduleId)))
        throw new Error("Module not found");
      const old = await rows(db, "masteryProgress")
        .where("moduleId")
        .equals(v.moduleId)
        .first();
      const record = { id: old?.id ?? id(), ...v, updatedAt: now() };
      await rows(db, "masteryProgress").put(record);
      return record;
    }
    if (route === "preferences") {
      const v = z
        .object({
          theme: z.enum(["light", "dark"]),
          dailyGoal: z.number().int().min(1).max(500),
        })
        .parse(body);
      const record = { id: "local", ...v };
      await rows(db, "preference").put(record);
      return record;
    }
    if (route === "restore") {
      if (body.confirm !== "RESTORE")
        throw new Error("Type RESTORE to confirm replacement");
      await restorePhone(db, body.backup);
      return { ok: true };
    }
    if (route === "delete") {
      if (body.confirm !== "DELETE") throw new Error("Type DELETE to confirm");
      await db.transaction("rw", db.tables, async () => {
        for (const t of db.tables) await t.clear();
        await rows(db, "meta").put({ id: "initialized", value: true });
      });
      return { ok: true };
    }
    if (route === "import") return importDocument(db, body as FormData);
    throw new Error("Unknown local request");
  };
}
export async function sha256(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes);
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", copy)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
async function importDocument(db: Dexie, form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("Choose a file");
  const v = z
    .object({
      courseId: z.string().min(1),
      moduleId: z.string().transform((s) => s || null),
      title: z.string().trim().min(1),
      author: z.string(),
      edition: z.string(),
      type: z.enum([
        "syllabus",
        "textbook excerpt",
        "case",
        "seminar",
        "notes",
        "quiz feedback",
      ]),
      rights: z.string().trim().min(1),
    })
    .parse(
      Object.fromEntries(
        [
          "courseId",
          "moduleId",
          "title",
          "author",
          "edition",
          "type",
          "rights",
        ].map((k) => [k, form.get(k) ?? ""]),
      ),
    );
  const course = await rows(db, "course").get(v.courseId),
    module = v.moduleId ? await rows(db, "module").get(v.moduleId) : null;
  if (!course || (v.moduleId && module?.courseId !== v.courseId))
    throw new Error("Course and module do not match");
  if (file.size > 20 * 1024 * 1024)
    throw new Error("File exceeds the 20 MiB limit");
  const bytes = new Uint8Array(await file.arrayBuffer()),
    hash = await sha256(bytes);
  if (await rows(db, "source").where("hash").equals(hash).first())
    throw new Error(
      "This exact file is already imported; the original was kept",
    );
  const { extractOnPhone } = await import("./extract");
  const parsed = await extractOnPhone(file);
  const filename = `${hash}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "source"}`;
  const source = {
    id: id(),
    ...v,
    hash,
    filename,
    mime: file.type,
    status: parsed.status,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.transaction(
    "rw",
    db.table("source"),
    db.table("sourceExcerpt"),
    db.table("excerptMeta"),
    db.table("original"),
    async () => {
      await rows(db, "source").add(source);
      for (const page of parsed.pages) {
        const ex = {
          id: id(),
          sourceId: source.id,
          ...page,
          locatorVerified: false,
          createdAt: now(),
          updatedAt: now(),
        };
        await rows(db, "sourceExcerpt").add(ex);
        await rows(db, "excerptMeta").add(metadata(ex));
      }
      await db.table("original").put({ id: filename, blob: file });
    },
  );
  return source;
}
