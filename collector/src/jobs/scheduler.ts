import nodeCron from "node-cron";

import type { Logger } from "pino";
import { config } from "@/config/index.js";
import monitor from "cronitor";
import type {
  BaseCollector,
  CollectorContext,
} from "@/collectors/base.collector.js";
import { reportError, reportMessage } from "@/utils/sentry.js";

const cron = monitor(config.CRONITOR_API_KEY);
cron.wraps(nodeCron);
export interface ScheduledHandle {
  job: string;
  stop: () => void;
}

export function filterCollectors(all: BaseCollector[]): BaseCollector[] {
  return all.filter((c) => c.enabled);
}

function guardOverlap(
  job: string,
  log: Logger,
  fn: () => Promise<void>,
): () => void {
  let running = false;
  return () => {
    if (running) {
      log.warn({ job }, "previous run still in progress, skipping tick");
      return;
    }
    running = true;
    void fn()
      .catch((err) => {
        // BaseCollector.run catches its own errors, so reaching here means
        // buildCtx() or an unexpected throw: always worth a Sentry event.
        log.error({ err, job }, "collector tick threw");
        reportError(err, { job, message: "collector tick threw" });
      })
      .finally(() => {
        running = false;
      });
  };
}

export function startScheduler(
  collectors: BaseCollector[],
  buildCtx: () => CollectorContext,
  log: Logger,
): ScheduledHandle[] {
  if (cron?.schedule === undefined) {
    throw new Error("Cronitor not loaded");
  }
  const handles: ScheduledHandle[] = [];
  for (const collector of collectors) {
    if (!nodeCron.validate(collector.schedule)) {
      log.error(
        { job: collector.name, schedule: collector.schedule },
        "invalid cron expression, skipping",
      );
      reportMessage("invalid cron expression, skipping job", "error", {
        job: collector.name,
        schedule: collector.schedule,
      });
      continue;
    }
    const tick = guardOverlap(collector.name, log, async () => {
      const result = await collector.run(buildCtx());
      if (result.error) {
        log.error(result, "job failed");
        reportMessage(`job failed: ${result.error}`, "error", {
          job: collector.name,
          fetched: result.fetched,
          stored: result.stored,
          durationMs: result.durationMs,
        });
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const task = cron.schedule(
      collector.name,
      collector.schedule,
      () => {
        tick();
      },
      { timezone: config.TZ },
    );
    log.info(
      { job: collector.name, schedule: collector.schedule },
      "job scheduled",
    );
    handles.push({
      job: collector.name,
      stop: () => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        void task?.stop();
      },
    });
  }
  return handles;
}

export async function runOnce(
  collectors: BaseCollector[],
  buildCtx: () => CollectorContext,
): Promise<{ job: string; error?: string }[]> {
  const outcomes: { job: string; error?: string }[] = [];
  for (const collector of collectors) {
    const result = await collector.run(buildCtx());
    if (result.error) {
      reportMessage(`job failed: ${result.error}`, "error", {
        job: collector.name,
        fetched: result.fetched,
        stored: result.stored,
        durationMs: result.durationMs,
      });
    }
    outcomes.push({ job: collector.name, error: result.error });
  }
  return outcomes;
}
