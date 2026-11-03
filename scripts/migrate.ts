// Run Prisma's official WASM migration engine and record normal Prisma migrations.
import "dotenv/config";
import { readFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { engine } from "./engine";
const schema = await readFile("prisma/schema.prisma", "utf8");
await mkdir("private", { recursive: true, mode: 0o700 });
const e = await engine(
  schema,
  process.env.DATABASE_URL ?? "file:./private/study.db",
);
const filters = { externalTables: [], externalEnums: [] };
try {
  if (process.argv.includes("--create-initial")) {
    const diff = await e.diff({
      from: { tag: "empty" },
      to: {
        tag: "schemaDatamodel",
        files: [{ path: "schema.prisma", content: schema }],
      },
      script: true,
      exitCode: false,
      filters,
    });
    if (!diff.stdout) throw new Error("Prisma returned no migration");
    await mkdir("prisma/migrations/202611030001_initial", { recursive: true });
    await writeFile(
      "prisma/migrations/202611030001_initial/migration.sql",
      diff.stdout,
    );
    await writeFile(
      "prisma/migrations/migration_lock.toml",
      'provider = "sqlite"\n',
    );
  }
  const dirs = (await readdir("prisma/migrations", { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));
  const result = await e.applyMigrations({
    filters,
    migrationsList: {
      baseDir: resolve("prisma/migrations"),
      lockfile: {
        path: "migration_lock.toml",
        content: await readFile(
          "prisma/migrations/migration_lock.toml",
          "utf8",
        ),
      },
      shadowDbInitScript: "",
      migrationDirectories: await Promise.all(
        dirs.map(async (d) => ({
          path: d.name,
          migrationFile: {
            path: "migration.sql",
            content: {
              tag: "ok" as const,
              value: await readFile(
                `prisma/migrations/${d.name}/migration.sql`,
                "utf8",
              ),
            },
          },
        })),
      ),
    },
  });
  console.log(result);
} finally {
  e.free();
}
