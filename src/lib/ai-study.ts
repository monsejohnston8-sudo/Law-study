import { z } from "zod";
const cited = z.object({
  excerptId: z.string().min(1),
  support: z.string().min(12).max(600),
});
export const aiStudySchema = z.object({
  title: z.string().trim().min(1).max(300),
  summary: z.string().trim().min(1).max(6000),
  notes: z
    .array(
      z.object({
        heading: z.string().min(1).max(300),
        explanation: z.string().min(1).max(6000),
        citation: cited,
      }),
    )
    .min(1)
    .max(12),
  questions: z
    .array(
      z.object({
        question: z.string().min(1).max(500),
        answer: z.string().min(1).max(2000),
        explanation: z.string().min(1).max(2000),
        citation: cited,
      }),
    )
    .min(1)
    .max(8),
  limitations: z.array(z.string().max(1000)).max(10),
});
export type AIStudyDraft = z.infer<typeof aiStudySchema>;
export type StudyInput = { id: string; text: string; locator: string };
export const aiSaveSchema = z.object({
  moduleId: z.string(),
  excerptId: z.string(),
  start: z.number().int().min(0),
  end: z.number().int().positive(),
  draft: aiStudySchema,
});
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
export function validateAIStudy(
  input: unknown,
  sources: StudyInput[],
): AIStudyDraft {
  const draft = aiStudySchema.parse(input);
  for (const item of [...draft.notes, ...draft.questions]) {
    const source = sources.find((s) => s.id === item.citation.excerptId);
    if (
      !source ||
      !normalize(source.text).includes(normalize(item.citation.support))
    )
      throw new Error(
        "AI returned a citation that does not match the selected text. Regenerate or use manual notes.",
      );
  }
  return draft;
}
// Quotes above are short private evidence checks, not published textbook passages.
export function buildAIStudyRows(
  input: z.infer<typeof aiSaveSchema>,
  parent: {
    id: string;
    text: string;
    sourceId: string;
    page: number;
    section: string;
    locatorVerified: boolean;
  },
) {
  if (
    input.end > parent.text.length ||
    input.start >= input.end ||
    input.end - input.start > 12000
  )
    throw new Error("Choose a source passage of at most 12,000 characters");
  const selected = parent.text.slice(input.start, input.end);
  const draft = validateAIStudy(input.draft, [
    { id: parent.id, text: selected, locator: parent.section },
  ]);
  const stamp = new Date().toISOString(),
    batch = crypto.randomUUID();
  const excerptId = `personal-ai-source-${batch}`;
  const excerpt = {
    id: excerptId,
    sourceId: parent.sourceId,
    page: parent.page,
    section: `${parent.section} · characters ${input.start + 1}–${input.end}`,
    locatorVerified: parent.locatorVerified,
    text: selected,
    createdAt: stamp,
    updatedAt: stamp,
  };
  const common = {
    moduleId: input.moduleId,
    status: "needs_review",
    origin: "AI-generated draft",
    excerptId,
    createdAt: stamp,
    updatedAt: stamp,
  };
  const note = {
    ...common,
    id: `personal-ai-note-${batch}`,
    title: draft.title,
    kind: "AI study notes",
    body: `${draft.summary}\n\n${draft.notes.map((n) => `${n.heading}\n${n.explanation}`).join("\n\n")}\n\nLimitations and gaps:\n${draft.limitations.join("\n") || "No additional gaps reported by the model; verify against your source."}\n\nAI-generated draft. Source: ${excerpt.section}`,
  };
  const cards = draft.questions.map((q, i) => ({
    ...common,
    id: `personal-ai-card-${batch}-${i}`,
    title: q.question,
    body: q.explanation,
    answer: q.answer,
    interval: 0,
    ease: 2.5,
    repetitions: 0,
    due: stamp,
  }));
  return { excerpt, note, cards };
}
