/**
 * M3U / M3U8 playlist parser.
 *
 * Parses an extended M3U playlist (#EXTM3U, #EXTINF, optional #EXTVLCOPT
 * lines, and a stream URL) into a list of structured Stream objects.
 */

import { isProfane } from "./media.filter.js";

export interface Stream {
  name: string;
  isGeoBlocked: boolean;
  streamLink: string;
  tvgId?: string;
  tvgLogo?: string;
  tvgGroupTitle?: string;
  httpReferrer?: string;
  logo?: string;
  resolution?: string;
  /** Two-letter country code parsed from the tvg-id (e.g. "US" from "WillowSports.us@SD"), if present */
  country?: string;
  /** Full country name for `country` (e.g. "United States"), if it could be resolved */
  countryName?: string;
}

const GEO_BLOCKED_PATTERN = /\s*\[geo-blocked\]\s*/i;

/**
 * Quality markers that playlists staple onto channel names, in any casing and
 * with optional brackets around them: "BBC One HD", "CNN (HD)", "Sky Sports
 * [4K]", "Discovery SD".
 *
 * The lookarounds keep the match on a whole word, so names like "HDTV" or
 * "4Kids" survive untouched.
 */
const QUALITY_TAG_PATTERN =
  /(?<![\p{L}\p{N}])(?:8k|4k|uhd|fhd|hd|sd)(?![\p{L}\p{N}])/giu;

/** Bracket pairs left empty once their content was stripped. */
const EMPTY_BRACKET_PATTERN = /[([{]\s*[)\]}]/g;

/** Separators left dangling at either end of a name after stripping. */
const LEFTOVER_SEPARATOR_PATTERN = /^[\s\-–—|,;:.·]+|[\s\-–—|,;:.·]+$/g;

/**
 * Remove quality markers (HD, SD, 4K, ...) from a channel display name and
 * tidy up the leftovers: empty brackets, dangling separators and repeated
 * whitespace.
 *
 * Names that consist solely of a quality marker (e.g. a channel literally
 * named "HD") are left untouched rather than blanked out.
 */
export function stripQualityTags(name: string): string {
  const withoutTags = name.replace(QUALITY_TAG_PATTERN, " ");
  if (withoutTags === name) {
    // Nothing matched; leave the name exactly as it was.
    return name.trim();
  }

  const cleaned = withoutTags
    .replace(EMPTY_BRACKET_PATTERN, "")
    .replace(LEFTOVER_SEPARATOR_PATTERN, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return cleaned.length > 0 ? cleaned : name.trim();
}

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
  let pendingLogo: string | undefined;
  let pendingGroupTitle: string | undefined;

  for (const line of lines) {
    if (line.startsWith("#EXTINF")) {
      // A new entry begins; reset pending state.
      pendingName = extractName(line);
      pendingTvgId = extractAttribute(line, "tvg-id");
      pendingGroupTitle = extractAttribute(line, "group-title");
      pendingLogo = extractAttribute(line, "tvg-logo");
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
      const name = stripQualityTags(
        pendingName.replace(GEO_BLOCKED_PATTERN, "").trim(),
      );

      // Drop entries whose display name or group title contains profanity.
      if (!isProfane(name) && !isProfane(pendingGroupTitle)) {
        const country = extractCountry(pendingTvgId);

        streams.push({
          name,
          isGeoBlocked,
          streamLink: line,
          tvgId: pendingTvgId,
          country,
          countryName: countryNameFromCode(country),
          httpReferrer: pendingReferrer,
          logo: pendingLogo,
          tvgLogo: pendingLogo,
          tvgGroupTitle: pendingGroupTitle,
        });
      }

      // Reset so a stray URL line can't be reused for a later entry.
      pendingName = undefined;
      pendingTvgId = undefined;
      pendingReferrer = undefined;
      pendingLogo = undefined;
      pendingGroupTitle = undefined;
    }
  }

  return streams;
}

/**
 * Extract the country code from a tvg-id like "WillowSports.us@SD".
 * The country is the 2-letter suffix after the last dot, before an optional
 * "@Variant" part.
 */
const COUNTRY_FROM_TVG_ID_PATTERN = /\.([a-z]{2})(?:@[^@]*)?$/i;

export function extractCountry(tvgId: string | undefined): string | undefined {
  if (!tvgId) return undefined;
  const match = tvgId.trim().match(COUNTRY_FROM_TVG_ID_PATTERN);
  return match ? match[1].toUpperCase() : undefined;
}

const regionNames = new Intl.DisplayNames(["en"], {
  type: "region",
  fallback: "none", // undefined for unknown codes instead of echoing them back
});

/** Non-standard codes seen in playlists, mapped to their ISO 3166-1 alpha-2 equivalent. */
const COUNTRY_CODE_ALIASES: Record<string, string> = {
  UK: "GB",
};

export function countryNameFromCode(
  code: string | undefined,
): string | undefined {
  if (!code) return undefined;
  const upper = code.toUpperCase();
  const normalized = COUNTRY_CODE_ALIASES[upper] ?? upper;
  try {
    return regionNames.of(normalized);
  } catch {
    return undefined; // malformed code
  }
}