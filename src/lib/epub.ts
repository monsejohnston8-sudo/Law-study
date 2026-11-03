import { unzipSync } from "fflate";
import { XMLParser } from "fast-xml-parser";
export type Page = { page: number; section: string; text: string };
export function extractEpub(buffer: Uint8Array): {
  pages: Page[];
  status: string;
} {
  let total = 0;
  const zip = unzipSync(new Uint8Array(buffer), {
    filter(entry) {
      total += entry.originalSize;
      if (entry.originalSize > 12 * 1024 * 1024 || total > 80 * 1024 * 1024)
        throw new Error("EPUB decompressed size limit exceeded");
      return /(?:mimetype|container\.xml|\.opf|\.xhtml|\.html|\.htm)$/i.test(
        entry.name,
      );
    },
  });
  const read = (path: string) => {
    const data = zip[path];
    if (!data) throw new Error(`EPUB resource missing: ${path}`);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(data);
    if (/<!ENTITY/i.test(text))
      throw new Error("Custom XML entities are not supported");
    return text;
  };
  if (read("mimetype").trim() !== "application/epub+zip")
    throw new Error("Invalid EPUB mimetype");
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
  });
  const container = parser.parse(read("META-INF/container.xml"));
  const roots = container.container?.rootfiles?.rootfile;
  const opfPath = (Array.isArray(roots) ? roots[0] : roots)?.["@_full-path"];
  if (typeof opfPath !== "string") throw new Error("EPUB package not found");
  const pkg = parser.parse(read(opfPath)).package;
  const array = (v: any): any[] =>
    v === undefined ? [] : Array.isArray(v) ? v : [v];
  const manifest = new Map(
    array(pkg.manifest?.item).map((r: any) => [r["@_id"], r]),
  );
  const ordered = array(pkg.spine?.itemref);
  if (!ordered.length) throw new Error("EPUB has no readable spine");
  const pages: Page[] = [];
  for (const [i, item] of ordered.entries()) {
    const entry = manifest.get(item["@_idref"]);
    if (!entry) throw new Error("EPUB spine references a missing resource");
    const href = String(entry["@_href"]).split("#")[0];
    const partsPath = opfPath
      .split("/")
      .slice(0, -1)
      .concat(decodeURIComponent(href).split("/"));
    const clean: string[] = [];
    for (const part of partsPath) {
      if (part === "..") {
        if (!clean.length) throw new Error("Invalid EPUB resource path");
        clean.pop();
      } else if (part && part !== ".") clean.push(part);
    }
    const resource = clean.join("/");
    if (resource.startsWith("../") || resource.startsWith("/"))
      throw new Error("Invalid EPUB resource path");
    const xml = read(resource)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
    const nodes = new XMLParser({
      preserveOrder: true,
      ignoreAttributes: true,
    }).parse(xml);
    const parts: string[] = [];
    function collect(value: any) {
      if (Array.isArray(value)) {
        for (const child of value) collect(child);
      } else if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
          if (key === "#text") parts.push(String(child));
          else if (!["head", "script", "style"].includes(key)) collect(child);
        }
      }
    }
    collect(nodes);
    const text = parts.join("\n").trim();
    if (text)
      pages.push({
        page: 0,
        section: `EPUB spine ${i + 1} · ${resource}; verify chapter/section before use`,
        text,
      });
  }
  if (!pages.length) throw new Error("EPUB contains no extractable text");
  return { pages, status: "needs_review" };
}
