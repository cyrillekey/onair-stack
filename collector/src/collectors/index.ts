import { logger } from "@/utils/logger.js";
import {
  BaseCollector,
  type CollectorContext,
  type CollectResult,
} from "./base.collector.js";
import IPTVCollector from "./iptv.collector.js";
import similarity from "similarity";
import type { DefaultModelRow } from "@prisma/orm-postgres/orm-client";
import type { Contract } from "@/prisma/contract.js";
import FamelackCollecter from "./famelack.collector.js";

class StreamsCollector extends BaseCollector {
  name = "StreamCollector";
  schedule = "0 0,08,16 * * *";

  private ipTSources: { baseUrl: string; sources: string[] }[] = [
    {
      baseUrl:
        "https://raw.githubusercontent.com/iptv-org/iptv/refs/heads/master/streams/",
      sources: [
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
      ],
    },
    {
      baseUrl:
        "https://raw.githubusercontent.com/Free-TV/IPTV/refs/heads/master/playlists/",
      sources: ["playlist_usa.m3u8"],
    },
    {
      baseUrl: "https://raw.githubusercontent.com/BuddyChewChew/pluto/main/",
      sources: ["pluto_us.m3u", "pluto_gb.m3u"],
    },
  ];
  private buildLink({ baseUrl, source }: { baseUrl: string; source: string }) {
    return `${baseUrl}${source}`;
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
      const allChannels = await ctx.db.orm.public.Channel.all();
      for (const task of this.ipTSources) {
        for (let index = 0; index < task.sources.length; index++) {
          logger.info(`Starting ingestion for ${task.sources[index]}`);
          const url = this.buildLink({
            baseUrl: task.baseUrl,
            source: task.sources[index],
          });
          const collecter = await new IPTVCollector(
            url,
            task.sources[index],
          ).collect(ctx);
          const streams = collecter.streams ?? [];
          logger.info(`Found ${streams.length} streams to ingest`);
          if (streams.length > 0) {
            logger.info({ streams: streams.length }, "streams collected");
          }
          for (const channel of allChannels) {
            const matching = streams.filter((a) =>
              this.fuzzyMatch(this.slugify(a.name), channel.slug),
            );
            // for all matching upsert streams
            await Promise.all(
              matching.map((a) =>
                this.upsertRecord(ctx, {
                  channelId: channel.id,
                  name: a.name,
                  slug: this.slugify(a.name),
                  url: a.streamLink,
                  resolution: a.resolution,
                }),
              ),
            );
          }
          logger.info(`Finished ingestion for ${task.sources[index]}`);
        }
      }
      // collect from famelack
      const famelack = await new FamelackCollecter("us").collect(ctx);
      const streams = (famelack.streams ?? []).filter(
        (a) => (a.streams?.length ?? 0) > 0,
      );
      logger.info(`Found ${streams.length} famelack streams to ingest`);
      if (streams.length > 0) {
        logger.info({ streams: streams.length }, "streams collected");
        // for all matching upsert streams
        for (const channel of allChannels) {
          const channelStreams = (famelack.streams ?? []).filter((a) =>
            this.fuzzyMatch(this.slugify(a.name), channel.slug),
          );
          const promises = [];
          for (const stream of channelStreams) {
            // pass
            if (stream.streams.length > 0) {
              promises.push(
                ...stream.streams.map((a) =>
                  this.upsertRecord(ctx, {
                    channelId: channel.id,
                    name: channel.name,
                    slug: this.slugifyUrl(a.url),
                    resolution: a.resoulution,
                    url: a.url,
                    youtubeId: a.youtubeId,
                  }),
                ),
              );
            }
          }
          await Promise.all(promises);
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
