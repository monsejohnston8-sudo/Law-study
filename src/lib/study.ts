import { z } from "zod";
export const ratingSchema = z.number().int().min(0).max(3);
export function schedule(
  card: { interval: number; ease: number; repetitions: number },
  rating: number,
  now = new Date(),
) {
  ratingSchema.parse(rating);
  const quality = [1, 3, 4, 5][rating];
  const ease = Math.max(
    1.3,
    card.ease + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02),
  );
  const repetitions = rating === 0 ? 0 : card.repetitions + 1;
  const interval =
    rating === 0
      ? 1
      : repetitions === 1
        ? 1
        : repetitions === 2
          ? 6
          : Math.max(1, Math.round(card.interval * ease));
  return {
    ease,
    repetitions,
    interval,
    due: new Date(now.getTime() + interval * 86400000),
  };
}
export const mcqSchema = z.object({
  options: z.array(z.string().trim().min(1)).length(4),
  correct: z.number().int().min(0).max(3),
  explanations: z.array(z.string().trim().min(1)).length(4),
});
export function grade(
  q: {
    options: string;
    correct: number | null;
    explanations: string;
    status: string;
  },
  selected: number,
  allowDraft = false,
) {
  z.number().int().min(0).max(3).parse(selected);
  if (q.status !== "verified" && !(allowDraft && q.status === "needs_review"))
    throw new Error("Question must be verified before grading");
  const parsed = mcqSchema.parse({
    options: JSON.parse(q.options),
    correct: q.correct,
    explanations: JSON.parse(q.explanations),
  });
  return {
    correct: selected === parsed.correct,
    keyStatus: q.status,
    correctOption: parsed.correct,
    explanations: parsed.explanations,
  };
}
export function essayMarkdown(d: {
  title: string;
  issue: string;
  rule: string;
  application: string;
  conclusion: string;
  assessment: string;
}) {
  return `# ${d.title}\n\n## Issue\n${d.issue}\n\n## Rule\n${d.rule}\n\n## Application\n${d.application}\n\n## Conclusion\n${d.conclusion}\n\n## Self-assessment\n${d.assessment}\n`;
}
export const itemSchema = z.object({
  kind: z.enum([
    "note",
    "rule",
    "caseBrief",
    "flashcard",
    "mCQ",
    "essayPrompt",
  ]),
  id: z.string().optional(),
  moduleId: z.string(),
  title: z.string().trim().min(1).max(500),
  body: z.string().max(100000).nullable().optional(),
  status: z
    .enum(["needs_review", "verified", "missing"])
    .default("needs_review"),
  excerptId: z.string().nullable().optional(),
  fields: z.record(z.string(), z.unknown()).default({}),
});
export const fieldsByKind = {
  note: ["kind"],
  rule: [
    "jurisdiction",
    "elements",
    "exceptions",
    "standardOfReview",
    "policy",
    "examples",
    "counterarguments",
  ],
  caseBrief: [
    "citation",
    "facts",
    "posture",
    "issue",
    "holding",
    "reasoning",
    "rule",
    "dissent",
    "significance",
  ],
  flashcard: ["answer"],
  mCQ: ["options", "correct", "explanations", "topic", "difficulty"],
  essayPrompt: ["facts", "issueTags", "modelAnswer", "rubric", "difficulty"],
} as const;
