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
      id: "australia.xml",
      name: "Australia",
    },
    {
      id: "unitedstates11.xml",
      name: "United States of America",
    },
    {
      id: "unitedstates10.xml",
      name: "United States of America",
    },
    {
      id: "unitedstates9.xml",
      name: "United States of America",
    },
    {
      id: "unitedstates8.xml",
      name: "United States of America",
    },
    {
      id: "unitedstates7.xml",
      name: "United States of America",
    },
    {
      id: "unitedstates6.xml",
      name: "United States of America",
    },
    {
      id: "unitedstates5.xml",
      name: "United States of America",
    },
    {
      id: "unitedstates4.xml",
      name: "United States of America",
    },
    {
      id: "unitedstates3.xml",
      name: "United States of America",
    },
    {
      id: "unitedstates2.xml",
      name: "United States of America",
    },
    {
      id: "unitedstates1.xml",
      name: "United States of America",
    },
    {
      id: "newzealand.xml",
      name: "New Zealand",
    },
    {
      id: "sports5.xml",
      name: "United Kingdom",
    },
    { id: "brazil1.xml", name: "Brazil" },
    {
      id: "portugal1.xml",
      name: "Portugal",
    },
    {
      id: "portugal2.xml",
      name: "Portugal",
    },
    {
      id: "spain1.xml",
      name: "Spain",
    },
    {
      id: "germany.xml",
      name: "Germany",
    },
    {
      id: "france.xml",
      name: "France",
    },
    {
      id: "italy.xml",
      name: "Italy",
    },
  ];
  schedule = "30 01 * * *";
  name = "EPG Scheduler";
  private blockedTitles = ["no event today"];
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
          await ctx.db.orm.public.Channel.createAndCount(
            schedules.map((a) => ({
              country: country.name,
              name: a.name,
              category: this.classifyChannel(a.name),
              slug: this.slugify(a.name),
              poster: a.logo,
            })),
            {
              onConflict: "skip",
              conflictOn: ["country", "slug"],
            },
          );
          const slugs = this.getUniqueArray(
            schedules.map((a) => this.slugify(a.name)),
          );
          const channels = await ctx.db.orm.public.Channel.select(
            "id",
            "slug",
            "country",
          )
            .where((a) => a.slug.in(slugs))
            .all();
          ctx.log.info({ schedules: schedules.length }, "channels fetched");
          for (const schedule of schedules) {
            const channel = channels.find(
              (a) =>
                a.slug == this.slugify(schedule.name) &&
                a.country == country.name,
            );
            if (channel?.id) {
              fetched += 1;
              await ctx.db.orm.public.Schedule.createAndCount(
                schedule.schedule
                  .filter(
                    (a) =>
                      !this.blockedTitles.includes(
                        a.title?.toLowerCase() ?? "",
                      ),
                  )
                  .map((a) => ({
                    channelId: channel.id,
                    date: a.startTime,
                    startTime: a.startTime,
                    endTime: a.endTime,
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
