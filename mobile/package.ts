import type Dexie from "dexie";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import { validateBackup } from "../src/lib/backup";
import { exportPhone, restorePhone, sha256 } from "./store";
export async function importStudyPackage(db: Dexie, file: File) {
  if (file.size > 64 * 1024 * 1024)
    throw new Error("Study package exceeds 64 MiB");
  let total = 0;
  const zip = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter(e) {
      total += e.originalSize;
      if (total > 100 * 1024 * 1024 || e.originalSize > 40 * 1024 * 1024)
        throw new Error("Study package decompressed size limit exceeded");
      if (e.name.startsWith("/") || e.name.split("/").includes(".."))
        throw new Error("Unsafe study-package path");
      return (
        e.name === "backup.json" ||
        e.name === "manifest.json" ||
        e.name.startsWith("originals/")
      );
    },
  });
  if (!zip["backup.json"])
    throw new Error(
      "This is not a Casebook study package. Choose Casebook-iPhone-Study-Data.zip, not the Mac app ZIP.",
    );
  const input = validateBackup(JSON.parse(strFromU8(zip["backup.json"])));
  const originals: { id: string; blob: Blob }[] = [];
  for (const source of input.data.source) {
    const filename = String(source.filename),
      bytes = zip[`originals/${filename}`];
    if (!bytes) throw new Error(`Original document missing: ${source.title}`);
    if ((await sha256(bytes)) !== source.hash)
      throw new Error(`Original checksum mismatch: ${source.title}`);
    originals.push({
      id: filename,
      blob: new Blob([new Uint8Array(bytes)], { type: String(source.mime) }),
    });
  }
  await restorePhone(db, input, originals);
  // Persistence is a best-effort browser request, never a guarantee against user deletion.
  await navigator.storage?.persist?.().catch(() => false);
  return {
    courses: input.data.course.length,
    modules: input.data.module.length,
    sources: input.data.source.length,
  };
}
export async function exportStudyPackage(db: Dexie) {
  const data = await exportPhone(db);
  const files: Record<string, Uint8Array> = {
    "backup.json": strToU8(JSON.stringify(data)),
    "manifest.json": strToU8(
      JSON.stringify({
        type: "casebook-phone-package",
        version: 1,
        createdAt: new Date().toISOString(),
      }),
    ),
  };
  for (const source of data.data.source) {
    const original = await db.table("original").get(source.filename);
    if (!original?.blob)
      throw new Error(
        `Original document unavailable: ${source.title}. Export JSON study data instead, or reimport the original.`,
      );
    files[`originals/${source.filename}`] = new Uint8Array(
      await (original.blob as Blob).arrayBuffer(),
    );
  }
  return new Blob([new Uint8Array(zipSync(files, { level: 6 }))], {
    type: "application/zip",
  });
}
