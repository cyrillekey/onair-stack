import sources from "@/collectors/schedule/source/uk.sports.channels.json" with { type: "json" };
import {
  BaseCollector,
  type CollectorContext,
  type CollectResult,
} from "../base.collector.js";
import Sentry from "@/utils/instrument.js";
import dayjs from "dayjs";
import { fetchHtml } from "@/utils/http.js";
import { parseEpg, type EpgProgramme } from "@/utils/eguide.parser.js";
import { logger } from "@/utils/logger.js";
class UkSportScheduler extends BaseCollector<EpgProgramme> {
  private epgUrl = "https://zappscore.com/epg/api/epg.xml";
  schedule = "30 01 * * *";
  name = "UK Sports Schedule";
  private buildUrl(channelId: string) {
    const queryParams = new URLSearchParams();
    queryParams.append("channel_id", channelId);
    queryParams.append("date", dayjs().format("YYYYMMDD"));
    return `${this.epgUrl}?${queryParams.toString()}`;
  }
  private async fetchScheduleEpg(url: string): Promise<EpgProgramme[]> {
    try {
      const res = await fetchHtml(url);
      const epg = parseEpg(res);
      return epg;
    } catch (error) {
      Sentry.captureException(error);
      logger.error({ error }, "Failed to fetch schedule");
      return [];
    }
  }
  async collect(
    ctx: CollectorContext,
  ): Promise<Omit<CollectResult<EpgProgramme>, "job" | "durationMs">> {
    try {
      let stored = 0;
      let fetched = 0;
      let skipped = 0;
      for (const source of sources) {
        try {
          const url = this.buildUrl(source.id);
          const epg = await this.fetchScheduleEpg(url);

          const channel = await ctx.db.orm.public.Channel.upsert({
            create: {
              country: source.country,
              name: source.name,
              slug: this.slugify(source.name),
              category: "SPORTS",
              description: source.description,
              poster: source.logo,
            },
            update: {
              country: source.country,
              name: source.name,
              slug: this.slugify(source.name),
              category: "SPORTS",
              description: source.description,
              poster: source.logo,
            },
            conflictOn: { slug: this.slugify(source.name) },
          });
          fetched += epg.length;
          if (channel?.id) {
            // create schedule
            await ctx.db.orm.public.Schedule.createAll(
              epg.map((a) => ({
                channelId: channel.id,
                date: this.buildTemporalDate(a.start),
                startTime: this.buildTemporalDate(a.start),
                endTime: this.buildTemporalDate(a.stop),
                name: a.name,
                description: a?.desc,
              })),
            );
            stored += epg.length;
          }
        } catch (error) {
          ctx.log.error({ error }, "collect failed");
          Sentry.captureException(error);
          skipped += 1;
        }
      }
      return {
        fetched: fetched,
        stored: stored,
        skipped,
      };
    } catch (error) {
      ctx.log.error({ error }, "collect failed");
      Sentry.captureException(error);
      return {
        fetched: 0,
        stored: 0,
        error: String(error),
        skipped: 0,
      };
    }
  }
}

export default UkSportScheduler;
