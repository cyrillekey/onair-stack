#!/usr/bin/env node

import "dotenv/config";
import "temporal-polyfill/global";
import { config } from "@/config/index.js";
import { getDb } from "@/db/client.js";
import { buildRegistry } from "@/jobs/registry.js";
import { filterCollectors, runOnce, startScheduler } from "@/jobs/scheduler.js";
import { logger } from "@/utils/logger.js";
import { v2 as cloudinary } from "cloudinary";
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});
// Worker entrypoint. Intentionally exposes NO HTTP port:
// collection is triggered by in-process cron (or a single
// RUN_ONCE pass when deployed as a Kubernetes CronJob).x
async function main(): Promise<void> {
  const all = buildRegistry();
  const collectors = filterCollectors(all);
  if (collectors.length === 0) {
    logger.warn("no collectors enabled, exiting");
    return;
  }

  const db = getDb();

  const buildCtx = () => ({ db, log: logger });

  if (config.RUN_ONCE) {
    logger.info(
      { jobs: collectors.map((c) => c.name) },
      "RUN_ONCE=true, running jobs once",
    );
    await runOnce(collectors, buildCtx);
    return;
  }

  startScheduler(collectors, buildCtx, logger);
  logger.info(
    { jobs: collectors.map((c) => `${c.name} (${c.schedule})`) },
    "collector running",
  );

  const shutdown = (signal: string) => {
    logger.info({ signal }, "shutting down");
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

void main().catch((err) => {
  logger.fatal({ err }, "collector failed to start");
  process.exit(1);
});

export default main;