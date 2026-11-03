import "fake-indexeddb/auto";
import { afterEach, describe, it, expect, vi } from "vitest";
import { validateAIStudy, buildAIStudyRows } from "../src/lib/ai-study";
import {
  connectAI,
  disconnectAI,
  generateAIStudy,
  isAIConnected,
} from "../src/lib/ai-client";
import { createPhoneStore, phoneApi, exportPhone } from "../mobile/store";
const text = "Original test material. Alpha precedes beta. Gamma follows beta.";
const citation = { excerptId: "test-source", support: "Alpha precedes beta." };
const draft = {
  title: "Sequence study",
  summary: "A concise fixture summary.",
  notes: [
    { heading: "Ordering", explanation: "Alpha comes before beta.", citation },
  ],
  questions: [
    {
      question: "What precedes beta?",
      answer: "Alpha.",
      explanation: "The supplied fixture explicitly gives the sequence.",
      citation,
    },
  ],
  limitations: ["This is original nonlegal test material."],
};
afterEach(() => {
  disconnectAI();
  vi.unstubAllGlobals();
});
describe("source-grounded personal AI study", () => {
  it("rejects invented evidence and fabricated source IDs", () => {
    expect(
      validateAIStudy(draft, [{ id: "test-source", text, locator: "Fixture" }])
        .questions,
    ).toHaveLength(1);
    expect(() =>
      validateAIStudy(
        {
          ...draft,
          questions: [
            {
              ...draft.questions[0],
              citation: {
                ...citation,
                support: "Unsupported invented material",
              },
            },
          ],
        },
        [{ id: "test-source", text, locator: "Fixture" }],
      ),
    ).toThrow("does not match");
    expect(() =>
      validateAIStudy(draft, [
        { id: "another-source", text, locator: "Fixture" },
      ]),
    ).toThrow("does not match");
  });
  it("sends only the selected text to the fixed provider and keeps connection in memory", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "completed",
            output: [
              {
                content: [{ type: "output_text", text: JSON.stringify(draft) }],
              },
            ],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    await expect(
      generateAIStudy({ id: "test-source", text, locator: "Fixture" }, "depth"),
    ).rejects.toThrow("Connect");
    connectAI("sk-original-test-key");
    expect(isAIConnected()).toBe(true);
    expect(
      (
        await generateAIStudy(
          { id: "test-source", text, locator: "Fixture" },
          "depth",
        )
      ).title,
    ).toBe("Sequence study");
    const [url, request] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(request.body);
    expect(body.store).toBe(false);
    expect(body.input).toContain(text);
    expect(request.body).not.toContain("sk-original-test-key");
    expect(body.instructions).toContain("untrusted");
    disconnectAI();
    expect(isAIConnected()).toBe(false);
  });
  it("handles provider failures without pretending notes were generated", async () => {
    connectAI("sk-original-test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 429 })),
    );
    await expect(
      generateAIStudy(
        { id: "test-source", text, locator: "Fixture" },
        "summary",
      ),
    ).rejects.toThrow("quota");
  });
  it("stores confirmed notes and exam questions privately and preserves their evidence and review status", async () => {
    const db = createPhoneStore(`ai-${crypto.randomUUID()}`),
      other = createPhoneStore(`other-${crypto.randomUUID()}`);
    try {
      const api = phoneApi(db);
      await api("state");
      const form = new FormData();
      for (const [k, v] of Object.entries({
        courseId: "CL700",
        moduleId: "CL700-M01",
        title: "Private fixture",
        author: "Test",
        edition: "",
        type: "notes",
        rights: "Original fixture",
      }))
        form.set(k, v);
      form.set("file", new File([text], "fixture.txt", { type: "text/plain" }));
      const source = await api("import", form);
      const parent = await db
        .table("sourceExcerpt")
        .where("sourceId")
        .equals(source.id)
        .first();
      const fixed = {
        ...draft,
        notes: draft.notes.map((n) => ({
          ...n,
          citation: { ...citation, excerptId: parent.id },
        })),
        questions: draft.questions.map((q) => ({
          ...q,
          citation: { ...citation, excerptId: parent.id },
        })),
      };
      const input = {
        moduleId: "CL700-M01",
        excerptId: parent.id,
        start: 0,
        end: text.length,
        draft: fixed,
      };
      await expect(
        api("ai-study", { ...input, moduleId: "CL650-M01" }),
      ).rejects.toThrow("do not match");
      expect(await api("ai-study", input)).toEqual({ notes: 1, questions: 1 });
      const card = await db
        .table("flashcard")
        .filter((r) => r.id.startsWith("personal-ai-card-"))
        .first();
      expect(card.status).toBe("needs_review");
      expect(card.origin).toBe("AI-generated draft");
      expect((await db.table("sourceExcerpt").get(card.excerptId)).text).toBe(
        text,
      );
      connectAI("sk-original-test-key");
      expect(JSON.stringify(await exportPhone(db))).not.toContain(
        "sk-original-test-key",
      );
      await phoneApi(other)("state");
      expect(
        await other
          .table("note")
          .filter((r) => r.id.startsWith("personal-ai-"))
          .count(),
      ).toBe(0);
      expect(() =>
        buildAIStudyRows({ ...input, end: text.length + 1 }, parent as any),
      ).toThrow("passage");
    } finally {
      await db.delete();
      await other.delete();
    }
  });
});
