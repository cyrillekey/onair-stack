import { fetchHtml } from "@/utils/http.js";
import { logger } from "@/utils/logger.js";
import { reportError } from "@/utils/sentry.js";
import { load } from "cheerio";

import {
  BaseCollector,
  type CollectorContext,
  type CollectResult,
} from "../base.collector.js";

import Sentry from "@/utils/instrument.js";

class TvChannelCollector extends BaseCollector {
  name = "TvChannels";
  private baseUrl = "https://online-television.com";

  schedule = "15 00 * * 5";
  private sources = [
    { country: "USA", id: "epgshare01_us2" },
    { country: "CANADA", id: "epg_ripper_CA2" },
  ];

  private buildChannelLink(id: string, page: number) {
    return `${this.baseUrl}/tv-channels/page/${page}/?source=${id}`;
  }
  private async scrapeChannels(
    id: string,
    country: string,
    ctx: CollectorContext,
  ) {
    for (let index = 0; index < 15; index++) {
      try {
        const link = this.buildChannelLink(id, index + 1);
        const html = await fetchHtml(link);
        const $ = load(html);
        const channels = $(".topch__grid")
          .find(".topch-item")
          .map((_, el) => {
            const program = $(el);
            const name = program.find(".topch-item__name").find("a").text();
            const id = program
              .find(".topch-item__logo-link")
              .attr("href")
              ?.split("/")
              .filter((a) => !!a)
              ?.at(-1);
            const logo = program
              .find(".topch-item__logo-link")
              .find("img")
              .attr("src");
            return {
              name,
              logo,
              description: "",
              id,
            };
          })
          .get()
          .map((a) => ({
            name: a.name,
            logo: `${this.baseUrl}${a.logo}`,
            description: a.description,
          }));
        await ctx.db.orm.public.Channel.createAll(
          channels.map((a) => ({
            slug: this.slugify(a.name),
            name: a.name,
            country: country,
            poster: a.logo,
            category: "GENERAL",
          })),
          {
            onConflict: "skip",
          },
        );
        await this.sleep();
      } catch (error) {
        ctx.log.error(error);
        Sentry.captureException(error);
      }
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
      for (const source of this.sources) {
        await this.scrapeChannels(source.id, source.country, ctx);
      }

      return {
        fetched: 0,
        stored: 0,
      };
    } catch (error) {
      logger.error({ error }, "failed to build schedule");
      reportError(error, {
        job: this.name,
        message: "failed to build schedule",
      });
      return {
        fetched: 0,
        stored: 0,
        error: String(error),
        skipped: 0,
      };
    }
  }
}

export default TvChannelCollector;
