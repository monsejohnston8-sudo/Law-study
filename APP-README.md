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
