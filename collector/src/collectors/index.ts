import { logger } from "@/utils/logger.js";
import {
  BaseCollector,
  type CollectorContext,
  type CollectResult,
} from "./base.collector.js";
import FamelackCollecter from "./famelack.collector.js";
import IPTVCollector from "./iptv.collector.js";
import similarity from "similarity";
import type { DefaultModelRow } from "@prisma/orm-postgres/orm-client";
import type { Contract } from "@/prisma/contract.js";

class StreamsCollector extends BaseCollector {
  name = "StreamCollector";
  schedule = "* 00,08,16 * * *";
  private iptvBaseUrl =
    "https://raw.githubusercontent.com/iptv-org/iptv/refs/heads/master/streams/";
  private ipSources = [
    "us.m3u",
    "us_30a.m3u",
    "us_3abn.m3u",
    "us_abcnews.m3u",
    "us_afrolandtv.m3u",
    "us_amagi.m3u",
    "us_canelatv.m3u",
    "us_cbsn.m3u",
    "us_cineversetv.m3u",
    "us_distro.m3u",
    "us_firetv.m3u",
    "us_frequency.m3u",
    "us_glewedtv.m3u",
    "us_klowdtv.m3u",
    "us_local.m3u",
    "us_malimartv.m3u",
    "us_pbs.m3u",
    "us_plex.m3u",
    "us_pluto.m3u",
    "us_roku.m3u",
    "us_samsung.m3u",
    "us_sofast.m3u",
    "us_ssh101.m3u",
    "us_stirr.m3u",
    "us_tcl.m3u",
    "us_tubi.m3u",
    "us_uplynk.m3u",
    "us_vegasplus.m3u",
    "us_vizio.m3u",
    "us_wcetv.m3u",
    "us_wfmz.m3u",
    "us_wowza.m3u",
    "us_xumo.m3u",
  ];
  private buildLink(name: string) {
    return `${this.iptvBaseUrl}${name}`;
  }
  /**
   * Performs a fuzzy match between two names to determine if they are similar or close
   * @param a name to compare
   * @param b name to compare
   *
   * @returns boolean do they match
   */
  private fuzzyMatch(a: string, b: string): boolean {
    return similarity(a, b) > 0.8;
  }

  async collect(
    ctx: CollectorContext,
  ): Promise<Omit<CollectResult<null>, "job" | "durationMs">> {
    try {
      const tasks = this.ipSources.map((a) => this.buildLink(a));
      const results = await Promise.all(
        tasks.map((a) => new IPTVCollector(a, "IPTV").collect(ctx)),
      );
      const streams = results.flatMap((a) => a.streams);
      logger.info({ streams: streams.length }, "streams collected");
      const fameLack = await new FamelackCollecter("us").collect(ctx);
      logger.info({ fameLack: fameLack.streams?.length }, "famelack collected");
      if ((fameLack.streams?.length ?? 0) > 0 && (streams.length ?? 0) > 0) {
        logger.info("Starting channels upsert");
        const allChannels = await ctx.db.orm.public.Channel.all();
        for (let index = 0; index < allChannels.length; index++) {
          const channel = allChannels[index];
          logger.info(
            { index, total: allChannels.length },
            "starting upserting channel",
          );
          if (streams.length > 0) {
            const matching = streams.filter((a) =>
              this.fuzzyMatch(this.slugify(a!.name), channel.slug),
            );
            // for all matching upsert streams
            await Promise.all(
              matching.map((a) =>
                this.upsertRecord(ctx, {
                  channelId: channel.id,
                  name: a!.name,
                  slug: this.slugify(a!.name),
                  url: a!.streamLink,
                  resolution: a!.resolution,
                }),
              ),
            );
          }
          if ((fameLack.streams?.length ?? 0) > 0) {
            const matching = fameLack.streams!.filter((a) =>
              this.fuzzyMatch(this.slugify(a.name), channel.slug),
            );
            // for all matching upsert streams
            await Promise.all(
              matching
                .map((b) =>
                  b.streams.map((a) =>
                    this.upsertRecord(ctx, {
                      channelId: channel.id,
                      name: b.name,
                      slug: this.slugify(b.name),
                      url: a.url,
                      resolution: a.resoulution,
                      youtubeId: a.youtubeId,
                    }),
                  ),
                )
                .flat(),
            );
          }
          logger.info(
            { index, total: allChannels.length },
            "finished upserting",
          );
          // matching fameLack
        }
      }

      return {
        fetched: 0,
        stored: 0,
        skipped: 0,
      };
    } catch (error) {
      ctx.log.error({ error }, "Error collecting");
      return {
        fetched: 0,
        stored: 0,
        error: error instanceof Error ? error.message : String(error),
        skipped: 0,
      };
    }
  }
  private async upsertRecord(
    ctx: CollectorContext,
    record: Partial<DefaultModelRow<Contract, "Stream", never>>,
  ) {
    try {
      await ctx.db.orm.public.Stream.upsert({
        create: {
          channelId: record.channelId!,
          name: record.name!,
          slug: record.slug!,
          url: record.url!,
          resolution: record.resolution,
        },
        update: record,
        conflictOn: { slug: record.slug! },
      });
    } catch (error) {
      logger.error({ error });
      return false;
    }
  }
}

export default StreamsCollector;
