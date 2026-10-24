import type { ConnectionOptions } from "bullmq";
import { config } from "@/config/index.js";

/**
 * BullMQ connection options. Workers require `maxRetriesPerRequest: null` so
 * blocking commands can wait indefinitely. Producers should fail fast instead:
 * the next cron sweep re-enqueues anything that could not be added while Redis
 * was unavailable.
 */
export function redisConnection(
  kind: "worker" | "producer" = "worker",
): ConnectionOptions {
  return {
    url: config.REDIS_URL,
    maxRetriesPerRequest: kind === "worker" ? null : 1,
  };
}
