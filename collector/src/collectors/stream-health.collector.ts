import { config } from "@/config/index.js";
import { isVerifiableM3U8Url, verifyM3U8 } from "@/utils/url.js";
import {
  BaseCollector,
  type CollectorContext,
  type CollectResult,
} from "./base.collector.js";

interface SavedStream {
  id: string;
  url: string;
  youtubeId: string | null;
  resolution: string | null;
}

const YOUTUBE_URL_PATTERN = /(?:youtube\.com|youtu\.be)/i;

// verifyM3U8 error substrings that suggest a transient problem (timeout, DNS,
// reset, 5xx, rate-limit) rather than a definitively dead link. Transient
// failures are kept for the next run; anything else is treated as broken.
const TRANSIENT_PATTERNS = [
  /timed out/i,
  /network error/i,
  /request aborted/i,
  /fetch failed/i,
  /econn/i,
  /enotfound/i,
  /eai_again/i,
  /etimedout/i,
  /socket hang up/i,
  /http 5\d\d/,
  /http 429/,
];

function isTransientError(message: string | undefined): boolean {
  if (!message) return true; // Unknown failure: be conservative and keep.
  return TRANSIENT_PATTERNS.some((re) => re.test(message));
}

/**
 * Periodically re-verifies every saved stream and deletes broken links.
 *
 * - YouTube embeds (`youtubeId` set or youtube URL) are skipped: they are
 *   not M3U8 playlists, so M3U8 verification does not apply to them.
 * - Non-HTTP(S) URLs are deleted: they can never be fetched as a playlist
 *   and the ingest collectors already filter them out.
 * - A stream that fails verification with a definitive error (4xx, invalid
 *   playlist, no variants/segments, dead next-level link) is deleted.
 * - A stream that fails with a transient error (timeout, DNS, 5xx, 429) is
 *   kept so a network blip cannot wipe the table.
 * - Safety trip: if the share of broken streams exceeds
 *   STREAM_HEALTH_MAX_DELETE_RATIO, nothing is deleted and the run errors
 *   out instead. A near-total failure is far more likely an infrastructure
 *   outage on our side than every source dying at once.
 */
class StreamHealthCollector extends BaseCollector<string> {
  name = "StreamHealth";
  schedule = config.STREAM_HEALTH_CRON;

  private isYoutube(row: SavedStream): boolean {
    return row.youtubeId != null || YOUTUBE_URL_PATTERN.test(row.url);
  }

  private async checkRow(
    row: SavedStream,
  ): Promise<
    | { outcome: "healthy"; resolution: string }
    | { outcome: "broken"; reason: string }
    | { outcome: "transient"; reason: string }
  > {
    if (!isVerifiableM3U8Url(row.url)) {
      return { outcome: "broken", reason: "not a verifiable HTTP(S) URL" };
    }
    let verification;
    try {
      verification = await verifyM3U8(row.url, {
        timeoutMs: config.STREAM_HEALTH_TIMEOUT_MS,
        deepCheck: config.STREAM_HEALTH_DEEP_CHECK,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return { outcome: "transient", reason };
    }
    if (verification.isValid && verification.isPlayable) {
      return { outcome: "healthy", resolution: verification.resolution };
    }
    const reason = verification.error ?? "unplayable playlist";
    if (isTransientError(reason)) {
      return { outcome: "transient", reason };
    }
    return { outcome: "broken", reason };
  }

  async collect(
    ctx: CollectorContext,
  ): Promise<Omit<CollectResult<string>, "job" | "durationMs">> {
    const saved = (await ctx.db.orm.public.Stream.all()) as SavedStream[];
    if (saved.length === 0) {
      ctx.log.info("no saved streams to check");
      return { fetched: 0, stored: 0, skipped: 0, streams: [] };
    }

    const batchSize = config.STREAM_HEALTH_BATCH_SIZE;
    const chunks = this.chunk(saved, batchSize);
    const broken: { id: string; url: string; reason: string }[] = [];
    const transient: { id: string; reason: string }[] = [];
    const resolutionUpdates: { id: string; resolution: string }[] = [];
    let healthy = 0;
    let skippedYoutube = 0;

    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index];
      ctx.log.info(
        { chunk: index + 1, total: chunks.length, size: chunk.length },
        "checking stream chunk",
      );
      const results = await Promise.all(
        chunk.map(async (row) => {
          if (this.isYoutube(row)) return { row, outcome: "youtube" as const };
          return { row, ...(await this.checkRow(row)) };
        }),
      );
      for (const result of results) {
        if (result.outcome === "youtube") {
          skippedYoutube += 1;
          continue;
        }
        if (result.outcome === "healthy") {
          healthy += 1;
          if (
            result.resolution !== "unknown" &&
            result.resolution !== result.row.resolution
          ) {
            resolutionUpdates.push({
              id: result.row.id,
              resolution: result.resolution,
            });
          }
          continue;
        }
        if (result.outcome === "broken") {
          ctx.log.debug(
            { id: result.row.id, url: result.row.url, reason: result.reason },
            "broken stream",
          );
          broken.push({
            id: result.row.id,
            url: result.row.url,
            reason: result.reason,
          });
          continue;
        }
        ctx.log.debug(
          { id: result.row.id, url: result.row.url, reason: result.reason },
          "transient check failure, keeping stream",
        );
        transient.push({ id: result.row.id, reason: result.reason });
      }
    }

    const checked = healthy + broken.length + transient.length;
    const deleteRatio = checked > 0 ? broken.length / checked : 0;
    if (
      checked >= 10 &&
      deleteRatio > config.STREAM_HEALTH_MAX_DELETE_RATIO
    ) {
      ctx.log.error(
        {
          checked,
          broken: broken.length,
          deleteRatio,
          maxRatio: config.STREAM_HEALTH_MAX_DELETE_RATIO,
        },
        "safety trip: too many streams look broken, deleting nothing",
      );
      return {
        fetched: saved.length,
        stored: 0,
        skipped: skippedYoutube + transient.length,
        error: `safety trip: ${broken.length}/${checked} streams failed verification, deleting nothing`,
        streams: [],
      };
    }

    let deleted = 0;
    if (broken.length > 0) {
      const deleteChunks = this.chunk(broken, batchSize);
      for (const deleteChunk of deleteChunks) {
        const outcomes = await Promise.all(
          deleteChunk.map(async (item) => {
            try {
              const removed = await ctx.db.orm.public.Stream.where({
                id: item.id,
              }).delete();
              return removed !== null;
            } catch (err) {
              ctx.log.error(
                { err, id: item.id, url: item.url },
                "failed to delete broken stream",
              );
              return false;
            }
          }),
        );
        deleted += outcomes.filter(Boolean).length;
      }
    }

    let refreshed = 0;
    if (resolutionUpdates.length > 0) {
      const updateChunks = this.chunk(resolutionUpdates, batchSize);
      for (const updateChunk of updateChunks) {
        const outcomes = await Promise.all(
          updateChunk.map(async (item) => {
            try {
              const updated = await ctx.db.orm.public.Stream.where({
                id: item.id,
              }).update({ resolution: item.resolution });
              return updated !== null;
            } catch (err) {
              ctx.log.error(
                { err, id: item.id },
                "failed to refresh stream resolution",
              );
              return false;
            }
          }),
        );
        refreshed += outcomes.filter(Boolean).length;
      }
    }

    ctx.log.info(
      {
        total: saved.length,
        healthy,
        deleted,
        keptTransient: transient.length,
        skippedYoutube,
        refreshedResolution: refreshed,
      },
      "stream health check finished",
    );

    return {
      fetched: saved.length,
      stored: deleted,
      skipped: skippedYoutube + transient.length,
      streams: broken.map((b) => b.id),
    };
  }
}

export default StreamHealthCollector;
