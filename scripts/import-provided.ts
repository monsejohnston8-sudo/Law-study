// Optional import of user-supplied CL650 files. Source documents never enter Git.
import { db } from "../src/lib/db";
import { extract, fileHash, safeName } from "../src/lib/import";
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
const root = process.argv[2];
if (!root) throw new Error("Pass the private CL650 materials directory");
try {
  for (const name of await readdir(root)) {
    if (!name.endsWith(".txt")) continue;
    const match = /Module_(\d+)_/.exec(name);
    if (!match) continue;
    const bytes = await readFile(join(root, name)),
      hash = fileHash(bytes);
    if (await db.source.findUnique({ where: { hash } })) continue;
    const parsed = await extract(name, "text/plain", bytes),
      filename = `${hash}-${safeName(name)}`;
    await mkdir("private/originals", { recursive: true, mode: 0o700 });
    await writeFile(join("private/originals", filename), bytes, {
      mode: 0o600,
    });
    await db.source.create({
      data: {
        courseId: "CL650",
        moduleId: `CL650-M${match[1].padStart(2, "0")}`,
        title: name.replaceAll("_", " ").replace(".txt", ""),
        hash,
        type: "notes",
        rights:
          "Supplied by user for private personal study; not independently verified",
        filename,
        mime: "text/plain",
        status: parsed.status,
        excerpts: { create: parsed.pages },
      },
    });
    console.log(`Imported private source for CL650 module ${match[1]}`);
  }
} finally {
  await db.$disconnect();
}
