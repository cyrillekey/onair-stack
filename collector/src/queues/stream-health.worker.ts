import { Worker } from "bullmq";
import { config } from "@/config/index.js";
import { getDb } from "@/db/client.js";
import { logger } from "@/utils/logger.js";
import { reportError } from "@/utils/sentry.js";
import { redisConnection } from "./redis.js";
import {
  ensureConfirmationJob,
  STREAM_HEALTH_QUEUE,
  type StreamHealthJobData,
} from "./stream-health.queue.js";
import { type Contract } from "@/prisma/contract.js";
import { type PostgresClient } from "@prisma/orm-postgres/runtime";
import { type Logger } from "pino";
import { verifyM3U8 } from "@/utils/url.js";

let worker: Worker<StreamHealthJobData> | null = null;

/** Start the in-process BullMQ worker that confirms failing streams. */
export function startStreamHealthWorker(): Worker<StreamHealthJobData> {
  if (worker) return worker;

  const db = getDb();
  worker = new Worker<StreamHealthJobData>(
    STREAM_HEALTH_QUEUE,
    async (job) => processStreamHealthJob(job.data, { db, log: logger }),
    {
      connection: redisConnection(),
      concurrency: config.STREAM_HEALTH_WORKER_CONCURRENCY,
    },
  );

  worker.on("completed", (job, result) => {
    logger.debug(
      { jobId: job.id, streamId: job.data.streamId, result },
      "stream health confirmation completed",
    );
  });
  worker.on("failed", (job, err) => {
    logger.error(
      { err, jobId: job?.id, streamId: job?.data.streamId },
      "stream health confirmation failed",
    );
    reportError(err, {
      job: "StreamHealthWorker",
      message: "stream health confirmation failed",
      jobId: job?.id,
      streamId: job?.data.streamId,
    });
  });
  worker.on("error", (err) => {
    logger.error({ err }, "stream health worker error");
    reportError(err, {
      job: "StreamHealthWorker",
      message: "stream health worker error",
    });
  });

  logger.info(
    {
      queue: STREAM_HEALTH_QUEUE,
      concurrency: config.STREAM_HEALTH_WORKER_CONCURRENCY,
    },
    "stream health worker started",
  );
  return worker;
}

export async function stopStreamHealthWorker(): Promise<void> {
  if (!worker) return;
  const current = worker;
  worker = null;
  await current.close();
  logger.info("stream health worker stopped");
}

async function processStreamHealthJob(
  data: StreamHealthJobData,
  ctx: { db: PostgresClient<Contract>; log: Logger<never, boolean> },
): Promise<void> {
  const stream = await ctx.db.orm.public.Stream.whereUnique({
    id: data.streamId,
  }).first();
  if (!stream) return;
  const health = await verifyM3U8(stream.url, { deepCheck: true });
  if (health.isPlayable || health.isValid) {
    await ctx.db.orm.public.Stream.where({ id: data.streamId }).update({
      failureCount: 0,
      lastFailureReason: null,
      unreachableAt: null,
    });
    ctx.log.info({ streamId: data.streamId }, "stream health confirmed");
  } else {
    if (stream.failureCount == 3) {
      // 3 consecutive failures; mark as unreachable
      await ctx.db.orm.public.Stream.where({ id: data.streamId }).deleteAll();
      ctx.log.info(
        { streamId: data.streamId },
        "stream deleted after 3 consecutive failures",
      );
    } else {
      // update failure count
      await ctx.db.orm.public.Stream.where({ id: data.streamId }).update({
        failureCount: stream.failureCount + 1,
        lastFailureReason: health.playabilityStatus,
      });
      // requeue
      await ensureConfirmationJob(
        data.streamId,
        stream.failureCount + 1,
        config.STREAM_HEALTH_RETRY_DELAY_MS,
      );
      ctx.log.info(
        { streamId: data.streamId, failureCount: stream.failureCount + 1 },
        "stream health failed",
      );
    }
  }
}
