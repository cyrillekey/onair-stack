import { logger } from "@/utils/logger.js";
import { reportError } from "@/utils/sentry.js";
import {
  BaseCollector,
  type CollectorContext,
  type CollectResult,
} from "../base.collector.js";
import IPTVCollector from "./iptv.collector.js";

import type { DefaultModelRow } from "@prisma/orm-postgres/orm-client";
import type { Contract } from "@/prisma/contract.js";
import FamelackCollecter from "./famelack.collector.js";
import BeinMatcher, { type BeinStream } from "@/matchers/bein.matcher.js";

class StreamsCollector extends BaseCollector {
  name = "StreamCollector";
  schedule = "0 */6 * * *";

  private ipTSources: { baseUrl: string; sources: string[] }[] = [
    {
      baseUrl:
        "https://raw.githubusercontent.com/iptv-org/iptv/refs/heads/master/streams/",
      sources: [
        "uk.m3u",
        "uk_bbc.m3u",
        "uk_distro.m3u",
        "uk_pluto.m3u",
        "uk_rakuten.m3u",
        "uk_samsung.m3u",
        "uk_sportstribal.m3u",
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
        "dk_pluto.m3u",
      ],
    },
    {
      baseUrl:
        "https://raw.githubusercontent.com/Free-TV/IPTV/refs/heads/master/playlists/",
      sources: [
        "playlist_usa.m3u8",
        "playlist_uk.m3u8",
        "playlist_zz_news_en.m3u8",
        "playlist_zz_music_en.m3u8",
        "playlist_zz_documentaries_en.m3u8",
        "playlist_zz_movies.m3u8",
      ],
    },
    {
      baseUrl: "https://raw.githubusercontent.com/BuddyChewChew/pluto/main/",
      sources: ["pluto_us.m3u", "pluto_gb.m3u"],
    },
    {
      baseUrl:
        "https://raw.githubusercontent.com/freecasthub/public-iptv/refs/heads/main/",
      sources: [
        "education.m3u",
        "news.m3u",
        "playlist.m3u",
        "sports.m3u",
        "weather.m3u",
      ],
    },
    {
      baseUrl:
        "https://raw.githubusercontent.com/shovo127/IPTV-By-Shovo/refs/heads/main/streams/",
      sources: [
        "uk.m3u",
        "uk_bbc.m3u",
        "uk_distro.m3u",
        "uk_pluto.m3u",
        "uk_rakuten.m3u",
        "uk_samsung.m3u",
        "uk_sportstribal.m3u",
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
        "https://raw.githubusercontent.com/Romaxa55/world_ip_tv/refs/heads/master/output/",
      sources: [
        "uk.m3u",
        "us-ak.m3u",
        "us-al.m3u",
        "us-ar.m3u",
        "us-az.m3u",
        "us-ca.m3u",
        "us-co.m3u",
        "us-ct.m3u",
        "us-dc.m3u",
        "us-de.m3u",
        "us-fl.m3u",
        "us-ga.m3u",
        "us-gu.m3u",
        "us-hi.m3u",
        "us-ia.m3u",
        "us-id.m3u",
        "us-il.m3u",
        "us-in.m3u",
        "us-ks.m3u",
        "us-ky.m3u",
        "us-la.m3u",
        "us-ma.m3u",
        "us-md.m3u",
        "us-me.m3u",
        "us-mi.m3u",
        "us-mn.m3u",
        "us-mo.m3u",
        "us-ms.m3u",
        "us-mt.m3u",
        "us-nc.m3u",
        "us-nd.m3u",
        "us-ne.m3u",
        "us-nh.m3u",
        "us-nj.m3u",
        "us-nm.m3u",
        "us-nv.m3u",
        "us-ny.m3u",
        "us-oh.m3u",
        "us-ok.m3u",
        "us-or.m3u",
        "us-pa.m3u",
        "us-ri.m3u",
        "us-sc.m3u",
        "us-tn.m3u",
        "us-tx.m3u",
        "us-ut.m3u",
        "us-va.m3u",
        "us-wa.m3u",
        "us-wi.m3u",
        "us.m3u",
        "int.m3u",
      ],
    },
    {
      baseUrl:
        "https://raw.githubusercontent.com/chingithub1/iptv/refs/heads/main/",
      sources: ["Old%20My%20Personal%20List", "Original", "SPORTS%20CHANNELS"],
    },
    {
      baseUrl: "https://gitlab.com/doms9/iptv/-/raw/default/M3U8",
      sources: ["kodi.m3u8", "TV.m3u8", "base.m3u8"],
    },
  ];
  private buildLink({ baseUrl, source }: { baseUrl: string; source: string }) {
    return `${baseUrl}${source}`;
  }

  async collect(
    ctx: CollectorContext,
  ): Promise<Omit<CollectResult<null>, "job" | "durationMs">> {
    try {
      const allChannels = await ctx.db.orm.public.Channel.where((c) =>
        c.slug.like("%bein-%").not(),
      ).all();
      const beinChannels: BeinStream[] = [];
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
          const allStreams = collecter.streams ?? [];
          const streams = allStreams.filter(
            (a) =>
              !(
                a.name?.toLowerCase().includes("bein") ||
                a.tvgId?.toLowerCase().includes("bein") ||
                a.tvgGroupTitle?.toLowerCase().includes("bein")
              ),
          );
          const bein: BeinStream[] = allStreams
            .filter(
              (a) =>
                !(
                  a.name?.toLowerCase().includes("bein") ||
                  a.tvgId?.toLowerCase().includes("bein") ||
                  a.tvgGroupTitle?.toLowerCase().includes("bein")
                ),
            )
            .map((a) => {
              const type =
                a?.name?.toLowerCase().includes("us") ||
                a?.tvgId?.toLowerCase().includes("us") ||
                a?.tvgGroupTitle?.toLowerCase().includes("us")
                  ? "USA"
                  : "MENA";
              return {
                name: a.name ?? "",
                url: a.streamLink ?? "",
                type,
              };
            });

          beinChannels.push(...bein);

          logger.info(`Found ${streams.length} streams to ingest`);
          if (streams.length > 0) {
            logger.info({ streams: streams.length }, "streams collected");

            for (const channel of allChannels) {
              const matching = streams.filter((a) =>
                this.fuzzyMatch(a.name, channel.name),
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
          }
          logger.info(`Finished ingestion for ${task.sources[index]}`);
        }
      }
      const countries = ["us", "uk"];
      // collect from famelack
      for (const country of countries) {
        const famelack = await new FamelackCollecter(country).collect(ctx);
        const allstreams = (famelack.streams ?? []).filter(
          (a) => (a.streams?.length ?? 0) > 0,
        );
        const streams = allstreams.filter(
          (a) => !a.name.toLowerCase().includes("bein"),
        );
        const beinStreams: BeinStream[] = allstreams
          .filter((a) => a.name.toLowerCase().includes("bein"))
          .map((a) => ({
            name: a.name,
            url: a.streams?.find((a) => a.url)?.url ?? "",
            type: "USA",
          }));
        beinChannels.push(...beinStreams);
        logger.info(`Found ${streams.length} famelack streams to ingest`);
        if (streams.length > 0) {
          logger.info({ streams: streams.length }, "streams collected");
          // for all matching upsert streams
          for (const channel of allChannels) {
            const channelStreams = (famelack.streams ?? []).filter((a) =>
              this.fuzzyMatch(a.name, channel.name),
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
      }
      await new BeinMatcher(beinChannels).collect(ctx);
      return {
        fetched: 0,
        stored: 0,
        skipped: 0,
      };
    } catch (error) {
      ctx.log.error({ error }, "Error collecting");
      reportError(error, { job: this.name, message: "Error collecting" });
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
      const streamSlug = this.slugifyUrl(record.url!, record.channelId!);
      await ctx.db.orm.public.Stream.upsert({
        create: {
          channelId: record.channelId!,
          name: record.name!,
          slug: streamSlug,
          url: record.url!,
          resolution: record.resolution,
          language: "English",
        },
        update: record,
        conflictOn: { slug: streamSlug },
      });
    } catch (error) {
      logger.error({ error });
      reportError(error, {
        job: this.name,
        message: "Stream upsert failed",
        channelId: record.channelId,
        slug: record.slug,
      });
      return false;
    }
  }
}

export default StreamsCollector;
