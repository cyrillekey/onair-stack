# onair-collector

Cron-driven scraper worker. Fetches JSON APIs and HTML pages, normalizes
records, and writes to Postgres. Exposes **no HTTP server** (no ingress/egress).

## Layout

```
src/
  main.ts                  # entrypoint: cron scheduler or RUN_ONCE pass
  config/index.ts          # zod-validated env (cron exprs, timeouts, TZ)
  db/
    client.ts              # Prisma postgres client (contract-driven, cf. huddle)
    repositories/          # persistence boundary (collectors never touch Prisma directly)
      channel.repository.ts
  collectors/
    base.collector.ts      # BaseCollector: name, schedule, collect(), overlap-safe run()
    json.collector.ts      # fetch -> zod -> normalize -> persist template
    html.collector.ts      # fetch -> cheerio -> normalize -> persist template
    example-json.collector.ts
    example-html.collector.ts
  jobs/
    registry.ts            # add new collectors here
    scheduler.ts           # node-cron wiring, overlap guard, runOnce()
  utils/
    http.ts                # fetchJson/fetchHtml with timeout + UA + retry
    retry.ts               # exponential backoff helper
    logger.ts              # pino
```

## Add a source

1. Duplicate `src/collectors/example-json.collector.ts` (or `-html`) and set
   `name`, `schedule`, `sourceUrl`, plus zod schema / cheerio selectors.
2. Register it in `src/jobs/registry.ts`.
3. Set its cron via env (`JSON_COLLECT_CRON`, `HTML_COLLECT_CRON`, or a custom var).

## Run

```bash
cp .env.example .env
npm install
npm run dev            # long-running scheduler
npm run dev:once       # RUN_ONCE=true: run all enabled jobs once and exit
npm run build && npm start
```

`ENABLED_JOBS="example-json"` limits which jobs run. Deploy `start:once`
as a Kubernetes CronJob if you prefer external scheduling over in-process cron.

## DB

Same Prisma 8 contract pattern as `huddle`: define tables in
`src/prisma/contract.prisma`, run `prisma contract emit`, then implement
`ChannelRepository` against the generated client.
