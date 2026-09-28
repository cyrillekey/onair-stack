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
  HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  HTTP_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
  HTTP_USER_AGENT: z.string().default("onair-collector/0.0.1"),
  NODE_ENV: z.string().default("development"),
});

export type AppConfig = z.infer<typeof envSchema>

function loadConfig(): AppConfig {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment config: ${details}`);
  }
  return { ...parsed.data,  };
}

export const config = loadConfig();
