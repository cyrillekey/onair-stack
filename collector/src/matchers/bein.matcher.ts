import {
  BaseCollector,
  type CollectorContext,
  type CollectResult,
} from "@/collectors/base.collector.js";
import Sentry from "@/utils/instrument.js";

export interface BeinStream {
  url: string;
  name: string;
  type: "USA" | "MENA";
}

class BeinMatcher extends BaseCollector {
  schedule = "-";
  name = "BeinMatcher";
  
  // Strict matching for beIN: no subset matching, higher confidence threshold
  protected streamMatcherConfig = {
    minConfidence: 0.85,
    requireVariantMatch: true,
    allowVariantSubset: false, // "beIN Sports 1" must match "beIN Sports 1" exactly
  };

  private streams: BeinStream[];
  constructor(streams: BeinStream[]) {
    super();
    this.streams = streams;
  }
  async collect(
    ctx: CollectorContext,
  ): Promise<Omit<CollectResult<unknown>, "job" | "durationMs">> {
    try {
      ctx.log.info(`Bein matcher invoked with ${this.streams.length} streams`)
      const _channels = await ctx.db.orm.public.Channel.where((c) =>
        c.slug.like("bein%"),
      ).all();
      let stored = 0
      const [usa, mena] = [
        this.streams.filter((a) => a.type == "USA"),
        this.streams.filter((a) => a.type == "MENA"),
      ];
      const [usaChannels, menaChannels] = [
        _channels.filter(
          (a) => a.country == "USA" || a.country == "United States",
        ),
        _channels.filter((a) => a.country == "MENA"),
      ];
      for (const channel of usaChannels) {
        const matching = usa.filter((a) =>
          this.fuzzyMatch(a.name, channel.name),
        );
        if (matching.length > 0) {
          await ctx.db.orm.public.Stream.createAll(
            matching.map((a) => ({
              channelId: channel.id,
              name: a.name,
              slug: this.slugifyUrl(a.url, channel.id),
              url: a.url,
              language: "English",
            })),
          );
          stored += matching.length
        }
      }
      for (const channel of menaChannels) {
        const matching = mena.filter((a) =>
          this.fuzzyMatch(a.name, channel.name),
        );
        if (matching.length > 0) {
          await ctx.db.orm.public.Stream.createAll(
            matching.map((a) => ({
              channelId: channel.id,
              name: a.name,
              slug: this.slugifyUrl(a.url, channel.id),
              url: a.url,
              language: "MENA",
            })),
            { onConflict: "skip" },
          );
          stored += matching.length
        }
      }
      ctx.log.info(`Bein matcher finished with ${stored} streams saved out of ${this.streams.length}`)
      return {
        fetched: this.streams.length,
        stored: stored,
      };
    } catch (error) {
      Sentry.captureException(error);
      ctx.log.error({ error }, "collect failed");
      return {
        fetched: 0,
        stored: 0,
        skipped: 0,
        error: String(error),
      };
    }
  }
}

export default BeinMatcher;
