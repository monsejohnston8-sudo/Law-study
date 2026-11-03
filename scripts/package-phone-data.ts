// Build a private, explicitly user-authorized study package. Never put it in phone-dist.
import { db } from "../src/lib/db";
import { backup } from "../src/lib/backup";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import type { PrismaClient } from "@prisma/client";
const output = resolve(
  process.argv[2] ?? "/workspace/deliverables/Casebook-iPhone-Study-Data.zip",
);
if (output.startsWith(resolve("phone-dist")))
  throw new Error(
    "Private data must never be written into the public app build",
  );
try {
  const data = await db.$transaction((tx) => backup(tx as PrismaClient), {
    timeout: 60000,
  });
  const files: Record<string, Uint8Array> = {
    "backup.json": strToU8(JSON.stringify(data)),
    "manifest.json": strToU8(
      JSON.stringify({
        type: "casebook-phone-package",
        version: 1,
        createdAt: new Date().toISOString(),
        private: true,
      }),
    ),
  };
  for (const source of data.data.source) {
    const filename = String(source.filename);
    if (filename.includes("/") || filename.includes("\\"))
      throw new Error("Unsafe filename");
    const bytes = await readFile(join("private", "originals", filename));
    if (createHash("sha256").update(bytes).digest("hex") !== source.hash)
      throw new Error("Original source checksum mismatch");
    files[`originals/${filename}`] = bytes;
  }
  await mkdir(resolve(output, ".."), { recursive: true });
  const zip = zipSync(files, { level: 6 });
  await writeFile(output, zip, { mode: 0o600 });
  console.log(
    JSON.stringify({
      file: output,
      bytes: zip.byteLength,
      courses: data.data.course.length,
      modules: data.data.module.length,
      sources: data.data.source.length,
    }),
  );
} finally {
  await db.$disconnect();
}
