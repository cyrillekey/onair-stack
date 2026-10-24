import { Queue } from "bullmq";
import { config } from "@/config/index.js";
import { logger } from "@/utils/logger.js";
import { redisConnection } from "./redis.js";

export const STREAM_HEALTH_QUEUE = "stream-health";

export interface StreamHealthJobData {
  streamId: string;
  /**
   * The row's failureCount at the time this job was scheduled. A worker only
   * acts when the row still has this count, which makes retries idempotent.
   */
  expectedFailureCount: number;
}

let queue: Queue<StreamHealthJobData> | null = null;

export function getStreamHealthQueue(): Queue<StreamHealthJobData> {
  if (!queue) {
    queue = new Queue<StreamHealthJobData>(STREAM_HEALTH_QUEUE, {
      connection: redisConnection("producer"),
    });
    queue.on("error", (err) => {
      logger.error({ err }, "stream health queue error");
    });
  }
  return queue;
}

export function confirmationJobId(
  streamId: string,
  expectedFailureCount: number,
): string {
  return `stream-health:${streamId}:${expectedFailureCount}`;
}

/**
 * Ensure exactly one delayed confirmation job exists for the row's current
 * failure count. Re-adding an existing jobId is a no-op; a failed job is
 * removed first so a later cron sweep can retry it.
 */
export async function ensureConfirmationJob(
  streamId: string,
  expectedFailureCount: number,
  delayMs: number = config.STREAM_HEALTH_RETRY_DELAY_MS,
): Promise<boolean> {
  const q = getStreamHealthQueue();
  const jobId = confirmationJobId(streamId, expectedFailureCount);
  const existing = await q.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state !== "failed" && state !== "completed") return false;
    await existing.remove();
  }

  await q.add(
    "confirm",
    { streamId, expectedFailureCount },
    {
      jobId,
      delay: delayMs,
      attempts: 1,
      removeOnComplete: true,
      // Keep recent failures for debugging; the cron sweep removes and
      // re-adds a failed job when the row is still in the same state.
      removeOnFail: { age: 24 * 60 * 60, count: 1_000 },
    },
  );
  return true;
}

export async function closeStreamHealthQueue(): Promise<void> {
  if (!queue) return;
  await queue.close();
  queue = null;
}
