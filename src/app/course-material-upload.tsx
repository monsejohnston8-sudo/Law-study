"use client";
import { useState } from "react";
type Row = Record<string, any>;
export default function CourseMaterialUpload({
  module,
  onUpload,
}: {
  module: Row;
  onUpload: (
    form: FormData,
    kind: string,
    label: string,
    comment: string,
  ) => Promise<void>;
}) {
  const [kind, setKind] = useState("seminar"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  return (
    <form
      className="card"
      onSubmit={async (e) => {
        e.preventDefault();
        const element = e.currentTarget;
        setBusy(true);
        setError("");
        setMessage("");
        try {
          const input = new FormData(element),
            file = input.get("file");
          if (!(file instanceof File) || !file.size)
            throw new Error("Choose a seminar or quiz file");
          const form = new FormData();
          for (const [k, v] of Object.entries({
            courseId: module.courseId,
            moduleId: module.id,
            title: String(input.get("title") || file.name),
            author: "",
            edition: "",
            type: kind,
            rights:
              "User-supplied course material for private personal study; permission not independently verified",
          }))
            form.set(k, v);
          form.set("file", file);
          await onUpload(
            form,
            kind,
            String(input.get("courseLabel") ?? ""),
            String(input.get("comment") ?? ""),
          );
          element.reset();
          setMessage(
            "Uploaded to your module. Your material stays on this device and is not added to the shared app.",
          );
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>Upload my seminar or quiz materials</h3>
      <p>
        Bring your own course’s notes, quizzes, or feedback into this module.
        Uploads are private; AI processing is optional and is not started here.
      </p>
      <label className="field">
        Material type
        <select
          aria-label="Material type"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="seminar">Seminar notes</option>
          <option value="quiz feedback">Quiz, answers or feedback</option>
        </select>
      </label>
      <label className="field">
        My course or section name (optional)
        <input name="courseLabel" />
      </label>
      <label className="field">
        Material title
        <input name="title" required />
      </label>
      <label className="field">
        Seminar or quiz file
        <input
          name="file"
          type="file"
          accept=".pdf,.epub,.docx,.txt,.md,.json"
          required
        />
      </label>
      <p className="muted">
        PDF, EPUB, DOCX, TXT, Markdown or JSON · up to 20 MiB. Scanned documents
        may require OCR.
      </p>
      <label className="field">
        My notes about this material
        <textarea name="comment" rows={3} />
      </label>
      <button disabled={busy}>
        {busy ? "Importing…" : "Upload to my module"}
      </button>
      {message && <p role="status">{message}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
