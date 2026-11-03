// Generate the engine-free client using Prisma's pinned official generator registry.
// No native engine is fetched or used, and npm package integrity remains enforced.
import internals from "@prisma/internals";
import * as registry from "@prisma/client-generator-registry";
const generators = await internals.getGenerators({
  schemaPath: "prisma/schema.prisma",
  registry: registry.defaultRegistry.toInternal(),
  skipDownload: true,
  cliCommand: "npm run db:generate",
});
try {
  for (const generator of generators) await generator.generate();
} finally {
  for (const generator of generators) generator.stop();
}
