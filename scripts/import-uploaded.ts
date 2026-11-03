import { db } from "../src/lib/db";
import { extract, fileHash, safeName } from "../src/lib/import";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
const manifest = JSON.parse(await readFile(process.argv[2], "utf8")) as {
  path: string;
  courseId: string;
  type: string;
  title: string;
  author?: string;
}[];
try {
  for (const f of manifest) {
    const bytes = await readFile(f.path),
      hash = fileHash(bytes);
    if (await db.source.findUnique({ where: { hash } })) {
      console.log(`Duplicate retained: ${f.title}`);
      continue;
    }
    const ext = f.path.split(".").pop()?.toLowerCase(),
      mime =
        ext === "epub"
          ? "application/epub+zip"
          : ext === "pdf"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const parsed = await extract(basename(f.path), mime, bytes),
      filename = `${hash}-${safeName(basename(f.path))}`;
    await mkdir("private/originals", { recursive: true, mode: 0o700 });
    await writeFile(join("private/originals", filename), bytes, {
      mode: 0o600,
    });
    await db.source.create({
      data: {
        courseId: f.courseId,
        moduleId: null,
        title: f.title,
        author: f.author ?? "",
        hash,
        type: f.type,
        rights:
          "User-supplied copy for private personal study; permission not independently verified",
        filename,
        mime,
        status: parsed.status,
        excerpts: { create: parsed.pages },
      },
    });
    console.log(
      JSON.stringify({
        title: f.title,
        sections: parsed.pages.length,
        characters: parsed.pages.reduce((s, p) => s + p.text.length, 0),
        emptyPages: parsed.pages.filter((p) => !p.text.trim()).length,
        status: parsed.status,
      }),
    );
  }
} finally {
  await db.$disconnect();
}
