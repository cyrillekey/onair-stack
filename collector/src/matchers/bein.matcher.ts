import {
  BaseCollector,
  type CollectorContext,
  type CollectResult,
} from "@/collectors/base.collector.js";
import Sentry from "@/utils/instrument.js";
import similarity from "similarity";

export interface BeinStream {
  url: string;
  name: string;
  type: "USA" | "MENA";
}

class BeinMatcher extends BaseCollector {
  schedule = "-";
  name = "BeinMatcher";
  private streams: BeinStream[];
  constructor(streams: BeinStream[]) {
    super();
    this.streams = streams;
  }
  // override fuzzyMatch with a higher treshold for bein channels comparison
  protected fuzzyMatch(a: string, b: string): boolean {
    return similarity(a.toLowerCase().trim(), b.toLowerCase().trim()) > 0.99;
  }
  async collect(
    ctx: CollectorContext,
  ): Promise<Omit<CollectResult<unknown>, "job" | "durationMs">> {
    try {
      const _channels = await ctx.db.orm.public.Channel.where((c) =>
        c.slug.like("%bein-%"),
      ).all();
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
        }
      }

      return {
        fetched: this.streams.length,
        stored: 0,
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
