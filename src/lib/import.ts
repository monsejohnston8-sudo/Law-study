import { createHash } from "node:crypto";
import mammoth from "mammoth";
import { z } from "zod";
import { unzipSync } from "fflate";
import { extractEpub } from "./epub";
export const MAX_UPLOAD = 20 * 1024 * 1024;
export type Page = { page: number; section: string; text: string };
export async function extract(
  name: string,
  mime: string,
  buffer: Buffer,
): Promise<{ pages: Page[]; status: string }> {
  if (buffer.length > MAX_UPLOAD)
    throw new Error("File exceeds the 20 MiB limit");
  if (!buffer.length) throw new Error("File is empty");
  const ext = name.split(".").pop()?.toLowerCase();
  const allowed: Record<string, string[]> = {
    pdf: ["application/pdf"],
    docx: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/zip",
    ],
    txt: ["text/plain"],
    md: ["text/markdown", "text/plain"],
    json: ["application/json", "text/plain"],
    epub: ["application/epub+zip", "application/zip"],
  };
  if (
    !ext ||
    !allowed[ext] ||
    (mime &&
      mime !== "application/octet-stream" &&
      !allowed[ext].includes(mime))
  )
    throw new Error("Unsupported file extension or MIME type");
  if (ext === "epub") return extractEpub(buffer);
  if (ext === "pdf") {
    if (buffer.subarray(0, 5).toString() !== "%PDF-")
      throw new Error("Invalid PDF signature");
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableFontFace: true,
    }).promise;
    const pages: Page[] = [];
    try {
      if (pdf.numPages > 1500) throw new Error("PDF exceeds 1500 pages");
      for (let n = 1; n <= pdf.numPages; n++) {
        const p = await pdf.getPage(n);
        const content = await p.getTextContent();
        pages.push({
          page: n,
          section: `PDF page ${n}`,
          text: content.items
            .map((i) =>
              "str" in i
                ? i.str + ("hasEOL" in i && i.hasEOL ? "\n" : " ")
                : "",
            )
            .join(""),
        });
      }
    } finally {
      await pdf.destroy();
    }
    return {
      pages,
      status: pages.some(
        (p) => p.text.replace(/[^\p{L}\p{N}]/gu, "").length < 40,
      )
        ? "ocr_needed"
        : "extracted",
    };
  }
  if (ext === "docx") {
    if (buffer.subarray(0, 2).toString() !== "PK")
      throw new Error("Invalid DOCX signature");
    let unpacked = 0;
    unzipSync(new Uint8Array(buffer), {
      filter(entry) {
        unpacked += entry.originalSize;
        if (
          entry.originalSize > 12 * 1024 * 1024 ||
          unpacked > 80 * 1024 * 1024
        )
          throw new Error("DOCX decompressed size limit exceeded");
        return false;
      },
    });
    const result = await mammoth.extractRawText({ buffer });
    if (result.value.length > 5000000)
      throw new Error("Extracted text is too large");
    return {
      pages: [
        {
          page: 0,
          section: "DOCX text; original pagination unavailable",
          text: result.value,
        },
      ],
      status: result.value.trim() ? "needs_review" : "ocr_needed",
    };
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  if (text.includes("\0"))
    throw new Error("Binary data is not supported as text");
  if (ext === "json") JSON.parse(text);
  return {
    pages: text.split("\f").map((text, i) => ({
      page: 0,
      section: `Text segment ${i + 1}; original pagination unavailable`,
      text,
    })),
    status: "needs_review",
  };
}
export function fileHash(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}
export function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "source";
}
export const sourceMetadata = z.object({
  courseId: z.string().min(1),
  moduleId: z
    .string()
    .transform((v) => v || null)
    .nullable()
    .default(null),
  title: z.string().trim().min(1),
  author: z.string().default(""),
  edition: z.string().default(""),
  type: z.enum([
    "syllabus",
    "textbook excerpt",
    "case",
    "seminar",
    "notes",
    "quiz feedback",
  ]),
  rights: z.string().trim().min(1),
});
