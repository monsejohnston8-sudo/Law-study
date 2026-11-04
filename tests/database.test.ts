import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { seed } from "../prisma/seed";
import { backup, restore } from "../src/lib/backup";
let db: PrismaClient, dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "casebook-test-"));
  const path = join(dir, "test.db");
  const sql = new Database(path);
  for (const name of [
    "202611030001_initial",
    "202611030002_course_sources",
    "202611040001_practice_submissions",
  ])
    sql.exec(await readFile(`prisma/migrations/${name}/migration.sql`, "utf8"));
  sql.close();
  db = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: `file:${path}` }),
  });
});
afterAll(async () => {
  await db?.$disconnect();
  await rm(dir, { recursive: true, force: true });
});
describe("relational persistence", () => {
  it("seeds twice without duplicates or filled-in placeholders", async () => {
    await seed(db);
    await seed(db);
    expect(await db.course.count()).toBe(3);
    expect(await db.module.count()).toBe(45);
    expect(await db.flashcard.count({ where: { answer: { not: null } } })).toBe(
      0,
    );
  });
  it("round trips private study records and restores atomically", async () => {
    const note = await db.note.create({
      data: {
        moduleId: "CL650-M01",
        title: "My note",
        body: "Persistent text",
      },
    });
    const initial = await backup(db);
    await db.note.delete({ where: { id: note.id } });
    await restore(db, initial);
    expect(
      (await db.note.findUniqueOrThrow({ where: { id: note.id } })).body,
    ).toBe("Persistent text");
    const invalid = JSON.parse(JSON.stringify(initial));
    invalid.data.note[0].moduleId = "nonexistent";
    await expect(restore(db, invalid)).rejects.toThrow();
    expect(await db.module.count()).toBe(45);
    expect(await db.note.count()).toBe(1);
    await expect(restore(db, { version: 99, data: {} })).rejects.toThrow();
  });

  it("rejects malformed serialized study state before replacing data", async () => {
    const initial = await backup(db);
    const invalid = structuredClone(initial);
    invalid.data.essayDraft.push({
      id: "bad-draft",
      moduleId: "CL650-M01",
      title: "Malformed draft",
      checklist: "not JSON",
    });
    await expect(restore(db, invalid)).rejects.toThrow();
    expect(await db.module.count()).toBe(45);
    const unsafe = structuredClone(initial);
    unsafe.data.source.push({
      filename: "../../escape.txt",
      hash: "a".repeat(64),
    });
    await expect(restore(db, unsafe)).rejects.toThrow("unsafe source metadata");
    expect(await db.note.count()).toBe(1);
  });
});
