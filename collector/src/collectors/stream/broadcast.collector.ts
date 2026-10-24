import { logger } from "@/utils/logger.js";
import {
  BaseCollector,
  type CollectorContext,
  type CollectResult,
} from "../base.collector.js";
import { verifyM3U8 } from "@/utils/url.js";
import { isProfane } from "@/utils/media.filter.js";
import Sentry from "@/utils/instrument.js";

export interface BroadcastMedia {
  channels: Channel[];
  hasMore: boolean;
  nextOffset: number;
}

export interface Channel {
  id: string;
  slug: string;
  name: string;
  baseName: string;
  networkName: null;
  logoUrl: null;
  countryFlag: string;
  countryName: string;
  streamCount: number;
  watchCount: number;
  thumbsUp: number;
  thumbsDown: number;
  myVote: number;
  playbackOptions: PlaybackOption[];
  languages: string[];
  categories: string[];
  broadcastAreas: string[];
  url: string;
  mediaType: null;
}

export interface PlaybackOption {
  id: string;
  url: string;
  mediaType: null;
  quality: string;
  title: string;
  availability: null;
}

class BroadcastCollector extends BaseCollector {
  name = "Broadcast";
  schedule = "0 */4 * * *";

  // Broadcast channels: let variant streams fall back to generic channels,
  // but never promote a generic stream into a variant channel.
  protected streamMatcherConfig = {
    minConfidence: 0.85,
    requireVariantMatch: true,
    allowVariantSubset: true,
    qualityBonus: 0.05,
    regionBonus: 0.05,
  };

  private baseUrl = "https://broadcastatlas.com/api/channels/ranked";
  private countries = ["UK", "US"];

  private async collectStreams(country: string): Promise<Channel[]> {
    try {
      let offset = 0;
      let hasMore = true;
      const streams: Channel[] = [];
      while (hasMore) {
        const queryParams = new URLSearchParams();
        queryParams.append("country", country);
        queryParams.append("offset", offset.toString());
        const url = `${this.baseUrl}?${queryParams.toString()}`;
        const res = await fetch(url);
        const data: BroadcastMedia = res.json() as unknown as BroadcastMedia;
        if (
          data.channels != null &&
          data.channels != undefined &&
          data.channels.length > 0
        )
          streams.push(...data.channels);
        hasMore = data.hasMore;
        offset = data.nextOffset;
      }
      return streams
        .filter((a) => !isProfane(a.name))
        .map((a) => ({
          ...a,
          name: this.formatName(a.name),
          playbackOptions: (a.playbackOptions ?? []).filter(
            (b) => !isProfane(b.title),
          ),
        }));
    } catch (error) {
      Sentry.captureException(error);
      logger.error({ error }, "Failed to fetch streams");
      return [];
    }
  }
  private async verifyStreams(streams: Channel[]): Promise<Channel[]> {
    try {
      const nonGeolocked = streams.map((a) => {
        const available = (a.playbackOptions ?? []).filter(
          (b) => b.availability != "Geo-blocked",
        );
        return {
          ...a,
          playbackOptions: available,
        };
      });
      const valid = nonGeolocked.filter(
        (a) =>
          a.url || (a.playbackOptions !== null && a.playbackOptions.length > 0),
      );

      const chunks = this.chunk(valid);
      const validated = [];

      for (let index = 0; index < chunks.length; index++) {
        const element = chunks[index];
        const promise = await Promise.all(
          element.map((a) => this.verifyStream(a)),
        );
        const valid = promise.filter((a): a is Channel => !!a);
        validated.push(...valid);
        // call private method verifyStream
      }
      return valid;
    } catch (error) {
      Sentry.captureException(error);
      logger.error({ error }, "Failed to verify streams");
      return [];
    }
  }
  private async verifyStream(stream: Channel): Promise<Channel | null> {
    try {
      if (
        !stream.url ||
        stream.playbackOptions == null ||
        stream.playbackOptions == undefined ||
        stream.playbackOptions.length == 0
      ) {
        return null;
      }
      const valid =
        (
          await Promise.all(
            stream.playbackOptions.map((a) => verifyM3U8(a.url)),
          )
        ).filter((a) => a.isPlayable && a.isValid && a.url) ?? [];
      if (valid.length == 0) {
        return null;
      }
      const playbackOptions = valid.reduce((t, c) => {
        const option = stream.playbackOptions.find((a) => a.url == c.url);
        if (option) {
          return [...t, { ...option, quality: c.resolution }];
        }
        return t;
      }, [] as PlaybackOption[]);
      return { ...stream, playbackOptions: playbackOptions };
    } catch (error) {
      Sentry.captureException(error);
      logger.error({ error }, "Failed to verify stream");
      return null;
    }
  }
  async collect(
    ctx: CollectorContext,
  ): Promise<Omit<CollectResult<unknown>, "job" | "durationMs">> {
    try {
      const channels = await ctx.db.orm.public.Channel.all();
      let stored = 0;
      let totalStreams = 0;
      let skipped = 0;
      for (const country of this.countries) {
        const streams = await this.collectStreams(country);
        totalStreams += streams.length;
        const valid = await this.verifyStreams(streams);
        skipped += streams.length - valid.length;
        for (const channel of channels) {
          const matching = valid.filter((a) =>
            this.fuzzyMatch(a.name, channel.name),
          );
          if (matching.length > 0) {
            await ctx.db.orm.public.Stream.createAll(
              matching
                .map((a) =>
                  a.playbackOptions.map((b) => ({
                    channelId: channel.id,
                    name: b.title,
                    slug: this.slugifyUrl(b.url, channel.id),
                    url: b.url,
                    resolution: b.quality,
                    language: a.languages?.at(0) ?? "English",
                  })),
                )
                .flat(),
              { onConflict: "skip" },
            );
            stored += 1;
          }
        }
      }

      return {
        fetched: totalStreams,
        stored,
        skipped,
      };
    } catch (error) {
      ctx.log.error({ error }, "collect failed");
      Sentry.captureException(error);
      return {
        fetched: 0,
        stored: 0,
        skipped: 0,
        error: String(error),
      };
    }
  }
}

export default BroadcastCollector;
