import type { Logger } from "pino";
import type { Contract } from "@/prisma/contract.js";
import type postgres from "@prisma/orm-postgres/runtime";
import { Temporal } from "temporal-polyfill";

export interface CollectResult<T = unknown> {
  job: string;
  fetched: number;
  stored: number;
  skipped?: number;
  durationMs: number;
  error?: string;
  streams?: T[];
}

export interface CollectorContext {
  db: ReturnType<typeof postgres<Contract>>;
  log: Logger;
  signal?: AbortSignal;
}

export abstract class BaseCollector<T = unknown> {
  abstract readonly name: string;
  /** Cron expression (node-cron, seconds field supported). */
  abstract readonly schedule: string;
  /** Set false to disable without removing the job. */
  readonly enabled = true;

  protected readonly batchSize = 50;

  abstract collect(
    ctx: CollectorContext,
  ): Promise<Omit<CollectResult<T>, "job" | "durationMs">>;

  protected chunk<U>(items: U[], size: number = this.batchSize): U[][] {
    const out: U[][] = [];
    for (let i = 0; i < items.length; i += size)
      out.push(items.slice(i, i + size));
    return out;
  }
  protected buildTemporalDate(date: Date) {
    const instant = Temporal.Instant.from(date.toISOString());
    return instant;
  }
  protected slugifyUrl(url: string) {
    return url
      .replace(/[^a-z0-9]/gi, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-+/, "")
      .replace(/-+$/, "");
  }
  protected slugify(str: string): string {
    return str
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+/, "")
      .replace(/-+$/, "");
  }

  async run(ctx: CollectorContext): Promise<CollectResult<T>> {
    const started = Date.now();
    const log = ctx.log.child({ job: this.name });
    try {
      log.info("collect started");
      const partial = await this.collect(ctx);
      const result: CollectResult<T> = {
        job: this.name,
        durationMs: Date.now() - started,
        ...partial,
      };
      log.info(
        { fetched: result.fetched, stored: result.stored },
        "collect finished",
      );
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error({ err }, "collect failed");
      return {
        job: this.name,
        fetched: 0,
        stored: 0,
        durationMs: Date.now() - started,
        error: message,
      };
    }
  }
}
