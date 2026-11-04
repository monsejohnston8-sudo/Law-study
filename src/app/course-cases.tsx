"use client";
import { useState, type ReactNode } from "react";
import { cleanLabel, moduleName } from "../lib/display";
type Row = Record<string, any>;
const fields = [
  "facts",
  "posture",
  "issue",
  "holding",
  "reasoning",
  "rule",
  "dissent",
  "significance",
];
export default function CourseCases({
  module,
  modules,
  sources,
  onRepair,
  onEdit,
  sourceLinks,
}: {
  module: Row;
  modules: Row[];
  sources: Row[];
  onRepair?: () => Promise<void>;
  onEdit?: (item: Row) => void;
  sourceLinks?: (id: string) => ReactNode;
}) {
  const [onlyModule, setOnlyModule] = useState(false),
    [query, setQuery] = useState(""),
    [message, setMessage] = useState("");
  const all = modules
    .filter((m) => m.courseId === module.courseId)
    .flatMap((m) => m.cases.map((c: Row) => ({ ...c, moduleTitle: m.title })))
    .filter((c) => c.holding || c.facts || (c.status !== "missing" && c.body));
  const local = all.filter((c) => c.moduleId === module.id);
  const shown = all
    .filter(
      (c) =>
        (!onlyModule || c.moduleId === module.id) &&
        `${c.title} ${c.citation} ${c.issue}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(b.moduleId === module.id) - Number(a.moduleId === module.id) ||
        a.title.localeCompare(b.title),
    );
  return (
    <section>
      <div className="card">
        <h3>Case brief library</h3>
        <p>
          {local.length} briefs mapped to this module · {all.length} available
          in this course.
        </p>
        <p className="muted">
          Module briefs appear first. Other course briefs are labeled for
          context and are not presented as this module’s assigned readings.
        </p>
        <label className="check-row">
          <input
            type="checkbox"
            checked={onlyModule}
            onChange={(e) => setOnlyModule(e.target.checked)}
          />
          Show only this module
        </label>
        <label className="field">
          Find a case
          <input value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        {!all.length && onRepair && (
          <button
            onClick={async () => {
              try {
                await onRepair();
                setMessage(
                  "Study library refreshed. Your writing and progress were kept.",
                );
              } catch (e) {
                setMessage(String(e));
              }
            }}
          >
            Refresh built-in case library
          </button>
        )}
        <p role="status">{message}</p>
      </div>
      {!local.length && (
        <p className="card">
          No sourced brief is mapped to this specific module yet. The available
          course briefs below are related study materials.
        </p>
      )}
      {!shown.length && (
        <p className="card">
          No matching case briefs. Try the course library or a different search.
        </p>
      )}
      {shown.map((c, i) => {
        const source = sources.find((s) =>
          s.excerpts.some((e: Row) => e.id === c.excerptId),
        );
        const excerpt = source?.excerpts.find((e: Row) => e.id === c.excerptId);
        return (
          <article className="card" key={c.id}>
            <span className="badge">
              {c.moduleId === module.id
                ? "This module"
                : `Related course brief · ${moduleName(c.moduleId)}`}
            </span>
            <span className="badge">{c.status}</span>
            {c.body?.startsWith("Optional reading") && (
              <span className="badge">Optional reading</span>
            )}
            <h3>{c.title}</h3>
            <p>{c.citation}</p>
            {c.body && <p className="muted">{c.body}</p>}
            <details open={c.moduleId === module.id || i === 0}>
              <summary>Read full brief</summary>
              {fields.map((k) =>
                c[k] ? (
                  <section key={k}>
                    <h4>{k[0].toUpperCase() + k.slice(1)}</h4>
                    <p className="preserve">{c[k]}</p>
                  </section>
                ) : null,
              )}
            </details>
            {sourceLinks?.(c.id)}
            {onEdit && (
              <button className="text-button" onClick={() => onEdit(c)}>
                Edit brief
              </button>
            )}
            <p className="citation">
              {source
                ? `Source: ${cleanLabel(source.title)} · ${excerpt?.page ? `PDF page ${excerpt.page}` : cleanLabel(excerpt?.section ?? "Source locator needs review")}`
                : "No source is attached to this personal brief."}
            </p>
          </article>
        );
      })}
    </section>
  );
}
