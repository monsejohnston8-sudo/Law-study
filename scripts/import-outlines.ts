// Extract literal assigned-reading blocks from user-supplied syllabi, retaining headings.
// This neither summarizes law nor assumes an uploaded book matches an assigned edition.
import { db } from "../src/lib/db";
try {
  for (const courseId of ["CL650", "CL685", "CL700"]) {
    const source = await db.source.findFirst({
      where: { courseId, type: "syllabus" },
      include: { excerpts: true },
    });
    if (!source) continue;
    const text = source.excerpts[0]?.text ?? "",
      matches = [...text.matchAll(/^Module\s+(\d+):\s*([^\n]+)/gm)];
    let count = 0;
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i],
        number = Number(match[1]);
      if (number < 1 || number > 15) continue;
      const block = text.slice(
          match.index!,
          matches[i + 1]?.index ?? text.length,
        ),
        reading =
          /^Reading[^\n]*\n([\s\S]*?)(?=^Videos and Learning Activities|^Graded Assignments|^Seminar|$x)/m.exec(
            block,
          );
      if (!reading) continue;
      const body = reading[1].trim();
      if (!body) continue;
      const moduleId = `${courseId}-M${String(number).padStart(2, "0")}`,
        excerptId = `${source.id}-${number}-assigned`;
      await db.sourceExcerpt.upsert({
        where: { id: excerptId },
        update: {},
        create: {
          id: excerptId,
          sourceId: source.id,
          page: 0,
          section: `Module ${number}: ${match[2].trim()} · Reading`,
          locatorVerified: true,
          text: body,
        },
      });
      await db.note.upsert({
        where: { id: `${moduleId}-assigned-outline` },
        update: {},
        create: {
          id: `${moduleId}-assigned-outline`,
          moduleId,
          title: `Assigned readings · Module ${number}`,
          body,
          status: "needs_review",
          origin: "sourced",
          kind: "assigned reading",
          excerptId,
        },
      });
      count++;
    }
    console.log(
      `${courseId}: ${count} exact reading blocks imported; completion remains unset`,
    );
  }
} finally {
  await db.$disconnect();
}
