import cron from "node-cron";
import type { Logger } from "pino";
import { config } from "@/config/index.js";
import type { BaseCollector, CollectorContext } from "@/collectors/base.collector.js";

export interface ScheduledHandle {
  job: string;
  stop: () => void;
}

export function filterCollectors(all: BaseCollector[]): BaseCollector[] {
 return all.filter((c) => c.enabled);
}

function guardOverlap(job: string, log: Logger, fn: () => Promise<void>): () => void {
  let running = false;
  return () => {
    if (running) {
      log.warn({ job }, "previous run still in progress, skipping tick");
      return;
    }
    running = true;
    void fn().finally(() => {
      running = false;
    });
  };
}

export function startScheduler(
  collectors: BaseCollector[],
  buildCtx: () => CollectorContext,
  log: Logger,
): ScheduledHandle[] {
  const handles: ScheduledHandle[] = [];
  for (const collector of collectors) {
    if (!cron.validate(collector.schedule)) {
      log.error({ job: collector.name, schedule: collector.schedule }, "invalid cron expression, skipping");
      continue;
    }
    const tick = guardOverlap(collector.name, log, async () => {
      const result = await collector.run(buildCtx());
      if (result.error) log.error(result, "job failed");
    });
    const task = cron.schedule(
      collector.schedule,
      () => {
        tick();
      },
      { timezone: config.TZ },
    );
    log.info({ job: collector.name, schedule: collector.schedule }, "job scheduled");
    handles.push({
      job: collector.name,
      stop: () => {
        void task.stop();
      },
    });
  }
  return handles;
}

export async function runOnce(collectors: BaseCollector[], buildCtx: () => CollectorContext): Promise<void> {
  for (const collector of collectors) {
    await collector.run(buildCtx());
  }
}
