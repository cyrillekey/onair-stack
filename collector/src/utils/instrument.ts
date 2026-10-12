import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

// Side-effect module: import for its init, before any other app imports.
// Mirrors `onair/src/utils/instrument.ts` so both services report the same way.
// An empty/unset SENTRY_DSN leaves the SDK disabled (no-op captures).
function tracesSampleRate(): number {
  const raw = Number(process.env["SENTRY_TRACES_SAMPLE_RATE"] ?? 1);
  if (!Number.isFinite(raw)) return 1;
  return Math.min(1, Math.max(0, raw));
}

Sentry.init({
  dsn: process.env["SENTRY_DSN"] || undefined,
  environment:
    process.env["SENTRY_ENVIRONMENT"] ||
    process.env["NODE_ENV"] ||
    "development",
  integrations: [
    nodeProfilingIntegration(),
    Sentry.consoleLoggingIntegration({
      levels: ["log", "warn", "error", "debug", "info", "trace"],
    }),
  ],
  // Tracing
  tracesSampleRate: tracesSampleRate(),
  // Set sampling rate for profiling - this is evaluated only once per SDK.init call
  profileSessionSampleRate: 1.0,
  // Trace lifecycle automatically enables profiling during active traces
  profileLifecycle: "trace",
});

Sentry.setTag("service", "onair-collector");

export default Sentry;
