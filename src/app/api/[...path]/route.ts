import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aiSaveSchema, buildAIStudyRows } from "@/lib/ai-study";
import { z } from "zod";
import {
  fieldsByKind,
  grade,
  itemSchema,
  mcqSchema,
  schedule,
} from "@/lib/study";
import { backup, restore, tables } from "@/lib/backup";
import {
  extract,
  fileHash,
  safeName,
  sourceMetadata,
  MAX_UPLOAD,
} from "@/lib/import";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { originalsDirectory } from "@/lib/storage";
export const runtime = "nodejs";
const json = (value: unknown, status = 200) =>
  NextResponse.json(value, { status });
const model = (kind: string) =>
  db[kind as "note"] as unknown as {
    upsert: (arg: unknown) => Promise<unknown>;
  };
function local(req: NextRequest) {
  const host = new URL(`http://${req.headers.get("host") || "invalid"}`)
    .hostname;
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host))
    throw new Error("This private app accepts loopback hosts only");
}
function protect(req: NextRequest) {
  local(req);
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host"))
    throw new Error("Cross-origin mutations are not allowed");
}
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    local(req);
    const { path } = await params;
    if (path[0] === "state") {
      const courses = await db.course.findMany({
        orderBy: { id: "asc" },
        include: {
          sources: {
            include: {
              excerpts: {
                orderBy: [{ page: "asc" }, { createdAt: "asc" }, { id: "asc" }],
                select: {
                  id: true,
                  page: true,
                  section: true,
                  locatorVerified: true,
                },
              },
            },
          },
          modules: {
            orderBy: { number: "asc" },
            include: {
              topics: true,
              cases: true,
              flashcards: true,
              notes: true,
              rules: true,
              mcqs: true,
              essays: true,
              drafts: true,
              sources: {
                include: {
                  excerpts: {
                    orderBy: [
                      { page: "asc" },
                      { createdAt: "asc" },
                      { id: "asc" },
                    ],
                    select: {
                      id: true,
                      page: true,
                      section: true,
                      locatorVerified: true,
                    },
                  },
                },
              },
              mastery: true,
            },
          },
        },
      });
      // Answer keys and explanations stay server-side until an attempt is submitted.
      return json({
        courses: courses.map((c) => ({
          ...c,
          modules: c.modules.map((m) => ({
            ...m,
            mcqs: m.mcqs.map(({ correct, explanations, ...q }) => ({
              ...q,
              practiceReady:
                correct !== null &&
                JSON.parse(q.options).length === 4 &&
                JSON.parse(explanations).length === 4,
              gradable:
                q.status === "verified" &&
                correct !== null &&
                JSON.parse(q.options).length === 4 &&
                JSON.parse(explanations).length === 4,
            })),
          })),
        })),
        sessions: await db.studySession.findMany({
          orderBy: { createdAt: "desc" },
          take: 30,
        }),
        attempts: await db.quizAttempt.findMany(),
        reviews: await db.flashcardReview.findMany(),
        preferences: await db.preference.findUnique({ where: { id: "local" } }),
      });
    }
    if (path[0] === "source") {
      const id = z.string().min(1).parse(req.nextUrl.searchParams.get("id"));
      const index = Math.max(
        0,
        Number(req.nextUrl.searchParams.get("index") || 0),
      );
      const excerpts = await db.sourceExcerpt.findMany({
        where: { sourceId: id },
        orderBy: { createdAt: "asc" },
        skip: index,
        take: 1,
      });
      return json(excerpts[0] ?? null);
    }
    if (path[0] === "excerpt") {
      return json(
        await db.sourceExcerpt.findUnique({
          where: { id: z.string().parse(req.nextUrl.searchParams.get("id")) },
        }),
      );
    }
    if (path[0] === "export") return json(await backup(db));
    if (path[0] === "item") {
      const kind = z
        .enum(["note", "rule", "caseBrief", "flashcard", "mCQ", "essayPrompt"])
        .parse(req.nextUrl.searchParams.get("kind"));
      const id = z.string().parse(req.nextUrl.searchParams.get("id"));
      // Explicit editorial endpoint; study mode never requests the answer-key editor.
      return json(
        await (
          db[kind] as unknown as {
            findUnique: (arg: unknown) => Promise<unknown>;
          }
        ).findUnique({ where: { id } }),
      );
    }
    return json({ error: "Not found" }, 404);
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : "Request failed" },
      400,
    );
  }
}
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    protect(req);
    const { path } = await params;
    if (path[0] === "import") {
      const length = Number(req.headers.get("content-length") || 0);
      if (length > MAX_UPLOAD + 65536)
        return json({ error: "Upload exceeds 20 MiB" }, 413);
      const form = await req.formData(),
        file = form.get("file");
      if (!(file instanceof File)) throw new Error("Choose a file");
      if (file.size > MAX_UPLOAD)
        return json({ error: "Upload exceeds 20 MiB" }, 413);
      const meta = sourceMetadata.parse(
        Object.fromEntries(
          [
            "moduleId",
            "courseId",
            "title",
            "author",
            "edition",
            "type",
            "rights",
          ].map((k) => [k, form.get(k) ?? ""]),
        ),
      );
      const mapping = meta.moduleId
        ? await db.module.findUniqueOrThrow({ where: { id: meta.moduleId } })
        : null;
      if (mapping && mapping.courseId !== meta.courseId)
        throw new Error("Course and module do not match");
      const buffer = Buffer.from(await file.arrayBuffer()),
        hash = fileHash(buffer);
      const existing = await db.source.findUnique({ where: { hash } });
      if (existing)
        return json(
          {
            error:
              "This exact file is already imported. The original was kept; review it in Sources.",
            sourceId: existing.id,
          },
          409,
        );
      const parsed = await extract(file.name, file.type, buffer);
      const dir = originalsDirectory;
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const filename = `${hash}-${safeName(file.name)}`;
      try {
        await writeFile(join(dir, filename), buffer, {
          mode: 0o600,
          flag: "wx",
        });
      } catch (e) {
        if (
          (e as NodeJS.ErrnoException).code !== "EEXIST" ||
          fileHash(await readFile(join(dir, filename))) !== hash
        )
          throw e;
      }
      const source = await db.source.create({
        data: {
          ...meta,
          hash,
          filename,
          mime: file.type,
          status: parsed.status,
          excerpts: { create: parsed.pages },
        },
      });
      return json(source, 201);
    }
    const body = await req.json();
    if (path[0] === "ai-study") {
      const input = aiSaveSchema.parse(body);
      const parent = await db.sourceExcerpt.findUniqueOrThrow({
        where: { id: input.excerptId },
        include: { source: true },
      });
      const module = await db.module.findUniqueOrThrow({
        where: { id: input.moduleId },
      });
      if (
        parent.source.courseId !== module.courseId ||
        (parent.source.moduleId && parent.source.moduleId !== module.id)
      )
        throw new Error("Source and destination module do not match");
      const result = buildAIStudyRows(input, parent);
      await db.$transaction(async (tx) => {
        await tx.sourceExcerpt.create({ data: result.excerpt });
        await tx.note.create({ data: result.note });
        await tx.flashcard.createMany({ data: result.cards });
      });
      return json({ notes: 1, questions: result.cards.length }, 201);
    }
    if (path[0] === "select-excerpt") {
      const v = z
        .object({ id: z.string(), text: z.string().min(1).max(12000) })
        .parse(body);
      const original = await db.sourceExcerpt.findUniqueOrThrow({
        where: { id: v.id },
      });
      const offset = original.text.indexOf(v.text);
      if (offset < 0)
        throw new Error("Selected passage must match extracted text exactly");
      return json(
        await db.sourceExcerpt.create({
          data: {
            sourceId: original.sourceId,
            page: original.page,
            section: `${original.section} · characters ${offset + 1}–${offset + v.text.length}`,
            locatorVerified: original.locatorVerified,
            text: v.text,
          },
        }),
      );
    }
    if (path[0] === "locator") {
      const v = z
        .object({ id: z.string(), section: z.string().trim().min(1).max(500) })
        .parse(body);
      return json(
        await db.sourceExcerpt.update({
          where: { id: v.id },
          data: { section: v.section, locatorVerified: true },
        }),
      );
    }
    if (path[0] === "item") {
      const value = itemSchema.parse(body);
      const fields: Record<string, unknown> = {};
      for (const key of fieldsByKind[value.kind])
        if (key in value.fields) fields[key] = value.fields[key];
      for (const [key, v] of Object.entries(fields)) {
        if (key === "correct") {
          if (v !== null) z.number().int().min(0).max(3).parse(v);
        } else z.string().max(100000).nullable().parse(v);
      }
      if (value.kind === "mCQ") {
        for (const key of ["options", "explanations"])
          if (typeof fields[key] === "string")
            z.array(z.string())
              .length(4)
              .parse(JSON.parse(fields[key] as string));
        if (value.status === "verified")
          mcqSchema.parse({
            options: JSON.parse(String(fields.options)),
            correct: fields.correct,
            explanations: JSON.parse(String(fields.explanations)),
          });
      }
      if (
        value.kind === "flashcard" &&
        value.status === "verified" &&
        !String(fields.answer ?? "").trim()
      )
        throw new Error("A verified flashcard needs an answer");
      if (value.excerptId) {
        const excerpt = await db.sourceExcerpt.findUnique({
          where: { id: value.excerptId },
          include: { source: true },
        });
        const targetModule = await db.module.findUnique({
          where: { id: value.moduleId },
        });
        if (
          !excerpt ||
          !targetModule ||
          excerpt.source.courseId !== targetModule.courseId ||
          (excerpt.source.moduleId &&
            excerpt.source.moduleId !== value.moduleId)
        )
          throw new Error("Source excerpt must belong to this module");
        if (
          excerpt.page === 0 &&
          !excerpt.locatorVerified &&
          value.status === "verified"
        )
          throw new Error(
            "Original location is unverified. Keep this item in needs_review until its location is verified.",
          );
      }
      const data = {
        title: value.title,
        moduleId: value.moduleId,
        body: value.body ?? null,
        status: value.status,
        excerptId: value.excerptId ?? null,
        origin: value.excerptId ? "sourced" : "user-written",
        ...fields,
      };
      return json(
        await model(value.kind).upsert({
          where: { id: value.id ?? "__new__" },
          update: data,
          create: data,
        }),
      );
    }
    if (path[0] === "review") {
      const v = z
        .object({
          id: z.string(),
          rating: z.number().int().min(0).max(3),
          allowDrafts: z.boolean().default(false),
        })
        .parse(body);
      return json(
        await db.$transaction(async (tx) => {
          const c = await tx.flashcard.findUniqueOrThrow({
            where: { id: v.id },
          });
          if (
            !c.answer ||
            (c.status !== "verified" &&
              !(v.allowDrafts && c.status === "needs_review" && c.excerptId))
          )
            throw new Error("Only answered, verified cards can be studied");
          const next = schedule(c, v.rating);
          await tx.flashcard.update({ where: { id: c.id }, data: next });
          await tx.flashcardReview.create({
            data: {
              flashcardId: c.id,
              rating: v.rating,
              interval: next.interval,
            },
          });
          await tx.studySession.create({
            data: { moduleId: c.moduleId, kind: "flashcard" },
          });
          return next;
        }),
      );
    }
    if (path[0] === "quiz") {
      const v = z
        .object({
          id: z.string(),
          selected: z.number().int().min(0).max(3),
          allowDraft: z.boolean().default(false),
        })
        .parse(body);
      const q = await db.mCQ.findUniqueOrThrow({ where: { id: v.id } }),
        result = grade(q, v.selected, v.allowDraft);
      await db.$transaction([
        db.quizAttempt.create({
          data: {
            mcqId: q.id,
            selected: v.selected,
            keyStatus: result.keyStatus,
            correct: result.correct,
          },
        }),
        db.studySession.create({
          data: { moduleId: q.moduleId, kind: "quiz" },
        }),
      ]);
      return json(result);
    }
    if (path[0] === "essay") {
      const v = z
        .object({
          id: z.string().optional(),
          moduleId: z.string(),
          title: z.string().min(1),
          promptId: z.string().nullable().optional(),
          submittedAt: z.string().datetime().nullable().optional(),
          issue: z.string(),
          rule: z.string(),
          application: z.string(),
          conclusion: z.string(),
          assessment: z.string(),
          checklist: z.string(),
          seconds: z.number().int().min(0),
        })
        .parse(body);
      if (v.promptId) {
        const prompt = await db.essayPrompt.findUnique({
          where: { id: v.promptId },
        });
        if (!prompt || prompt.moduleId !== v.moduleId)
          throw new Error("Essay prompt and module do not match");
      }
      if (
        v.submittedAt &&
        (!v.promptId ||
          [v.issue, v.rule, v.application, v.conclusion].some((s) => !s.trim()))
      )
        throw new Error("Complete all four IRAC sections before submission");
      const { id, ...data } = v;
      return json(
        await db.essayDraft.upsert({
          where: { id: id ?? "__new__" },
          create: { ...data, ...(id ? { id } : {}) },
          update: data,
        }),
      );
    }
    if (path[0] === "progress") {
      const v = z
        .object({
          moduleId: z.string(),
          completed: z.boolean(),
          mastery: z.number().int().min(0).max(100),
        })
        .parse(body);
      return json(
        await db.masteryProgress.upsert({
          where: { moduleId: v.moduleId },
          create: v,
          update: v,
        }),
      );
    }
    if (path[0] === "preferences") {
      const v = z
        .object({
          theme: z.enum(["light", "dark"]),
          dailyGoal: z.number().int().min(1).max(500),
        })
        .parse(body);
      return json(
        await db.preference.upsert({
          where: { id: "local" },
          create: { id: "local", ...v },
          update: v,
        }),
      );
    }
    if (path[0] === "restore") {
      if (body.confirm !== "RESTORE")
        throw new Error("Type RESTORE to confirm replacement");
      await restore(db, body.backup);
      return json({ ok: true });
    }
    if (path[0] === "delete") {
      if (body.confirm !== "DELETE") throw new Error("Type DELETE to confirm");
      await db.$transaction(async (tx) => {
        for (const t of [...tables].reverse())
          await (
            tx[t] as unknown as { deleteMany: () => Promise<unknown> }
          ).deleteMany();
      });
      await rm(originalsDirectory, {
        recursive: true,
        force: true,
      });
      return json({ ok: true });
    }
    return json({ error: "Not found" }, 404);
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : "Request failed" },
      400,
    );
  }
}
