import {
  BaseCollector,
  type CollectorContext,
  type CollectResult,
} from "../base.collector.js";
import Sentry from "@/utils/instrument.js";
import adultChannels from "@/collectors/schedule/source/adult.channels.json" with { type: "json" };
import { fetchEpg, type Channel } from "@/utils/eguide.parser.js";
import { logger } from "@/utils/logger.js";
class EpgScheduler extends BaseCollector<Channel> {
  private epgUrl = "https://www.open-epg.com/files/";
  private countries: { id: string; name: string }[] = [
    { id: "unitedkingdom.xml", name: "United Kingdom" },
    {
      id: "canada.xml",
      name: "Canada",
    },
    {
      id: "unitedstates1.xml",
      name: "United States",
    },
  ];
  schedule = "50 00 * * *";
  name = "EPG Scheduler";
  private buildUrl(country: string) {
    return `${this.epgUrl}${country}.gz`;
  }
  private async fetchScheduleEpg(url: string): Promise<Channel[]> {
    try {
      const epg = await fetchEpg(url);
      return epg.filter((a) => !adultChannels.includes(a.id));
    } catch (error) {
      Sentry.captureException(error);
      logger.error({ error }, "Failed to fetch schedule");
      return [];
    }
  }
  async collect(
    ctx: CollectorContext,
  ): Promise<Omit<CollectResult<Channel>, "job" | "durationMs">> {
    try {
      let stored = 0;
      let fetched = 0;
      let skipped = 0;

      for (const country of this.countries) {
        ctx.log.info({ country: country.name }, "collect started");
        try {
          const url = this.buildUrl(country.id);
          const schedules = await this.fetchScheduleEpg(url);
          ctx.log.info({ schedules: schedules.length }, "channels fetched");
          for (const schedule of schedules) {
            const channel = await ctx.db.orm.public.Channel.upsert({
              create: {
                country: country.name,
                name: schedule.name,
                slug: this.slugify(schedule.name),
                category: "GENERAL",
                poster: schedule.logo,
              },
              update: {
                country: country.name,
                name: schedule.name,
                slug: this.slugify(schedule.name),
                poster: schedule.logo,
              },
              conflictOn: { slug: this.slugify(schedule.name) },
            });
            fetched += 1;
            if (channel?.id) {
              // create schedule
              await ctx.db.orm.public.Schedule.createAll(
                schedule.schedule.map((a) => ({
                  channelId: channel.id,
                  date: this.buildTemporalDate(a.startTime),
                  startTime: this.buildTemporalDate(a.startTime),
                  endTime: this.buildTemporalDate(a.endTime),
                  name: a.title,
                  description: a?.description,
                  poster: schedule.logo,
                })),
                {
                  onConflict: "skip",
                },
              );
              stored += schedules.length;
            }
          }
        } catch (error) {
          ctx.log.error({ error }, "collect failed");
          Sentry.captureException(error);
          skipped += 1;
        }
        ctx.log.info({ country: country.name }, "collect finished");
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

export default EpgScheduler;
