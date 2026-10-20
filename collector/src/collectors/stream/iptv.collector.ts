import { logger } from "@/utils/logger.js";
import { reportError } from "@/utils/sentry.js";
import { isVerifiableM3U8Url, verifyM3U8 } from "@/utils/url.js";
import { parseM3U, type Stream } from "@/utils/urlparser.js";
import {
  BaseCollector,
  type CollectResult,
  type CollectorContext,
} from "../base.collector.js";

class IPTVCollector extends BaseCollector<Stream> {
  private url: string;
  name: string;
  schedule = "-";
  constructor(url: string, name: string) {
    super();
    this.url = url;
    this.name = name;
  }
  async collect(
    ctx: CollectorContext,
  ): Promise<Omit<CollectResult<Stream>, "job" | "durationMs">> {
    try {
      logger.info({ url: this.url }, "fetching streams");
      const streams = await this.fetchStreams();
      const validated: Stream[] = [];
      const total = streams.length;
      const skipped = streams.filter(
        (s) => !isVerifiableM3U8Url(s.streamLink),
      ).length;
      // Single in-place bar on TTY (throttled redraws); throttled logs otherwise.

      logger.info({ streams: total }, "total fetched streams");
      const chunks = this.chunk(streams);
      let globalIndex = 0;
      for (let index = 0; index < chunks.length; index++) {
        ctx.log.info(
          { index: index + 1, total: chunks.length },
          "fetching chunk",
        );
        const chunk = chunks[index];
        const result = await Promise.all(
          chunk.map((stream, i) => this.verifyLink(stream, globalIndex + i)),
        );
        globalIndex += chunk.length;
        const valid = result.filter((a): a is Stream => a !== null);
        validated.push(...valid);
        ctx.log.info(
          { index: index + 1, total: chunks.length },
          "finished fetching chunk",
        );
      }
      logger.info(
        { url: this.url, validated: validated.length, total },
        "finished fetching streams",
      );
      return {
        fetched: streams.length,
        stored: 0,
        error: undefined,
        skipped,
        streams: validated,
      };
    } catch (error) {
      ctx.log.error({ error }, "Error collecting");
      reportError(error, {
        job: this.name,
        message: "Error collecting",
        url: this.url,
      });
      return {
        fetched: 0,
        stored: 0,
        skipped: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async fetchStreams() {
    try {
      const media = await parseM3U(this.url);
      const nonGeoLocked = media
        .filter((a) => !a.isGeoBlocked)
        .filter((a) => isVerifiableM3U8Url(a.streamLink));
      const formated = this.formatNames(nonGeoLocked);
      return formated;
    } catch (error) {
      logger.error({ error }, "failed to fetch streams");
      reportError(error, {
        job: this.name,
        message: "failed to fetch streams",
        url: this.url,
      });
      return [];
    }
  }
  private async verifyLink(
    media: Stream,
    index: number,
  ): Promise<Stream | null> {
    if (!isVerifiableM3U8Url(media.streamLink)) {
      logger.debug(
        { index, name: media.name },
        "skipping m3u8 verification: not a verifiable URL",
      );
      return null;
    }
    try {
      const verification = await verifyM3U8(media.streamLink);
      if (verification.isPlayable && verification.isValid) {
        return { ...media, resolution: verification.resolution };
      }
      return null;
    } catch (error) {
      logger.error({ error }, "Failed to parse m3u8", index);
      reportError(error, {
        job: this.name,
        message: "Failed to parse m3u8",
        index,
        streamName: media.name,
      });
      return null;
    }
  }
  private formatNames(media: Stream[]): Stream[] {
    try {
      const formattedMedia = media.map((a) => {
        return {
          ...a,
          name: this.formatName(a.name),
        };
      });
      return formattedMedia;
    } catch (error) {
      logger.error({ error }, "Failed to format names");
      reportError(error, { job: this.name, message: "Failed to format names" });
      return [];
    }
  }
}
export default IPTVCollector;
