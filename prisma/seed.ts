import { db } from "../src/lib/db";
import { readFileSync } from "node:fs";
export async function seed(client = db) {
  for (const code of ["CL650", "CL685", "CL700"]) {
    const c = JSON.parse(readFileSync(`curriculum/${code}.json`, "utf8"));
    await client.course.upsert({
      where: { id: code },
      update: {},
      create: { id: code, title: c.course_title },
    });
    for (const m of c.modules) {
      await client.module.upsert({
        where: { id: m.id },
        update: {},
        create: {
          id: m.id,
          courseId: code,
          number: m.number,
          title: m.title,
          coverage: m.coverage,
        },
      });
      for (const [i, t] of m.topics.entries())
        await client.topic.upsert({
          where: { id: `${m.id}-topic-${i}` },
          update: {},
          create: {
            id: `${m.id}-topic-${i}`,
            moduleId: m.id,
            name: t.name,
            rule: t.rule,
          },
        });
      for (const [i, c] of m.cases.entries())
        await client.caseBrief.upsert({
          where: { id: `${m.id}-case-${i}` },
          update: {},
          create: {
            id: `${m.id}-case-${i}`,
            moduleId: m.id,
            title: c.name,
            body: c.brief,
            status: "missing",
            origin: "curriculum",
          },
        });
      for (const [i, f] of m.flashcards.entries())
        await client.flashcard.upsert({
          where: { id: `${m.id}-card-${i}` },
          update: {},
          create: {
            id: `${m.id}-card-${i}`,
            moduleId: m.id,
            title: f.question,
            answer: f.answer,
            status: "missing",
            origin: "curriculum",
          },
        });
    }
  }
}
if (process.argv[1]?.endsWith("seed.ts"))
  seed()
    .then(() => console.log("Seeded 3 courses / 45 modules (idempotent)"))
    .finally(() => db.$disconnect());
