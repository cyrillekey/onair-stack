import type { Logger } from "pino";
import type { ChannelRepository } from "@/db/repositories/channel.repository.js";

export interface CollectResult {
  job: string;
  fetched: number;
  stored: number;
  skipped?: number;
  durationMs: number;
  error?: string;
}

export interface CollectorContext {
  db: unknown;
  channels: ChannelRepository;
  log: Logger;
  signal?: AbortSignal;
}

export abstract class BaseCollector {
  abstract readonly name: string;
  /** Cron expression (node-cron, seconds field supported). */
  abstract readonly schedule: string;
  /** Set false to disable without removing the job. */
  readonly enabled = true;

  protected readonly batchSize = 50;

  abstract collect(ctx: CollectorContext): Promise<Omit<CollectResult, "job" | "durationMs">>;

  protected chunk<T>(items: T[], size: number = this.batchSize): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
  }

  async run(ctx: CollectorContext): Promise<CollectResult> {
    const started = Date.now();
    const log = ctx.log.child({ job: this.name });
    try {
      log.info("collect started");
      const partial = await this.collect(ctx);
      const result: CollectResult = {
        job: this.name,
        durationMs: Date.now() - started,
        ...partial,
      };
      log.info({ fetched: result.fetched, stored: result.stored }, "collect finished");
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error({ err }, "collect failed");
      return { job: this.name, fetched: 0, stored: 0, durationMs: Date.now() - started, error: message };
    }
  }
}
