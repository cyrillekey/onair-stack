/**
 * Playlist health validator.
 *
 * Usage:
 *   npx tsx src/utils/playlist.validator.ts <playlist-url>
 *
 * Fetches the M3U/M3U8 playlist at the given URL, verifies every stream it
 * contains, and prints a summary of the playlist's health.
 */

import ProgressBar from "progress";
import { verifyM3U8 } from "./url.js";
import { parseM3U } from "./urlparser.js";

/** How to invoke this script, shown when the playlist URL is missing/invalid. */
const USAGE = "Usage: npx tsx src/utils/playlist.validator.ts <playlist-url>";

/**
 * Read the playlist URL from the command line arguments.
 *
 * @param argv The raw process arguments (`process.argv`).
 * @returns The playlist URL to validate.
 * @throws If no URL was given, or it isn't a usable http(s) URL.
 */
function resolvePlaylistUrl(argv: string[]): string {
  const raw = argv[2]?.trim();

  if (!raw) {
    throw new Error(`Missing playlist URL.\n${USAGE}`);
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`Invalid playlist URL: ${raw}\n${USAGE}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Playlist URL must be http(s): ${raw}\n${USAGE}`);
  }

  return parsed.toString();
}

/**
 * Validate every stream in the playlist at `playlistUrl` and report its health.
 */
async function main(playlistUrl: string) {
  const content =
    (await parseM3U(playlistUrl))?.filter((a) => !a.isGeoBlocked) ?? [];
  console.log(`Ingested ${content.length} stream(s) from ${playlistUrl}`);

  // The bar renders on stderr and is a no-op when stderr isn't a TTY, so piped
  // output stays clean.
  const bar = new ProgressBar(
    "Validating [:bar] :current/:total :percent :elapsed :eta",
    {
      total: content.length,
      width: 30,
      complete: "=",
      incomplete: " ",
    },
  );

  const validated = await Promise.all(
    content.map(async (a) => {
      try {
        const b = await verifyM3U8(a.streamLink);
        return {
          url: b.url,
          isValid: b.isValid,
          isPlayable: b.isPlayable,
          name: a.name,
          country: a.country,
          tvgId: a.tvgId,          
          variantCount: b.variantCount
        };
      } finally {
        // Tick on completion (success or failure) so the bar always reaches
        // its total, even if a stream throws.
        bar.tick();
      }
    }),
  );

  // Move to a fresh line so the report below isn't overwritten by the bar.
  bar.terminate();

  const valid = validated.filter((a) => a.isPlayable && a.isValid && a.url);
  const healthyRatio =
    validated.length > 0
      ? ((valid.length / validated.length) * 100).toFixed()
      : "0";

  // console log playlist summary with health,total ingested,total valid in formated output
  console.log(valid);
  console.log(
    `Playlist Health: ${healthyRatio}%\nTotal Ingested: ${validated.length}\nTotal Valid: ${valid.length}`,
  );
}

try {
  const playlistUrl = resolvePlaylistUrl(process.argv);
  void main(playlistUrl).catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
