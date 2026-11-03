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
  return text
    .replace(/CL(?:650|685|700)-M(\d+)/g, (_, n) => `Module ${Number(n)}`)
    .replace(/CL(?:650|685|700)/g, (id) => courseName(id));
}
