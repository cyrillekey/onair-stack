/**
 * M3U / M3U8 playlist parser.
 *
 * Parses an extended M3U playlist (#EXTM3U, #EXTINF, optional #EXTVLCOPT
 * lines, and a stream URL) into a list of structured Stream objects.
 */

export interface Stream {
  /** Display name of the channel, with any "[Geo-blocked]" marker stripped out */
  name: string;
  /** Whether the channel name indicated it is geo-blocked */
  isGeoBlocked: boolean;
  /** The playable stream URL */
  streamLink: string;
  /** tvg-id attribute from #EXTINF, if present */
  tvgId?: string;
  /** Any #EXTVLCOPT:http-referrer=... value associated with this entry, if present */
  httpReferrer?: string;
  logo?: string;
  resolution?: string;
}

const GEO_BLOCKED_PATTERN = /\s*\[geo-blocked\]\s*/i;

/**
 * Extract the value of a quoted attribute (e.g. tvg-id="foo") from an #EXTINF line.
 */
function extractAttribute(line: string, attr: string): string | undefined {
  const match = line.match(new RegExp(`${attr}="([^"]*)"`, "i"));
  return match ? match[1] : undefined;
}

/**
 * Split an #EXTINF line into its attributes portion and the trailing display name.
 * Format: #EXTINF:-1 tvg-id="X" ...,Display Name
 * The name is everything after the LAST comma on the line.
 */
function extractName(line: string): string {
  const commaIndex = line.lastIndexOf(",");
  return commaIndex === -1 ? "" : line.slice(commaIndex + 1).trim();
}

/**
 * Parse an #EXTVLCOPT:http-referrer=... line and return the referrer value, if any.
 */
function extractReferrer(line: string): string | undefined {
  const match = line.match(/#EXTVLCOPT:http-referrer=(.+)/i);
  return match ? match[1].trim() : undefined;
}

/**
 * Fetch an M3U playlist from a URL and parse it into a list of Stream entries.
 *
 * @param url Location of the .m3u / .m3u8 playlist file.
 */
export async function parseM3U(url: string): Promise<Stream[]> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch playlist from ${url}: ${response.status} ${response.statusText}`,
    );
  }

  const content = await response.text();
  return parseM3UContent(content);
}

/**
 * Parse raw M3U playlist text (already in memory) into a list of Stream entries.
 * Use this directly if you've already fetched/read the playlist content yourself;
 * otherwise use `parseM3U(url)` to fetch and parse in one step.
 */
export function parseM3UContent(content: string): Stream[] {
  const streams: Stream[] = [];

  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#EXTM3U"));

  let pendingName: string | undefined;
  let pendingTvgId: string | undefined;
  let pendingReferrer: string | undefined;

  for (const line of lines) {
    if (line.startsWith("#EXTINF")) {
      // A new entry begins; reset pending state.
      pendingName = extractName(line);
      pendingTvgId = extractAttribute(line, "tvg-id");
      pendingReferrer = undefined;
    } else if (line.startsWith("#EXTVLCOPT")) {
      const referrer = extractReferrer(line);
      if (referrer) {
        pendingReferrer = referrer;
      }
      // Other #EXTVLCOPT directives (unrelated to referrer) are ignored.
    } else if (line.startsWith("#")) {
      // Unknown directive/comment line; ignore.
      continue;
    } else {
      // Treat as the stream URL for the most recently seen #EXTINF entry.
      if (pendingName === undefined) {
        // URL with no preceding #EXTINF metadata; skip it.
        continue;
      }

      const isGeoBlocked = GEO_BLOCKED_PATTERN.test(pendingName);
      const name = pendingName.replace(GEO_BLOCKED_PATTERN, "").trim();

      streams.push({
        name,
        isGeoBlocked,
        streamLink: line,
        tvgId: pendingTvgId,
        httpReferrer: pendingReferrer,
      });

      // Reset so a stray URL line can't be reused for a later entry.
      pendingName = undefined;
      pendingTvgId = undefined;
      pendingReferrer = undefined;
    }
  }

  return streams;
}
