import { fetchHtml } from "@/utils/http.js";
import { logger } from "@/utils/logger.js";
import { load } from "cheerio";
import dayjs from "dayjs";

import {
  BaseCollector,
  type CollectorContext,
  type CollectResult,
} from "../base.collector.js";

class ScheduleCollector extends BaseCollector {
  name = "Schedule";
  private baseUrl = "https://online-television.com";

  schedule = "15 00 * * *";

  private buildLink(name: string): string {
    const date = dayjs();
    return `${this.baseUrl}/tv-channel/${name}/?pgday=${date.format("YYYY-MM-DD")}`;
  }

  private async scrapePage(name: string): Promise<string | null> {
    try {
      const html = await fetchHtml(this.buildLink(name), { timeoutMs: 60000 });
      return html;
    } catch (error) {
      console.log(error);
      logger.error({ error }, "failed to scrape page");
      return null;
    }
  }
  private buildDate(time: string): Date {
    const [hour, minute] = time.split(":");
    const date = new Date();
    date.setHours(Number(hour));
    date.setMinutes(Number(minute));
    return date;
  }

  private buildSchedule(content: string) {
    try {
      const $ = load(content);
      const body = $(".tv-program-list")
        .find(".tv-program-item")
        .map((_, el) => {
          const program = $(el);

          const time = program.find(".tv-program-item__time").text();

          const [startTime, endTime] = time.replace("LIVE", "").split("-");
          return {
            name: program.find(".tv-program-item__title").text(),
            startTime: this.buildDate(startTime.trim()),
            endTime: this.buildDate(endTime.trim()),
            category: program.find(".program-cats").text(),
            description: program.find(".tv-program-desc").text(),
            poster: program.find(".tv-program-poster").attr("src"),
          };
        })
        .get();
      return body;
    } catch (error) {
      console.log(error);
      logger.error({ error }, "failed to build schedule");
      return [];
    }
  }
  private async sleep() {
    return new Promise((resolve) => {
      setTimeout(resolve, 5000);
    });
  }
  async collect(
    ctx: CollectorContext,
  ): Promise<Omit<CollectResult, "job" | "durationMs">> {
    try {
      ctx.log.info("Starting schedule collector");
      const date = dayjs();
      const channels = (await ctx.db.orm.public.Channel.all()).filter(
        (a) => !!a.externalId && a.externalId != null,
      );
      const chunks = this.chunk(channels);
      for (let index = 0; index < chunks.length; index++) {
        const chunk = chunks[index];
        for (const channel of chunk) {
          try {
            if (!channel.externalId) continue;
            const content = await this.scrapePage(channel.externalId);
            if (!content) continue;
            const programs = this.buildSchedule(content);

            if (programs.length > 0)
              await ctx.db.orm.public.Schedule.createAll(
                programs.map((program) => ({
                  channelId: channel.id,
                  date: this.buildTemporalDate(date.toDate()),
                  endTime: this.buildTemporalDate(program.endTime),
                  name: program.name,
                  startTime: this.buildTemporalDate(program.startTime),
                  poster: `${this.baseUrl}${program.poster}`,
                })),
                { onConflict: "skip" },
              );
            await this.sleep();
          } catch (error) {
            logger.error({ error }, "failed to build schedule");
          }
        }
      }
      ctx.log.info("Starting schedule collector");
      return {
        fetched: channels.length,
        stored: channels.length,
        streams: channels,
      };
    } catch (error) {
      console.log(error);
      logger.error({ error }, "failed to build schedule");
      return {
        fetched: 0,
        stored: 0,
        error: String(error),
        skipped: 0,
      };
    }
  }
}

export default ScheduleCollector;
