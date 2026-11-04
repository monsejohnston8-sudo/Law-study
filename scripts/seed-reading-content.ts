// Install the public original reading companions in the desktop store, additively.
import "fake-indexeddb/auto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createPhoneStore, phoneApi, exportPhone } from "../mobile/store";
import { db } from "../src/lib/db";
export async function seedReadingContent(client = db) {
  const scratch = createPhoneStore(`reading-seed-${crypto.randomUUID()}`);
  try {
    await phoneApi(scratch)("state");
    const snapshot = await exportPhone(scratch);
    const sources = snapshot.data.source.filter((r) =>
      String(r.id).startsWith("shared-notes-"),
    );
    await mkdir("private/originals", { recursive: true });
    for (const source of sources) {
      const original = await scratch.table("original").get(source.filename);
      await writeFile(
        join("private/originals", String(source.filename)),
        new Uint8Array(await original.blob.arrayBuffer()),
      );
    }
    await client.$transaction(
      async (tx) => {
        for (const table of [
          "source",
          "sourceExcerpt",
          "rule",
          "caseBrief",
          "flashcard",
          "mCQ",
          "essayPrompt",
          "note",
        ] as const) {
          const rows = snapshot.data[table].filter((r) =>
            table === "source"
              ? sources.some((s) => s.id === r.id)
              : table === "sourceExcerpt"
                ? String(r.id).startsWith("shared-source-")
                : r.origin === "Shared study draft" ||
                  r.origin === "Reading guide draft" ||
                  r.origin === "Reading assignment" ||
                  r.origin === "Definition study draft" ||
                  r.origin === "Casebook authored",
          );
          for (const row of rows)
            await (tx[table] as any).upsert({
              where: { id: row.id },
              update: {},
              create: row,
            });
        }
      },
      { timeout: 60000 },
    );
    console.log(
      "Installed original reading companions without replacing existing study work.",
    );
  } finally {
    await scratch.delete();
  }
}
if (process.argv[1]?.endsWith("seed-reading-content.ts"))
  seedReadingContent().finally(() => db.$disconnect());
