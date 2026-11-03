// Optional local OCR. No document data is sent to an external service.
import { db } from "../src/lib/db";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const run = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), "casebook-ocr-"));
try {
  const sources = await db.source.findMany({
    where: { mime: "application/pdf", status: "ocr_needed" },
    include: { excerpts: true },
  });
  for (const s of sources) {
    const jobs = s.excerpts.filter(
      (e) => e.text.replace(/[^\p{L}\p{N}]/gu, "").length < 40,
    );
    let next = 0,
      success = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const e = jobs[next++],
          prefix = join(root, `${s.id}-${e.page}`);
        try {
          await run(
            "pdftoppm",
            [
              "-f",
              String(e.page),
              "-l",
              String(e.page),
              "-r",
              "150",
              "-singlefile",
              "-png",
              join(process.cwd(), "private", "originals", s.filename),
              prefix,
            ],
            { timeout: 120000, maxBuffer: 1024 * 1024 },
          );
          await run(
            "tesseract",
            [`${prefix}.png`, prefix, "-l", "eng", "--psm", "3"],
            {
              env: { ...process.env, OMP_THREAD_LIMIT: "1" },
              timeout: 120000,
              maxBuffer: 1024 * 1024,
            },
          );
          const text = await readFile(`${prefix}.txt`, "utf8");
          if (text.trim().length < 40)
            throw new Error("No meaningful OCR text detected");
          await db.sourceExcerpt.update({
            where: { id: e.id },
            data: {
              text,
              section: `PDF page ${e.page} · local OCR draft; verify against original`,
              locatorVerified: false,
            },
          });
          success++;
        } catch {
          console.log(
            `OCR did not complete for ${s.id} page ${e.page}; original retained`,
          );
        } finally {
          await rm(`${prefix}.png`, { force: true });
          await rm(`${prefix}.txt`, { force: true });
        }
      }
    };
    await Promise.all([worker(), worker()]);
    await db.source.update({
      where: { id: s.id },
      data: { status: success === jobs.length ? "ocr_draft" : "ocr_needed" },
    });
    console.log(
      JSON.stringify({
        title: s.title,
        ocrPages: success,
        totalRequested: jobs.length,
        status: success === jobs.length ? "ocr_draft" : "ocr_needed",
      }),
    );
  }
} finally {
  await db.$disconnect();
  await rm(root, { recursive: true, force: true });
}
