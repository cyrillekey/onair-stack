import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  RUN_ONCE: z
    .string()
    .default("false")
    .transform((v) => v.toLowerCase() === "true"),
  TZ: z.string().default("UTC"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  HTTP_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
  HTTP_USER_AGENT: z.string().default("onair-collector/0.0.1"),
  NODE_ENV: z.string().default("development"),
  STREAM_HEALTH_CRON: z.string().default("*/30 * * * *"),
  SCHEDULE_CLEANUP_CRON: z.string().default("0 4 * * *"),
  SCHEDULE_RETENTION_DAYS: z.coerce.number().int().positive().default(4),
  STREAM_HEALTH_BATCH_SIZE: z.coerce.number().int().positive().default(20),
  STREAM_HEALTH_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  STREAM_HEALTH_DEEP_CHECK: z
    .string()
    .default("false")
    .transform((v) => v.toLowerCase() === "true"),
  STREAM_HEALTH_DELETE_AFTER_FAILURES: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(3),
  /** Delay before a BullMQ worker re-checks a stream that just failed. */
  STREAM_HEALTH_RETRY_DELAY_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 60 * 1000),
  /** How many confirmation jobs the BullMQ worker processes concurrently. */
  STREAM_HEALTH_WORKER_CONCURRENCY: z.coerce
    .number()
    .int()
    .positive()
    .default(10),
  /** Redis connection used by BullMQ for delayed stream-health checks. */
  REDIS_URL: z.string().min(1).default("redis://127.0.0.1:6379"),
  SENTRY_DSN: z.string().optional().default(""),
  SENTRY_ENVIRONMENT: z.string().optional().default(""),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  CRONITOR_API_KEY: z.string().optional().default(""),
  CRONITOR_ENVIRONMENT: z.string().optional().default(""),
  CRONITOR_REGION: z.string().optional().default(""),
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(""),
  CLOUDINARY_API_KEY: z.string().optional().default(""),
  CLOUDINARY_API_SECRET: z.string().optional().default(""),
  AXIOM_TOKEN: z.string().optional().default(""),
  AXIOM_REGION: z.string().optional().default("us-east-1.aws.edge.axiom.co"),
  AXIOM_DATASET: z.string().optional().default(""),
});

export type AppConfig = z.infer<typeof envSchema>;

function loadConfig(): AppConfig {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment config: ${details}`);
  }
  return { ...parsed.data };
}

export const config = loadConfig();
