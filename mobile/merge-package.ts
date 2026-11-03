import type Dexie from "dexie";
import { unzipSync, strFromU8 } from "fflate";
import { validateBackup } from "../src/lib/backup";
import { seedPhone, sha256, type Row } from "./store";
type Summary = { added: number; filled: number; kept: number; sources: number };
// Add missing study content only. Never replace a learner's writing or history.
export async function mergeStudyPackage(
  db: Dexie,
  file: File,
): Promise<Summary> {
  if (file.size > 64 * 1024 * 1024)
    throw new Error("Study package exceeds 64 MiB");
  let total = 0;
  const zip = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter(e) {
      total += e.originalSize;
      if (total > 100 * 1024 * 1024 || e.originalSize > 40 * 1024 * 1024)
        throw new Error("Study package decompressed size limit exceeded");
      if (e.name.startsWith("/") || e.name.split("/").includes(".."))
        throw new Error("Unsafe package path");
      return e.name === "backup.json" || e.name.startsWith("originals/");
    },
  });
  if (!zip["backup.json"])
    throw new Error("Choose a Casebook study package containing backup.json");
  const incoming = validateBackup(JSON.parse(strFromU8(zip["backup.json"])));
  const prepared = new Map<string, Blob>();
  for (const source of incoming.data.source) {
    const bytes = zip[`originals/${source.filename}`];
    if (!bytes || (await sha256(bytes)) !== source.hash)
      throw new Error(
        `Original document missing or checksum mismatch: ${source.title}`,
      );
    prepared.set(
      String(source.filename),
      new Blob([new Uint8Array(bytes)], { type: String(source.mime) }),
    );
  }
  await seedPhone(db);
  const result: Summary = {
    added: 0,
    filled: 0,
    kept: 0,
    sources: incoming.data.source.length,
  };
  const table = (name: string) => db.table<Row, string>(name);
  await db.transaction("rw", db.tables, async () => {
    const sourceMap = new Map<string, string>(),
      excerptMap = new Map<string, string>();
    for (const name of ["course", "module"] as const)
      for (const raw of incoming.data[name]) {
        const row = raw as Row;
        if (!(await table(name).get(row.id))) {
          await table(name).add(row);
          result.added++;
        }
      }
    for (const raw of incoming.data.source) {
      const row = raw as Row;
      const existing = await table("source")
        .where("hash")
        .equals(row.hash)
        .first();
      if (existing) {
        sourceMap.set(row.id, existing.id);
        result.kept++;
      } else {
        if (await table("source").get(row.id))
          throw new Error("Source ID conflicts with another document");
        await table("source").add(row);
        sourceMap.set(row.id, row.id);
        result.added++;
      }
      const target = existing?.filename ?? row.filename;
      const old = await db.table("original").get(target);
      if (!old)
        await db
          .table("original")
          .put({ id: target, blob: prepared.get(row.filename) });
    }
    for (const raw of incoming.data.sourceExcerpt) {
      const row = {
        ...raw,
        id: String(raw.id),
        sourceId: sourceMap.get(String(raw.sourceId)),
      } as Row;
      if (!row.sourceId) throw new Error("Source reference is missing");
      const existing = await table("sourceExcerpt").get(row.id);
      if (existing) {
        if (existing.sourceId !== row.sourceId || existing.text !== row.text)
          throw new Error("Source excerpt conflicts with existing text");
        excerptMap.set(row.id, existing.id);
        result.kept++;
      } else {
        await table("sourceExcerpt").add(row);
        const { text, ...meta } = row;
        await table("excerptMeta").put(meta as Row);
        excerptMap.set(row.id, row.id);
        result.added++;
      }
    }
    for (const raw of incoming.data.topic) {
      const row = raw as Row;
      if (!(await table("module").get(row.moduleId)))
        throw new Error("Module reference is missing");
      if (!(await table("topic").get(row.id))) {
        await table("topic").add(row);
        result.added++;
      }
    }
    for (const name of [
      "rule",
      "caseBrief",
      "flashcard",
      "mCQ",
      "essayPrompt",
      "note",
    ] as const) {
      for (const raw of incoming.data[name]) {
        const row = {
          ...raw,
          id: String(raw.id),
          excerptId: raw.excerptId
            ? excerptMap.get(String(raw.excerptId))
            : null,
        } as Row;
        if (raw.origin === "user-written") {
          result.kept++;
          continue;
        }
        if (raw.excerptId && !row.excerptId)
          throw new Error("Study item has a missing source excerpt");
        if (!(await table("module").get(row.moduleId)))
          throw new Error("Study item has a missing module");
        const existing = await table(name).get(row.id);
        if (!existing) {
          await table(name).add(row);
          result.added++;
        } else if (
          existing.status === "missing" &&
          existing.origin === "curriculum" &&
          !existing.answer &&
          !existing.body &&
          !existing.holding
        ) {
          const content = { ...row };
          if (name === "flashcard")
            for (const k of ["interval", "ease", "repetitions", "due"])
              content[k] = existing[k];
          await table(name).put({ ...content, createdAt: existing.createdAt });
          result.filled++;
        } else result.kept++;
      }
    }
    // No writes to QuizAttempt, FlashcardReview, EssayDraft, StudySession,
    // MasteryProgress, preferences, or existing user-written study items.
  });
  return result;
}
