import * as Sentry from "@sentry/node";

export interface ErrorContext {
  /** Human-readable location, e.g. "StreamCollector.upsertRecord". */
  message?: string;
  /** Collector job name, set as a Sentry tag for filtering. */
  job?: string;
  /** Any extra structured fields, sent as Sentry extras. */
  [key: string]: unknown;
}

function splitContext({ message, job, ...extra }: ErrorContext): {
  tags?: Record<string, string>;
  extra: Record<string, unknown>;
} {
  return {
    tags: job ? { job } : undefined,
    extra: {
      ...extra,
      ...(message ? { context: message } : {}),
    },
  };
}

function normalizeError(err: unknown): Error {
  if (err instanceof Error) return err;
  if (typeof err === "string") return new Error(err);
  try {
    const seen = new Set<unknown>();
    return new Error(
      JSON.stringify(err, (_key: string, value: unknown) => {
        if (typeof value === "object" && value !== null) {
          if (seen.has(value)) return "[Circular]";
          seen.add(value);
        }
        return value as string | number | boolean | null | object | undefined;
      }) ?? String(err),
    );
  } catch {
    return new Error(String(err));
  }
}

/**
 * Capture an error to Sentry with job tag + extras.
 * Safe to call when Sentry is disabled (empty DSN): becomes a no-op
 * returning an empty event id. Always pair with a log call so
 * environments without Sentry still have the error in logs.
 */
export function reportError(err: unknown, ctx: ErrorContext = {}): string {
  const { tags, extra } = splitContext(ctx);
  return Sentry.captureException(normalizeError(err), {
    ...(tags ? { tags } : {}),
    ...(Object.keys(extra).length > 0 ? { extra } : {}),
  });
}

/** Capture a non-Error signal (safety trips, invalid cron, failed results). */
export function reportMessage(
  message: string,
  level: Sentry.SeverityLevel = "error",
  ctx: ErrorContext = {},
): string {
  const { tags, extra } = splitContext(ctx);
  return Sentry.captureMessage(message, {
    level,
    ...(tags ? { tags } : {}),
    ...(Object.keys(extra).length > 0 ? { extra } : {}),
  });
}

/** Flush buffered events before process exit. */
export async function flushSentry(timeoutMs = 5_000): Promise<void> {
  try {
    await Sentry.close(timeoutMs);
  } catch {
    // Never let flush failures mask the original error/exit path.
  }
}
