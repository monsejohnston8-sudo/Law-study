/** Optional provider contract. No provider or network transport is enabled. */
export interface DraftRequest {
  excerptId: string;
  locator: string;
  text: string;
  kind: "rule" | "flashcard" | "question";
}
export interface StudyDraft {
  title: string;
  body: string;
  excerptId: string;
  status: "needs_review";
  origin: "AI-generated draft";
}
export interface StudyDraftProvider {
  createDraft(request: DraftRequest): Promise<StudyDraft>;
}
export const configuredProvider: StudyDraftProvider | null = null;
