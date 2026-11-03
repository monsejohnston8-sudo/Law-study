import { extractEpub, type Page } from "../src/lib/epub";
import { unzipSync } from "fflate";
export async function extractOnPhone(
  file: File,
): Promise<{ pages: Page[]; status: string }> {
  if (file.size > 20 * 1024 * 1024)
    throw new Error("File exceeds the 20 MiB limit");
  if (!file.size) throw new Error("File is empty");
  const bytes = new Uint8Array(await file.arrayBuffer()),
    ext = file.name.split(".").pop()?.toLowerCase();
  const mimes: Record<string, string[]> = {
    pdf: ["application/pdf"],
    epub: ["application/epub+zip", "application/zip"],
    docx: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/zip",
    ],
    txt: ["text/plain"],
    md: ["text/markdown", "text/plain"],
    json: ["application/json", "text/plain"],
  };
  if (
    !ext ||
    !mimes[ext] ||
    (file.type &&
      file.type !== "application/octet-stream" &&
      !mimes[ext].includes(file.type))
  )
    throw new Error("Unsupported file extension or MIME type");
  if (ext === "epub") return extractEpub(bytes);
  if (ext === "pdf") {
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
      throw new Error("Invalid PDF signature");
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url,
    ).href;
    const pdf = await pdfjs.getDocument({
      data: bytes,
      useSystemFonts: true,
      disableFontFace: true,
    }).promise;
    const pages: Page[] = [];
    try {
      if (pdf.numPages > 1500) throw new Error("PDF exceeds 1500 pages");
      for (let page = 1; page <= pdf.numPages; page++) {
        const p = await pdf.getPage(page),
          text = await p.getTextContent();
        pages.push({
          page,
          section: `PDF page ${page}`,
          text: text.items
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
    if (bytes[0] !== 80 || bytes[1] !== 75)
      throw new Error("Invalid DOCX signature");
    let total = 0;
    unzipSync(bytes, {
      filter(e) {
        total += e.originalSize;
        if (total > 80 * 1024 * 1024 || e.originalSize > 12 * 1024 * 1024)
          throw new Error("DOCX decompressed size limit exceeded");
        return false;
      },
    });
    const mammoth = await import("mammoth/mammoth.browser");
    const result = await mammoth.extractRawText({ arrayBuffer: bytes.buffer });
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
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
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
