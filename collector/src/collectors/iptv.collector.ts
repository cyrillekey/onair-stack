import { logger } from "@/utils/logger.js";
import { verifyM3U8 } from "@/utils/url.js";
import { parseM3U, type Stream } from "@/utils/urlparser.js";
import {
  BaseCollector,
  type CollectResult,
  type CollectorContext,
} from "./base.collector.js";

class IPTVCollector extends BaseCollector<Stream> {
  private url: string;
  name: string;
  schedule = "30 00 * * *";
  constructor(url: string, name: string) {
    super();
    this.url = url;
    this.name = name;
  }
  async collect(
    ctx: CollectorContext,
  ): Promise<Omit<CollectResult<Stream>, "job" | "durationMs">> {
    try {
      const streams = await this.fetchStreams();
      const validated: Stream[] = [];
      const chunks = this.chunk(streams);
      for (let index = 0; index < chunks.length; index++) {
        const chunk = chunks[index];
        const result = await Promise.all(chunk.map((a) => this.verifyLink(a)));
        const valid = result.filter((a): a is Stream => a !== null);
        validated.push(...valid);
      }
      return {
        fetched: streams.length,
        stored: 0,
        error: undefined,
        skipped: 0,
        streams: validated,
      };
    } catch (error) {
      ctx.log.error({ error }, "Error collecting");
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
      const nonGeoLocked = media.filter((a) => !a.isGeoBlocked);
      const formated = this.formatNames(nonGeoLocked);
      return formated;
    } catch (error) {
      logger.error({ error }, "failed to fetch streams");
      return [];
    }
  }
  private async verifyLink(media: Stream): Promise<Stream | null> {
    try {
      const verification = await verifyM3U8(media.streamLink, {
        timeoutMs: 10000,
      });
      if (verification.isPlayable && verification.isValid) {
        return { ...media, resolution: verification.resolution };
      }
      return null;
    } catch (error) {
      logger.error({ error }, "Failed to parse m3u8");
      return null;
    }
  }
  private formatNames(media: Stream[]): Stream[] {
    try {
      const formattedMedia = media.map((a) => {
        return {
          ...a,
          name: a.name.split("(")?.at(0)?.trim() ?? a.name,
        };
      });
      return formattedMedia;
    } catch (error) {
      logger.error({ error }, "Failed to format names");
      return [];
    }
  }
}
export default IPTVCollector;
