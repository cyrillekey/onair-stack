# Onair

**Onair** is a self-hosted [Stremio](https://www.stremio.com/) addon for live TV. It serves channels, verified streams and a native EPG programme guide from PostgreSQL, so you can browse a personalised lineup in Discover or open the TV guide and press play without leaving Stremio.

Onair is the HTTP layer of the [onair-stack](https://github.com/cyrillekey/onair-stack) project. A companion **collector** worker crawls public IPTV playlists, broadcaster APIs and EPG feeds, verifies every stream and writes the results to the shared database. The addon only reads from Postgres — it never scrapes.

```
sources (m3u playlists / broadcaster APIs / EPG feeds)
  -> collector (fetch -> verify -> normalise -> upsert Postgres)
  -> onair     (catalog / meta / stream + EPG reads)
  -> Stremio client
```

## Features

- **Live TV catalogs** — Stremio `tv` catalogs grouped by genre, filterable by country and paginated with `skip`.
- **Configurable lineups** — pick countries, genres and a timezone from the `/configure` page. Each install gets its own manifest and catalog rails.
- **Native EPG** — catalog requests with a `date` extra return `metasDetailed` for the guide grid; channel metadata includes the current and upcoming programmes; EPG video ids resolve back to the channel's live streams.
- **Stream health** — the stream picker marks sources from the collector's health checks (🟢 healthy, 🔴 failing).
- **Fast reads** — an in-process LRU cache for user configurations, plus cache headers tuned per Stremio resource.
- **REST API** — channels, schedules and streams endpoints with an OpenAPI reference at `/api/documentation`.
- **Ops-ready** — health probes, graceful shutdown, structured logging, a multi-stage Dockerfile and deployment configs for Cloud Run, Cloudflare and Heroku-style buildpacks.

## Tech stack

- Node.js 26, TypeScript, Fastify 5
- PostgreSQL 15+ through the Prisma 8 ORM contract (`@prisma/orm-postgres`)
- EJS templates, LRU cache, Pino logging
- OpenAPI via `@fastify/swagger` with a Scalar API reference

## Getting started

### Prerequisites

- Node.js 26 (see `.nvmrc`)
- PostgreSQL 15+
- A populated database — run the collector, or point `DATABASE_URL` at an existing onair database

### Install

```bash
git clone https://github.com/cyrillekey/onair-addon.git
cd onair-addon
npm install
cp .env.example .env
```

Set `DATABASE_URL`, and set `CENTRAL_URL` to the public origin of this addon (for example `http://localhost:8080`). `CENTRAL_URL` is used to build the `/<id>/manifest.json` install links returned by the configure API — without it, generated links are incomplete.

If the database is empty, create the schema from the contract:

```bash
npx prisma db init
```

### Run

```bash
npm run dev
```

Open [http://localhost:8080/configure](http://localhost:8080/configure) (or the `PORT` in `.env`), build a lineup, and paste the returned manifest URL into Stremio's **Install addon** dialog. If `PORT` is unset, the Fastify CLI falls back to `3000`.

For production:

```bash
npm run build
npm start
```

`npm start` runs the compiled server from `dist/src/server.js`.

## Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | — | PostgreSQL connection string. |
| `CENTRAL_URL` | recommended | — | Public origin of the addon, used to build install links and page URLs. |
| `PORT` | no | `8080` | HTTP port. |
| `HOST` | no | `0.0.0.0` | Interface to bind. Use `127.0.0.1` for local-only access. |
| `FASTIFY_CLOSE_GRACE_DELAY` | no | `10000` | Milliseconds to drain in-flight requests on shutdown. |
| `LOGO_URL` | no | default artwork | Logo shown on the Stremio addon page. |
| `STREMIO_SIGNATURE` | no | empty | Signature for the `stremio-addons.net` manifest block. |

> The `SENTRY_*` entries still present in `.env.example` are legacy: the Sentry integration has been removed and those values are no longer read.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start Fastify in watch mode with `tsx`; loads `.env` and listens on `PORT` (or `3000`). |
| `npm run build` | Compile TypeScript to `dist/` with `tsc` and rewrite path aliases with `tsc-alias`. |
| `npm start` | Run the compiled server. |
| `npm run typecheck` | Type-check without emitting. |
| `npm run lint` | Run ESLint. |
| `npm run emit` | Regenerate the Prisma contract artifacts (`contract.json`, `contract.d.ts`). |

## Stremio endpoints

The addon implements the Stremio addon protocol for `tv` with the `catalog`, `meta` and `stream` resources.

| Route | Purpose |
| --- | --- |
| `GET /manifest.json` | Default manifest (`community.onair`). |
| `GET /:id/manifest.json` | Personalised manifest for a saved lineup. `?home=0` or `?home=1` overrides the stored home flag. |
| `GET /:id/catalog/:type/:catalog.json` | First catalog page (100 channels). |
| `GET /:id/catalog/:type/:catalog/:extraArgs.json` | Catalog page with extras: `skip`, `genre` (country) or `date` (native EPG guide). |
| `GET /:id/meta/:type/:metaId.json` | Channel details plus the programmes airing over the next ~46 hours. |
| `GET /:id/stream/:type/:catalogId.json` | Stream sources for a channel or an EPG programme. |

`type` is always `tv`. Catalog ids are lowercase genre names such as `news`, `sports` or `movies`. Channel ids returned by the addon are namespaced with the `onair:` prefix; incoming meta and stream requests have that prefix stripped, and legacy unprefixed ids are still accepted. An EPG video id has the form `onair:<channelId>:epg:<startTime>` (the old `<channelId>:epg:<startTime>` form also works) and resolves to the channel's live streams.

## Configuration API

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/configure` | Lineup builder page. |
| `POST` | `/configure` | Create a user and configuration; returns `{ success, manifest }`. |
| `PUT` | `/configure/:id` | Update a lineup by user id; returns the manifest URL. |
| `GET` | `/:id/configure` | Legacy editor page for an existing lineup. |

Request body for create/update:

```json
{
  "username": "living-room",
  "timezone": "Europe/London",
  "countries": ["United Kingdom"],
  "categories": ["NEWS", "SPORTS"],
  "showOnHome": true
}
```

`username` and `timezone` are required. At least one country or genre must be selected. An empty `countries` list means all countries; an empty `categories` list means all genres.

## REST API

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/channels` | List channels. Filters: `country`, `category`, `search`, `limit`, `offset`. |
| `GET` | `/api/channels/:id` | Get a channel by id. |
| `GET` | `/api/schedules` | Schedule entries for a channel. `channelId` is required; optional `date` (`YYYY-MM-DD`), `limit`, `offset`. |
| `GET` | `/api/schedules/:id` | Get a schedule entry by id. |
| `GET` | `/api/streams` | Streams for a channel. `channelId` is required; optional `language`, `resolution`, `limit`, `offset`. |
| `GET` | `/api/streams/:id` | Get a stream by id. |
| `GET` | `/api/documentation` | Scalar OpenAPI reference. |
| `GET` | `/health`, `/health/ready` | Health probes for load balancers and container platforms. |

## Database

The schema lives in `src/prisma/contract.prisma` and is shared with the collector — keep both copies identical. After changing the contract:

```bash
npm run emit          # regenerate contract.json + contract.d.ts
npx prisma db update  # apply the schema changes to the database
```

The data model is small:

- **User** — one row per install (`name`, `country`).
- **Configuration** — one-to-one with a user: `countries`, `categories`, `timezone`, `showInHome`.
- **Channel** — `name`, unique `slug` per `country`, `category`, `poster`, `description`.
- **Stream** — `url`, `language`, `resolution`, plus `failureCount` / `unreachableAt` health markers.
- **Schedule** — programme `name`, `poster`, `description`, `date`, `startTime`, `endTime`, linked to a channel.

`Channel.category` is an enum with 42 values. `ADULT` and `SCIENTOLOGY` are defined in the contract but not exposed as Stremio catalogs.

## Docker

```bash
docker build -t onair .
docker run --rm -p 8080:8080 --env-file .env onair
```

The image builds the TypeScript output in a builder stage, installs production-only dependencies, and runs as the non-root `node` user. It expects `DATABASE_URL` at runtime.

For a full stack with Postgres and the collector, see the [onair-stack repository](https://github.com/cyrillekey/onair-stack) and its `docker-compose.yml`.

## Project structure

```
src/
  server.ts        # entrypoint: listen + graceful shutdown
  app.ts           # Fastify app: Swagger, CORS, autoload
  config/          # environment config + builder options (countries, genres, timezones)
  plugins/         # Prisma client, config cache, EJS, sensible
  routes/
    root.ts        # /, /manifest.json, /health
    configure/     # lineup builder page + create/update API
    :id/           # per-user Stremio routes (manifest, catalog, meta, stream, configure)
    api/           # REST: channels, schedules, streams
  prisma/          # contract.prisma, generated contract, Postgres client
  templates/       # EJS home and configure pages
  utils/           # EPG mapping, catalog helpers, serialisation
```

## License

ISC — see `package.json`.
