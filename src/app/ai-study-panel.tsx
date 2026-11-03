"use client";
import { useEffect, useRef, useState } from "react";
import {
  connectAI,
  disconnectAI,
  isAIConnected,
  generateAIStudy,
} from "../lib/ai-client";
import type { AIStudyDraft } from "../lib/ai-study";
type Row = Record<string, any>;
export default function AIStudyPanel({
  excerpt: initialExcerpt,
  source,
  moduleId,
  onSave,
  onLoadExcerpt,
}: {
  excerpt: Row;
  source: Row;
  moduleId: string;
  onSave: (v: Row) => Promise<Row>;
  onLoadExcerpt: (id: string) => Promise<Row>;
}) {
  const [excerpt, setExcerpt] = useState(initialExcerpt);
  const [key, setKey] = useState(""),
    [connected, setConnected] = useState(isAIConnected),
    [part, setPart] = useState(0),
    [mode, setMode] = useState<"summary" | "depth">("summary"),
    [consent, setConsent] = useState(false),
    [draft, setDraft] = useState<AIStudyDraft | null>(null),
    [selected, setSelected] = useState<number[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const text = String(excerpt.text ?? ""),
    start = part * 12000,
    end = Math.min(text.length, start + 12000),
    count = Math.ceil(text.length / 12000);
  const reset = () => {
    setDraft(null);
    setSaved(false);
    setError("");
    setMessage("");
  };
  const generate = async () => {
    setBusy(true);
    reset();
    controller.current = new AbortController();
    try {
      const result = await generateAIStudy(
        {
          id: excerpt.id,
          text: text.slice(start, end),
          locator: `${source.title} · ${excerpt.page ? `PDF page ${excerpt.page}` : excerpt.section} · characters ${start + 1}–${end}`,
        },
        mode,
        controller.current.signal,
      );
      setDraft(result);
      setSelected(result.questions.map((_, i) => i));
      setMessage(
        "Review this draft before adding it. No items have been saved.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      <p>
        Turn your selected reading into private study notes and short-answer
        questions for this module. Generated material remains a review draft.
      </p>
      <section className="card">
        <h4>Your AI connection</h4>
        <p className="muted">
          Use your own OpenAI API key. API usage is billed to your OpenAI
          account separately from ChatGPT. The key stays in this tab’s memory
          and is excluded from saved data and backups.
        </p>
        <a
          href="https://platform.openai.com/api-keys"
          target="_blank"
          rel="noopener noreferrer"
        >
          Get an OpenAI API key
        </a>
        {connected ? (
          <>
            <p>OpenAI connected for this tab.</p>
            <button
              className="outline"
              disabled={busy}
              onClick={() => {
                disconnectAI();
                setConnected(false);
              }}
            >
              Disconnect AI
            </button>
          </>
        ) : (
          <>
            <label className="field">
              OpenAI API key
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
            </label>
            <button
              className="outline"
              onClick={() => {
                try {
                  connectAI(key);
                  setKey("");
                  setConnected(true);
                  setError("");
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              Connect OpenAI
            </button>
          </>
        )}
      </section>
      <label className="field">
        Source page / section
        <select
          aria-label="AI source page / section"
          value={excerpt.id}
          disabled={busy}
          onChange={async (e) => {
            setBusy(true);
            reset();
            try {
              setExcerpt(await onLoadExcerpt(e.target.value));
              setPart(0);
              setConsent(false);
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {[
            initialExcerpt,
            ...(source.excerpts ?? []).filter(
              (e: Row) => e.id !== initialExcerpt.id,
            ),
          ].map((e: Row) => (
            <option key={e.id} value={e.id}>
              {e.page ? `PDF page ${e.page}` : e.section}
            </option>
          ))}
        </select>
      </label>
      <p className="citation">
        {source.title} ·{" "}
        {excerpt.page ? `PDF page ${excerpt.page}` : excerpt.section}
      </p>
      <label className="field">
        Source passage
        <select
          disabled={busy}
          value={part}
          onChange={(e) => {
            setPart(Number(e.target.value));
            setConsent(false);
            reset();
          }}
        >
          {Array.from({ length: count }, (_, i) => (
            <option key={i} value={i}>
              Part {i + 1} of {count} · characters {i * 12000 + 1}–
              {Math.min(text.length, (i + 1) * 12000)}
            </option>
          ))}
        </select>
      </label>
      <p className="muted">
        This run covers the selected passage only. For long chapters, process
        additional parts to build your notes without silently skipping text.
      </p>
      <details>
        <summary>Preview text to send ({end - start} characters)</summary>
        <p className="preserve">{text.slice(start, end)}</p>
      </details>
      <label className="field">
        Study format
        <select
          disabled={busy}
          value={mode}
          onChange={(e) => {
            setMode(e.target.value as "summary" | "depth");
            reset();
          }}
        >
          <option value="summary">Concise summary + mini-exam questions</option>
          <option value="depth">In-depth notes + mini-exam questions</option>
        </select>
      </label>
      <label className="check-row">
        <input
          type="checkbox"
          disabled={busy}
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        Send this displayed passage to OpenAI to generate my study draft.
      </label>
      <div className="actions">
        <button
          disabled={!connected || !consent || busy || !text.trim()}
          onClick={generate}
        >
          {busy ? "Generating…" : "Generate study draft"}
        </button>
        {busy && (
          <button
            className="outline"
            onClick={() => controller.current?.abort()}
          >
            Cancel generation
          </button>
        )}
      </div>
      {draft && (
        <section className="card">
          <h4>{draft.title}</h4>
          <p className="preserve">{draft.summary}</p>
          {draft.notes.map((n, i) => (
            <article key={i}>
              <h4>{n.heading}</h4>
              <p className="preserve">{n.explanation}</p>
              <details>
                <summary>Source evidence</summary>
                <p>{n.citation.support}</p>
              </details>
            </article>
          ))}
          <h4>Choose questions to add to your mini exam</h4>
          {draft.questions.map((q, i) => (
            <article key={i}>
              <label className="check-row">
                <input
                  aria-label={`Add generated question ${i + 1}`}
                  type="checkbox"
                  checked={selected.includes(i)}
                  disabled={saved || busy}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, i]
                        : selected.filter((n) => n !== i),
                    )
                  }
                />
                {q.question}
              </label>
              <p>{q.answer}</p>
              <p className="muted">{q.explanation}</p>
              <details>
                <summary>Source evidence</summary>
                <p>{q.citation.support}</p>
              </details>
            </article>
          ))}
          <p className="muted">
            Gaps and limitations:{" "}
            {draft.limitations.join(" ") ||
              "No additional limitations reported. Check the source yourself."}
          </p>
          <p>
            Confirming adds notes and the selected questions to your own device.
            Nothing is published to other users.
          </p>
          <button
            disabled={saved || busy || !selected.length}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const result = await onSave({
                  moduleId,
                  excerptId: excerpt.id,
                  start,
                  end,
                  draft: {
                    ...draft,
                    questions: draft.questions.filter((_, i) =>
                      selected.includes(i),
                    ),
                  },
                });
                setSaved(true);
                setMessage(
                  `Added ${result.notes} note and ${result.questions} questions to your module. Open Mini Module Exam to practice.`,
                );
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {saved
              ? "Added to my module"
              : "Confirm & add notes and exam questions"}
          </button>
        </section>
      )}
      {message && <p role="status">{message}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
