import type { Logger } from "pino";
import type { Contract } from "@/prisma/contract.js";
import type postgres from "@prisma/orm-postgres/runtime";
import { Temporal } from "temporal-polyfill";
import { reportError } from "@/utils/sentry.js";
import {
  StreamMatcher,
  type StreamMatcherConfig,
} from "@/matching/stream.matcher.js";
import { createHash } from "node:crypto";
import similarity from "similarity";

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

  protected readonly batchSize = 200;

  /** Configuration for stream-to-channel matching. Override in subclasses for custom behavior. */
  protected streamMatcherConfig: Partial<StreamMatcherConfig> = {
    minConfidence: 0.75,
    requireVariantMatch: true,
    allowVariantSubset: true,
  };

  private _matcher: StreamMatcher | null = null;
  protected get streamMatcher(): StreamMatcher {
    if (!this._matcher) {
      this._matcher = new StreamMatcher(this.streamMatcherConfig);
    }
    return this._matcher;
  }

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
  protected slugifyUrl(url: string, channelId: string): string {
    return createHash("sha256")
      .update(`${url}:${channelId}`, "utf8")
      .digest("hex");
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
  /**
   * Performs a fuzzy match between two names to determine if they are similar or close
   * @param a name to compare (stream name)
   * @param b name to compare (channel name)
   *
   * @returns boolean do they match
   */
  protected fuzzyMatch(a: string, b: string): boolean {
    return this.streamMatcher.match(a, b).matched;
  }

  /**
   * Get the match confidence score for ranking multiple candidates
   * @param a stream name
   * @param b channel name
   * @returns confidence 0-1
   */
  protected matchConfidence(a: string, b: string): number {
    // return this.streamMatcher.match(a, b).confidence;
    return this.rudimentaryCompare(a, b);
  }

  /**
   * Find the best matching channel from a list
   * @param streamName stream name to match
   * @param channelNames array of channel names
   * @returns best match or null
   */
  protected findBestMatch(
    streamName: string,
    channelNames: string[],
  ): { channel: string; confidence: number } | null {
    const result = this.streamMatcher.findBestMatch(streamName, channelNames);
    if (!result) return null;
    return { channel: result.channel, confidence: result.result.confidence };
  }
  protected getUniqueArray<X>(arr: X[]) {
    return Array.from(new Set(arr));
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
      reportError(err, { job: this.name, message: "collect failed" });
      return {
        job: this.name,
        fetched: 0,
        stored: 0,
        durationMs: Date.now() - started,
        error: message,
      };
    }
  }
  protected formatName(name: string) {
    return name?.split("(")?.at(0)?.trim() ?? name;
  }
  private rudimentaryCompare(a: string, b: string): number {
    const tokensa = a.split(" ");
    const tokensb = b.split(" ");
    const numa = tokensa?.filter((a) => !Number.isNaN(Number.parseInt(a)));
    const numb = tokensb?.filter((a) => !Number.isNaN(Number.parseInt(a)));

    if (numa.length != numb.length) return 0;

    if (numa.toLocaleString() != numb.toLocaleString()) return 0;

    return similarity(a.toLowerCase(), b.toLowerCase());
  }
}
