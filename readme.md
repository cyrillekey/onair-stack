# onair-stack

Live TV for Stremio, split into two services sharing one Postgres schema.

```
onair-stack/
  onair/      # Stremio addon HTTP server (serves catalog / meta / stream)
  collector/  # Cron-driven scraper worker (fills Postgres, exposes no HTTP)
```

Both services use the same Prisma 8 contract (`src/prisma/contract.prisma`):

- `Channel` — name, slug, country, category (`SPORTS | NEWS | ENTERTAINMENT | GENERAL`), poster, `externalId` (online-television.com key)
- `Stream` — `channelId`, name, slug, `url` (verified m3u8), resolution, `youtubeId`
- `Schedule` — `channelId`, program name, poster, date, start/end time

## onair

Stremio addon backend. Exposes a standard Stremio manifest over HTTP and reads only from Postgres — it never scrapes directly.

- `src/server.ts`: `serveHTTP(addonInterface, { port })` entrypoint.
- `src/addon.ts`: defines the addon:
  - Manifest `community.onair` with `catalog`, `stream`, `meta` resources, type `tv`.
  - `defineCatalogHandler`: catalogs `ENTERTAINMENT`, `GENERAL`, `NEWS`, `SPORTS`. Queries `Channel` by `category`, filters to channels with ≥1 stream, returns Stremio metas (poster/logo with Cloudinary fallback).
  - `defineMetaHandler`: single-channel lookup by id.
  - `defineStreamHandler`: all `Stream` rows for a `channelId` → `{ url, name, title (resolution) }`.
- Observability via Sentry metrics (`catalog-request`, `catalog-meta-request`, `catalog-stream-request`).
- Config via env: `DATABASE_URL`, `LOGO_URL`, `SENTRY_DSN`, Cloudinary keys.
- Dockerized (`onair/Dockerfile`), exposes `8080`, `CMD ["node", "dist/src/server.js"]`.

Run:

```bash
cd onair
cp .env.example .env
npm install
npm run dev    # tsx watch src/server.ts
npm run build && npm start
```

## collector

Background worker that keeps `Channel` / `Stream` / `Schedule` fresh. Exposes **no HTTP server** — scheduling is in-process `node-cron` or a one-shot `RUN_ONCE=true` pass (suitable for a Kubernetes CronJob).

Active jobs (`src/jobs/registry.ts`):

1. `ScheduleCollector` (`15 00 * * *`) — scrapes `online-television.com/tv-channel/<externalId>/?pgday=YYYY-MM-DD` with cheerio, parses `.tv-program-item` entries (title, start/end time, poster), bulk-inserts daily `Schedule` rows per channel.
2. `StreamsCollector` (`* 00,08,16 * * *`) — iterates ~36 US `iptv-org/iptv` m3u playlists, parses with `parseM3U`, drops geo-blocked entries, verifies each m3u8 is actually playable (`verifyM3U8`, 10s timeout, records resolution), fuzzy-matches stream names to existing channel slugs (`similarity > 0.8`), and upserts `Stream` on `slug` conflict.

Supporting / currently disabled code:

- `IPTVCollector` — helper used by `StreamsCollector` for fetch → filter → verify.
- `FamelackCollecter` — fetches `famelack-data` country JSON (zod-validated), verifies HLS streams, passes YouTube embeds through; currently commented out in the registry.
- `src/prisma/channels.ts` — one-off bootstrap script that scrapes `online-television.com/tv-channels/page/<n>/` (16 pages) for channel name/country/logo/`externalId` and seeds `Channel`.

Infra: `BaseCollector` (`name`, `schedule`, `collect()`, overlap-safe `run()`), `jobs/scheduler.ts` (cron wiring, `ENABLED_JOBS` filter), zod-validated env (`DATABASE_URL`, `RUN_ONCE`, `TZ`, `LOG_LEVEL`, `HTTP_TIMEOUT_MS/MAX_RETRIES/USER_AGENT`), pino logging, Cloudinary config for poster uploads.

Run:

```bash
cd collector
cp .env.example .env
npm install
npm run dev         # long-running scheduler
npm run dev:once    # RUN_ONCE=true: run all enabled jobs once and exit
npm run build && npm start
npm run start:once  # production one-shot (K8s CronJob)
```

## Data flow

```
iptv-org m3u / online-television.com / famelack JSON
        -> collector (fetch -> verify -> normalize -> upsert Postgres)
        -> onair (Stremio catalog/meta/stream reads Postgres)
        -> Stremio client
```
