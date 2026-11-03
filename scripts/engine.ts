import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { bindMigrationAwareSqlAdapterFactory } from "@prisma/driver-adapter-utils";
import * as runtime from "@prisma/schema-engine-wasm/schema_engine_bg";
const require = createRequire(import.meta.url);
export async function engine(schema: string, url: string) {
  const bytes = await readFile(
    require
      .resolve("@prisma/schema-engine-wasm")
      .replace("schema_engine.js", "schema_engine_bg.wasm"),
  );
  const module = await WebAssembly.compile(bytes);
  const instance = await WebAssembly.instantiate(module, {
    "./schema_engine_bg.js": runtime,
  });
  runtime.__wbg_set_wasm(instance.exports);
  (instance.exports.__wbindgen_start as () => void)();
  return runtime.SchemaEngine.new(
    { datamodels: [["schema.prisma", schema]] },
    () => {},
    bindMigrationAwareSqlAdapterFactory(new PrismaBetterSqlite3({ url })),
  );
}
