import { rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
await rm("private/ui-test.db", { force: true });
await rm("private/ui-store", { recursive: true, force: true });
for (const file of ["scripts/migrate.ts", "prisma/seed.ts"]) {
  const result = spawnSync(process.execPath, ["--import", "tsx", file], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: "file:./private/ui-test.db" },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
