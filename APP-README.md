# Casebook

A law-school study workspace with a local desktop edition and an iPhone Home Screen web app.

The iPhone edition stores study records and imported document blobs on the device using IndexedDB. The hosted site contains application code, starter curriculum maps, and a shared catalog of original concise study explanations. Uploaded textbooks, extracted textbook passages, personal study databases, credentials, and private backup archives are excluded from this repository and the deployment artifact. The shared catalog includes references and edition limits, not the books.

## Publish the iPhone app

The GitHub Pages workflow builds and deploys only `phone-dist/` when `main` is updated. It also supports manual runs under Actions → Publish iPhone app shell. GitHub Pages availability depends on repository/account settings. A successful deployment reports the actual HTTPS address.

Open that HTTPS address in Safari, then choose Share → Add to Home Screen. Shared notes and mini-exam questions load automatically when the app opens. Users may also upload their own materials or import a private Casebook study ZIP from Files in Settings & backup. The private ZIP is separate from this public repository and is processed locally, without uploading its contents to the host. Keep backups; browser storage can be cleared, and separate devices do not automatically sync.

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
They use up to five answer-bearing, source-linked flashcards from that module. Personal questions are selected first; the question picker can mix shared and personal material. Saved exams retain their selected question IDs.
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


## Personal AI notes and questions

In Import sources, upload a supported document and assign its course/module.
Check the AI setup option during upload, or inspect the source and choose
**AI summary, notes & exam questions**. Connect a personal OpenAI API key,
choose a passage and concise summary or in-depth notes, and explicitly opt in
to sending that displayed passage to OpenAI. Long sections are divided into
12,000-character parts; each run covers only the selected part. Additional parts
can be processed separately. Scanned files require usable extraction or OCR.

The app calls OpenAI Responses (`gpt-4.1-mini`) directly with `store: false`.
Users pay their own API usage, separate from ChatGPT subscriptions. Keys remain
in tab memory, clear on reload, and are never written to browser storage,
backups, the repository, or this site's host. Disconnect clears the session key.
The site has no shared provider key, AI server, account system, or shared AI bill.
OpenAI receives selected text under the user's opt-in and its provider policies.

Generated output is schema validated. Each note/question must identify the real
selected excerpt and contain a matching short evidence span. Uploaded text is
explicitly treated as untrusted reference data. Evidence matching is a provenance
check, not verification of the model's legal analysis. All output remains a draft.
Review the preview, choose questions, and confirm before saving. Notes and
questions are added atomically only to the user's local collection and backups;
they are never added to the public shared catalog. Missing credentials or an AI
error does not disable uploads, manual notes, existing exams, or other features.

The public catalog (`src/content/shared-study.json`) contains 53 original study
summaries/questions, 31 detailed guides, and 36 case briefs across supported modules. Its references
include explicit source/edition limits. Original source text and original files
are not part of the catalog. Mobile catalog upgrades add missing records without
replacing personal edits, review schedules, or exam responses.

AI integration tests use mocked provider responses and original nonlegal fixtures.
They verify request structure, consent, evidence rejection, errors, save confirmation,
privacy between browser stores, and question persistence. A billed live-provider
request requires a user's own valid key and has not been run in this workspace.

## Assigned-reading companions (draft update)

The expanded catalog includes 31 detailed module guides (about 7,400 words),
53 shorter topic notes/questions, 36 structured case briefs, and 45 module reading
records. Each guide supplies explanations, distinctions, case comparisons,
exam-analysis steps, references, and scope limitations. Reading lists are not
completion marks. The app puts detailed notes before short notes, completed briefs
before unfilled placeholders, and hides a redundant empty case placeholder when
an available brief has the same normalized name. Visible course/module labels use
names and module numbers; database identifiers are preserved for existing progress.

`src/content/reading-guides.json` maps the supplied outline assignments to source
availability. Constitutional Law has supplied detailed notes for four modules,
but most original assigned opinions are absent. The supplied Criminal Procedure
casebook is supplemental to the assigned seventh-edition treatise. Business
Organizations has the assigned Cox fifth edition and an earlier Macey casebook.
Those differences are labeled rather than treating substitute books as complete
assigned readings. Original book text is kept out of shared app assets.

The mobile catalog upgrade adds missing study records without replacing edits or
progress. For desktop, `npm run db:seed` now installs the reading companions as
well as the curriculum. An existing seeded desktop database can also run
`node --import tsx scripts/seed-reading-content.ts` additively. Catalog entries
remain review drafts. This update is local and has not been published.
