# Casebook

A law-school study workspace with a local desktop edition and an iPhone Home Screen web app.

The iPhone edition stores study records and imported document blobs on the device using IndexedDB. The hosted site contains only application code and starter curriculum maps. No uploaded textbooks, extracted textbook text, study databases, credentials or private backup archives are included in this repository or the deployment artifact.

## Publish the iPhone app

The GitHub Pages workflow builds and deploys only `phone-dist/` when `main` is updated. It also supports manual runs under Actions → Publish iPhone app shell. GitHub Pages availability depends on repository/account settings. A successful deployment reports the actual HTTPS address.

Open that HTTPS address in Safari, then choose Share → Add to Home Screen. Import a private Casebook study ZIP from Files in Settings & backup after opening the installed app. The private ZIP is separate from this public repository and is processed locally, without uploading its contents to the host. Keep backups; browser storage can be cleared, and separate devices do not automatically sync.

## Develop

Use Node.js 24 LTS and npm 11:

```sh
npm ci
npm run build:phone
npm run preview:phone
```

The desktop server uses Prisma/SQLite. For a new local database, copy `.env.example` to `.env`, then run `npm run db:migrate`, `npm run db:seed`, and `npm run dev`. Preserve existing configuration and private files.

## Validate

```sh
npm run lint
npm test
npm run test:phone
npm run test:ui
npm run build
```

The phone tests use original, nonlegal fixtures and an iPhone viewport in Chromium. Physical iPhone/Safari installation requires a device check after deployment. The app preserves missing legal answers as missing; it does not fabricate textbook content.

Mini module exams appear as the last module tab and in the overview toolkit.
They use up to five answer-bearing, source-linked flashcards from that module.
Learners save a draft, submit short answers, and compare against the source
explanations. Draft material is labeled; exams do not automatically grade legal
answers. Saved exam responses remain on the device and are included in backups.
Modules without supported questions show a missing-materials message.

On iPhone, Settings & backup → Add study materials merges a private study ZIP.
The default keeps existing writing, exam responses, review schedules, attempts,
and mastery progress. Full replacement remains a separate, explicit restore option.
Export a private backup periodically because browser storage can be cleared.

For local private curation, `scripts/import-study-drafts.ts` accepts a private JSON
file containing summaries, questions, case briefs, and exact ranges into existing
source excerpts. It imports review drafts idempotently without overwriting work.
Never commit the input or include private study packages in the public app build.
