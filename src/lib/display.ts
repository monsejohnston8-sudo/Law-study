const names: Record<string, string> = {
  CL650: "Constitutional Law",
  CL685: "Criminal Procedure",
  CL700: "Business Organizations",
};
export function courseName(id: string) {
  return names[id] ?? "Course";
}
export function moduleName(id: string) {
  const n = /-M(\d+)$/.exec(id);
  return n ? `Module ${Number(n[1])}` : "Course library";
}
export function cleanLabel(text: string) {
  return text.replace(
    /\bCL[ -]?(\d{3})(?:-M(\d+))?\b/gi,
    (_, number, module) =>
      module ? `Module ${Number(module)}` : courseName(`CL${number}`),
  );
}

// Normalize a display copy only. IDs, backups, originals, and editable records
// retain their actual values so prior progress and source provenance stay intact.
const displayFields = new Set([
  "title",
  "name",
  "body",
  "section",
  "topic",
  "coverage",
  "rule",
  "answer",
  "facts",
  "posture",
  "issue",
  "holding",
  "reasoning",
  "significance",
  "policy",
  "jurisdiction",
  "exceptions",
  "examples",
  "counterarguments",
  "elements",
  "standardOfReview",
  "dissent",
  "author",
  "edition",
  "rights",
]);
export function displayState<T>(value: T): T {
  const visit = (v: any): any =>
    Array.isArray(v)
      ? v.map(visit)
      : v && typeof v === "object" && "application" in v && "checklist" in v
        ? { ...v } // Saved exam titles and JSON carry lookup keys, not display labels.
        : v && typeof v === "object"
          ? Object.fromEntries(
              Object.entries(v).map(([k, x]) => [
                k,
                typeof x === "string" && displayFields.has(k)
                  ? cleanLabel(x)
                  : visit(x),
              ]),
            )
          : v;
  return visit(value);
}
