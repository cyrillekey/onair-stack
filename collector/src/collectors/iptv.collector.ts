import ProgressBar from "progress";
import { logger } from "@/utils/logger.js";
import { isVerifiableM3U8Url, verifyM3U8 } from "@/utils/url.js";
import { parseM3U, type Stream } from "@/utils/urlparser.js";
import {
  BaseCollector,
  type CollectResult,
  type CollectorContext,
} from "./base.collector.js";

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
    let bar: ProgressBar | null = null;
    try {
      logger.info({ url: this.url }, "fetching streams");
      const streams = await this.fetchStreams();
      const validated: Stream[] = [];
      const total = streams.length;
      const skipped = streams.filter(
        (s) => !isVerifiableM3U8Url(s.streamLink),
      ).length;
      let completed = 0;
      let validCount = 0;
      let lastLoggedPct = -1;
      // Single in-place bar on TTY (throttled redraws); throttled logs otherwise.
      bar =
        total > 0 && process.stderr.isTTY
          ? new ProgressBar(
              "verify [:bar] :percent (:current/:total) valid :valid eta :eta s",
              {
                total,
                width: 30,
                complete: "█",
                incomplete: "░",
                renderThrottle: 100,
              },
            )
          : null;
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
          chunk.map((stream, i) =>
            this.verifyLink(stream, globalIndex + i).then((verified) => {
              completed += 1;
              if (verified) validCount += 1;
              if (bar) {
                bar.tick({ valid: validCount });
              } else {
                const pct =
                  total > 0 ? Math.floor((completed / total) * 100) : 100;
                if (pct >= lastLoggedPct + 10 || completed === total) {
                  lastLoggedPct = pct;
                  ctx.log.info(
                    { completed, total, valid: validCount },
                    `verify ${pct}% (${completed}/${total})`,
                  );
                }
              }
              return verified;
            }),
          ),
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
      if (bar && !bar.complete) bar.terminate();
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
