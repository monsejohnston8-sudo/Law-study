// Import privately curated, source-linked drafts without overwriting existing work.
import { readFile } from "node:fs/promises";
import { db } from "../src/lib/db";
import { z } from "zod";
const base = z.object({
  id: z.string().min(1),
  moduleId: z.string(),
  parentExcerptId: z.string(),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  locator: z.string().min(1),
  title: z.string().min(1),
  scope: z.string().min(1),
});
const schema = z.object({
  version: z.literal(1),
  entries: z.array(
    base.extend({
      summary: z.string().min(1),
      checklist: z.string(),
      question: z.string().min(1),
      answer: z.string().min(1),
    }),
  ),
  cases: z.array(
    base.extend({
      citation: z.string(),
      fields: z.object({
        facts: z.string(),
        posture: z.string(),
        issue: z.string(),
        holding: z.string(),
        reasoning: z.string(),
        rule: z.string(),
        significance: z.string(),
      }),
    }),
  ),
});
try {
  const input = schema.parse(
    JSON.parse(await readFile(process.argv[2], "utf8")),
  );
  await db.$transaction(
    async (tx) => {
      for (const entry of [...input.entries, ...input.cases]) {
        const parent = await tx.sourceExcerpt.findUniqueOrThrow({
          where: { id: entry.parentExcerptId },
        });
        await tx.module.findUniqueOrThrow({ where: { id: entry.moduleId } });
        if (entry.end <= entry.start || entry.start >= parent.text.length)
          throw new Error("Invalid source range");
        const excerptId = `study-source-${entry.id}`;
        const text = parent.text.slice(entry.start, entry.end);
        const existing = await tx.sourceExcerpt.findUnique({
          where: { id: excerptId },
        });
        if (existing && existing.text !== text)
          throw new Error("Previously imported excerpt differs");
        await tx.sourceExcerpt.upsert({
          where: { id: excerptId },
          update: {},
          create: {
            id: excerptId,
            sourceId: parent.sourceId,
            page: parent.page,
            section: entry.locator,
            locatorVerified: true,
            text,
          },
        });
        const common = {
          moduleId: entry.moduleId,
          title: entry.title,
          status: "needs_review",
          origin: "AI-generated draft",
          excerptId,
        };
        if ("summary" in entry) {
          await tx.rule.upsert({
            where: { id: `study-rule-${entry.id}` },
            update: {},
            create: {
              ...common,
              id: `study-rule-${entry.id}`,
              body: entry.summary,
              elements: entry.checklist,
              policy: entry.scope,
            },
          });
          await tx.note.upsert({
            where: { id: `study-note-${entry.id}` },
            update: {},
            create: {
              ...common,
              id: `study-note-${entry.id}`,
              kind: "Source study draft",
              body: `${entry.summary}\n\nExam checklist: ${entry.checklist}\n\nSource scope: ${entry.scope}\n\nDraft: check the linked original before relying on this summary.`,
            },
          });
          await tx.flashcard.upsert({
            where: { id: `study-card-${entry.id}` },
            update: {},
            create: {
              ...common,
              id: `study-card-${entry.id}`,
              title: entry.question,
              body: entry.scope,
              answer: entry.answer,
            },
          });
        } else {
          await tx.caseBrief.upsert({
            where: { id: `study-case-${entry.id}` },
            update: {},
            create: {
              ...common,
              id: `study-case-${entry.id}`,
              citation: entry.citation,
              body: entry.scope,
              ...entry.fields,
            },
          });
        }
      }
    },
    { timeout: 60000 },
  );
  console.log(
    JSON.stringify({
      sourceLinkedSummaries: input.entries.length,
      flashcards: input.entries.length,
      caseBriefs: input.cases.length,
      modules: new Set(
        [...input.entries, ...input.cases].map((e) => e.moduleId),
      ).size,
      status: "needs_review",
    }),
  );
} finally {
  await db.$disconnect();
}
