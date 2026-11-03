import { z } from "zod";
import { mcqSchema } from "./study";
import type { PrismaClient } from "@prisma/client";
export const tables = [
  "course",
  "module",
  "source",
  "sourceExcerpt",
  "topic",
  "rule",
  "caseBrief",
  "flashcard",
  "mCQ",
  "essayPrompt",
  "note",
  "essayDraft",
  "quizAttempt",
  "flashcardReview",
  "studySession",
  "masteryProgress",
  "preference",
] as const;
const scalar = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
export const backupSchema = z.object({
  version: z.literal(1),
  data: z.object(
    Object.fromEntries(
      tables.map((t) => [t, z.array(z.record(z.string(), scalar)).max(100000)]),
    ) as Record<
      (typeof tables)[number],
      z.ZodArray<z.ZodRecord<z.ZodString, typeof scalar>>
    >,
  ),
});
// All imported database rows pass Prisma's model validation inside an atomic transaction.
export async function backup(db: PrismaClient) {
  const data: Record<string, unknown> = {};
  for (const t of tables)
    data[t] = await (
      db[t] as unknown as { findMany: () => Promise<unknown> }
    ).findMany();
  return JSON.parse(JSON.stringify({ version: 1, data }));
}
export function validateBackup(input: unknown) {
  const parsed = backupSchema.parse(input);
  for (const source of parsed.data.source) {
    if (
      typeof source.filename !== "string" ||
      source.filename.includes("/") ||
      source.filename.includes("\\") ||
      source.filename === ".." ||
      typeof source.hash !== "string" ||
      !/^[a-f0-9]{64}$/.test(source.hash)
    )
      throw new Error("Backup contains unsafe source metadata");
  }
  for (const question of parsed.data.mCQ) {
    const options = z
      .array(z.string())
      .parse(JSON.parse(z.string().parse(question.options)));
    const explanations = z
      .array(z.string())
      .parse(JSON.parse(z.string().parse(question.explanations)));
    if (question.status === "verified")
      mcqSchema.parse({ options, explanations, correct: question.correct });
  }
  for (const draft of parsed.data.essayDraft)
    z.array(z.number().int().min(0).max(3)).parse(
      JSON.parse(z.string().parse(draft.checklist)),
    );
  for (const card of parsed.data.flashcard)
    if (card.status === "verified") z.string().trim().min(1).parse(card.answer);
  for (const excerpt of parsed.data.sourceExcerpt)
    z.number().int().min(0).parse(excerpt.page);
  return parsed;
}
export async function restore(db: PrismaClient, input: unknown) {
  const parsed = validateBackup(input);
  await db.$transaction(
    async (tx) => {
      for (const t of [...tables].reverse())
        await (
          tx[t] as unknown as { deleteMany: () => Promise<unknown> }
        ).deleteMany();
      for (const t of tables)
        for (const row of parsed.data[t])
          await (
            tx[t] as unknown as {
              create: (arg: { data: unknown }) => Promise<unknown>;
            }
          ).create({ data: row });
    },
    { timeout: 60000 },
  );
}
