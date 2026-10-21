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
import sources from "./sources/iptv.sources.json" with { type: "json" };

class StreamsCollector extends BaseCollector {
  name = "StreamCollector";
  schedule = "0 */6 * * *";

  private ipTSources = sources;
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
