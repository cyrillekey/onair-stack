import { logger } from "@/utils/logger.js";
import {
  BaseCollector,
  type CollectorContext,
  type CollectResult,
} from "./base.collector.js";
import { fetchJson } from "@/utils/http.js";
import { z } from "zod";
import { verifyM3U8 } from "@/utils/url.js";

export const SourcesSchema = z.object({
  streams: z.array(z.string()).optional(),
  youtube: z.array(z.string()).optional(),
});
export type Sources = z.infer<typeof SourcesSchema>;

export const StreamSources = z.object({
  url: z.string(),
  resoulution: z.string().optional(),
  youtubeId: z.string().optional().nullable(),
});
export const FamelackMediaElementSchema = z
  .object({
    nanoid: z.string(),
    name: z.string(),
    sources: SourcesSchema,
    languages: z.array(z.string()),
    country: z.string(),
    isGeoBlocked: z.boolean(),
    streams: z.array(StreamSources),
  })
  .transform((media) => ({
    ...media,
    isYoutube: (media.sources?.youtube?.length ?? 0) > 0,
  }));
export type FamelackMedia = z.infer<typeof FamelackMediaElementSchema>;

class FamelackCollecter extends BaseCollector {
  schedule = "30 01 * * *";
  name = "Famelack";
  private country: string;
  private baseUrl =
    "https://raw.githubusercontent.com/famelack/famelack-data/refs/heads/main/tv/raw/countries/";

  constructor(country: string) {
    super();
    this.country = country;
  }
  private buildLink() {
    return `${this.baseUrl}${this.country}.json`;
  }
  private async initMedia() {
    try {
      const media = await fetchJson<FamelackMedia[]>(this.buildLink());
      return media.filter((a) => !a.isGeoBlocked);
    } catch (error) {
      logger.error({ error }, "failed to fetch streams");
      return [];
    }
  }
  private extractYoutubeEmbededId(url: string) {
    try {
      const parts = url.split("?");
      const mainUrl = parts[0];
      const urlPars = mainUrl.split("/");
      const id = urlPars?.at(-1);
      return id;
    } catch (error) {
      logger.error({ error }, "Failed to extract embeded url");
      return null;
    }
  }
  private async verifyStream(
    stream: FamelackMedia,
  ): Promise<(FamelackMedia & { resolution?: string }) | null> {
    try {
      if (stream?.sources?.streams?.length == 0) {
        return null;
      }
      const streams = await Promise.all(
        stream.sources.streams!.map((a) => verifyM3U8(a)),
      );
      const valid = streams.filter((a) => a.isPlayable && a.isValid && a.url);
      if (valid.length > 0) {
        return {
          ...stream,
          streams: valid.map((a) => ({
            url: a.url,
            resolution: a.resolution,
          })),
        };
      }
      return null;
    } catch (error) {
      logger.error({ error }, "Failed to verify stream");
      return null;
    }
  }

  private async validateStreams(streams: FamelackMedia[]) {
    try {
      const chunks = this.chunk(streams);
      const validated = [];

      for (let index = 0; index < chunks.length; index++) {
        const element = chunks[index];
        const promise = await Promise.all(
          element.map((a) => this.verifyStream(a)),
        );
        const valid = promise.filter((a): a is FamelackMedia => !!a);
        validated.push(...valid);
      }
      return validated;
      // pass
    } catch (error) {
      logger.error({ error }, "Failed to verify streams");
      return [];
    }
  }
  async collect(
    ctx: CollectorContext,
  ): Promise<Omit<CollectResult<FamelackMedia>, "job" | "durationMs">> {
    try {
      const streams = await this.initMedia();
      const youtubeStreams = streams
        .filter((a) => a.isYoutube)
        .map((a) => ({
          ...a,
          streams:
            a.sources?.youtube?.map((b) => ({
              url: b ?? "",
              resolution: null,
              youtubeId: this.extractYoutubeEmbededId(b),
            })) ?? [],
        }));
      const nonYoutubeStreams = streams.filter((a) => !a.isYoutube);
      const validated = await this.validateStreams(nonYoutubeStreams);
      const combined = [...validated, ...youtubeStreams];
      return {
        fetched: streams.length,
        stored: 0,
        error: undefined,
        skipped: 0,
        streams: combined,
      };
    } catch (error) {
      ctx.log.error({ error });
      return { fetched: 0, stored: 0, skipped: 0, error: String(error) };
    }
  }
}

export default FamelackCollecter;
