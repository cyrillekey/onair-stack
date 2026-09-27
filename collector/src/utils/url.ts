// ---------------------------------------------------------------------------
// m3u8 link verification
// ---------------------------------------------------------------------------

export type PlaylistType = "master" | "media" | "unknown";

/**
 * Coarse quality tier derived from a variant's declared pixel dimensions, rather
 * than the exact width/height. Thresholds follow common streaming conventions:
 *  - "4k": width >= 3840 or height >= 2160
 *  - "hd": width >= 1280 or height >= 720 (covers 720p and 1080p)
 *  - "sd": any smaller declared resolution
 *  - "unknown": no RESOLUTION attribute was present to classify
 */
export type ResolutionTier = "4k" | "hd" | "sd" | "unknown";

export interface VariantStreamInfo {
  /** Resolved absolute URL of the variant playlist. */
  url: string;
  /** Quality tier derived from the RESOLUTION attribute, if the playlist declared one. */
  resolution: ResolutionTier;
  /** Parsed BANDWIDTH attribute in bits/sec, if the playlist declared one. */
  bandwidth?: number;
}

export interface VerifyOptions {
  /** Abort the check if it takes longer than this many milliseconds (default: 10000). */
  timeoutMs?: number;
  /** Extra HTTP headers to send, e.g. a Referer some CDNs require to allow playback. */
  headers?: Record<string, string>;
  /**
   * When true (default), go one level deeper to more confidently confirm the
   * stream is actually playable rather than just structurally valid:
   * for a master playlist, fetch & parse the first variant playlist;
   * for a media playlist, confirm the first segment is actually reachable.
   * Costs one extra network round trip. Set false for a faster, shallower check.
   */
  deepCheck?: boolean;
}

export interface VerifyResult {
  /** The URL that was checked. */
  url: string;
  /** True once the response was fetched and parsed as a well-formed M3U8 playlist. */
  isValid: boolean;
  /**
   * True if the stream looks playable: valid playlist with at least one variant/segment,
   * and, when deepCheck is on, that the next level down was actually reachable too.
   */
  isPlayable: boolean;
  httpStatus?: number;
  contentType?: string;
  playlistType: PlaylistType;
  /** Number of variant streams listed, for a master playlist. */
  variantCount?: number;
  /** Number of segments listed, for a media playlist. */
  segmentCount?: number;
  /** For a media playlist: true if there's no #EXT-X-ENDLIST (i.e. an ongoing live stream). */
  isLive?: boolean;
  /** Whether the deep (next-level) check passed, when deepCheck was requested. */
  deepCheckPassed?: boolean;
  /**
   * Representative quality tier for the stream. For a master playlist this is the
   * tier of the highest-bandwidth variant that declared a RESOLUTION. Media (leaf)
   * playlists don't carry resolution info in the manifest itself, and a master
   * playlist whose variants omit RESOLUTION entirely, both resolve to "unknown".
   */
  resolution: ResolutionTier;
  /** For a master playlist: every declared variant, with its resolution/bandwidth when present. */
  variants?: VariantStreamInfo[];
  /** Human-readable reason isValid/isPlayable is false, if applicable. */
  error?: string;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function resolvePlaylistUrl(maybeRelative: string, baseUrl: string): string {
  try {
    return new URL(maybeRelative, baseUrl).toString();
  } catch {
    return maybeRelative;
  }
}

/** Parse the raw RESOLUTION=WxH attribute off an #EXT-X-STREAM-INF line, if present. */
function parseResolutionPixels(
  streamInfLine: string
): { width: number; height: number } | undefined {
  const match = streamInfLine.match(/RESOLUTION=(\d+)x(\d+)/i);
  if (!match) return undefined;
  return { width: Number(match[1]), height: Number(match[2]) };
}

/** Bucket raw pixel dimensions into the coarse quality tier enum. */
function classifyResolution(pixels?: { width: number; height: number }): ResolutionTier {
  if (!pixels) return "unknown";
  const { width, height } = pixels;
  if (width >= 3840 || height >= 2160) return "4k";
  if (width >= 1280 || height >= 720) return "hd";
  if (width > 0 && height > 0) return "sd";
  return "unknown";
}

/** Parse the BANDWIDTH=n attribute off an #EXT-X-STREAM-INF line, if present. */
function parseBandwidth(streamInfLine: string): number | undefined {
  const match = streamInfLine.match(/BANDWIDTH=(\d+)/i);
  return match ? Number(match[1]) : undefined;
}

/**
 * Fetch and parse an .m3u8 URL just far enough to confirm it is a well-formed
 * playlist with at least one segment. Used internally for the deep-check on
 * a master playlist's first variant.
 */
async function checkMediaPlaylistReachable(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetchWithTimeout(url, { headers }, timeoutMs);
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status} ${response.statusText}` };
    }
    const text = await response.text();
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines[0] !== "#EXTM3U") {
      return { ok: false, error: "Not a valid M3U8 playlist (missing #EXTM3U header)" };
    }
    const hasSegments = lines.some((l) => !l.startsWith("#"));
    if (!hasSegments) {
      return { ok: false, error: "Playlist contains no segments" };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/**
 * Verify that an .m3u8 link is reachable, well-formed, and (best-effort) playable.
 *
 * Checks performed:
 *  1. The URL responds with a successful HTTP status.
 *  2. The body starts with #EXTM3U, i.e. it really is an M3U8 playlist.
 *  3. It has at least one variant stream (master playlist) or segment (media playlist).
 *  4. Optionally (deepCheck, on by default): the first variant/segment one level down
 *     is itself reachable, which catches playlists that parse fine but point at dead links.
 *  5. For a master playlist, the RESOLUTION/BANDWIDTH attributes declared on each
 *     #EXT-X-STREAM-INF line are parsed and RESOLUTION is bucketed into a coarse
 *     "4k" | "hd" | "sd" | "unknown" tier, exposed via `variants` and `resolution`.
 *
 * This cannot guarantee a video will actually render in a specific player (that also
 * depends on codecs, DRM, and client support), but it reliably distinguishes a live,
 * well-formed stream from a broken, empty, or dead link.
 */
export async function verifyM3U8(
  url: string,
  options: VerifyOptions = {}
): Promise<VerifyResult> {
  const { timeoutMs = 10000, headers = {}, deepCheck = true } = options;

  const result: VerifyResult = {
    url,
    isValid: false,
    isPlayable: false,
    playlistType: "unknown",
    resolution: "unknown",
  };

  let response: Response;
  try {
    response = await fetchWithTimeout(url, { headers }, timeoutMs);
  } catch (err) {
    result.error =
      err instanceof Error && err.name === "AbortError"
        ? `Timed out after ${timeoutMs}ms`
        : `Network error: ${err instanceof Error ? err.message : String(err)}`;
    return result;
  }

  result.httpStatus = response.status;
  result.contentType = response.headers.get("content-type") ?? undefined;

  if (!response.ok) {
    result.error = `HTTP ${response.status} ${response.statusText}`;
    return result;
  }

  let text: string;
  try {
    text = await response.text();
  } catch {
    result.error = "Failed to read response body";
    return result;
  }

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0 || lines[0] !== "#EXTM3U") {
    result.error = "Response is not a valid M3U8 playlist (missing #EXTM3U header)";
    return result;
  }

  result.isValid = true;

  const isMaster = lines.some((l) => l.startsWith("#EXT-X-STREAM-INF"));

  if (isMaster) {
    result.playlistType = "master";

    const variants: VariantStreamInfo[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("#EXT-X-STREAM-INF")) {
        const next = lines[i + 1];
        if (next && !next.startsWith("#")) {
          variants.push({
            url: resolvePlaylistUrl(next, url),
            resolution: classifyResolution(parseResolutionPixels(lines[i])),
            bandwidth: parseBandwidth(lines[i]),
          });
        }
      }
    }
    result.variantCount = variants.length;

    if (variants.length === 0) {
      result.error = "Master playlist declares no variant streams";
      return result;
    }

    result.variants = variants;

    // Representative tier: the one on the highest-bandwidth variant that actually
    // declared a RESOLUTION, since that's usually the "best quality" stream.
    // Stays "unknown" if no variant declared a RESOLUTION at all.
    const withResolution = variants.filter((v) => v.resolution !== "unknown");
    if (withResolution.length > 0) {
      const best = withResolution.reduce((a, b) =>
        (b.bandwidth ?? 0) > (a.bandwidth ?? 0) ? b : a
      );
      result.resolution = best.resolution;
    }

    result.isPlayable = true;

    if (deepCheck) {
      const firstVariant = variants[0].url;
      const deep = await checkMediaPlaylistReachable(firstVariant, headers, timeoutMs);
      result.deepCheckPassed = deep.ok;
      result.isPlayable = deep.ok;
      if (!deep.ok) {
        result.error = `Variant playlist check failed: ${deep.error}`;
      }
    }

    return result;
  }

  // Media (leaf) playlist. No RESOLUTION attribute exists at this level in the
  // HLS spec, so `result.resolution` stays at its default "unknown".
  result.playlistType = "media";

  const segmentUrls = lines.filter((l) => !l.startsWith("#"));
  result.segmentCount = segmentUrls.length;
  result.isLive = !lines.some((l) => l.startsWith("#EXT-X-ENDLIST"));

  if (segmentUrls.length === 0) {
    result.error = "Media playlist contains no segments";
    return result;
  }

  result.isPlayable = true;

  if (deepCheck) {
    const firstSegment = resolvePlaylistUrl(segmentUrls[0], url);
    try {
      let segResponse = await fetchWithTimeout(
        firstSegment,
        { method: "HEAD", headers },
        timeoutMs
      );
      // Some CDNs don't support HEAD requests; fall back to a 1-byte ranged GET.
      if (!segResponse.ok && (segResponse.status === 405 || segResponse.status === 501)) {
        segResponse = await fetchWithTimeout(
          firstSegment,
          { headers: { ...headers, Range: "bytes=0-0" } },
          timeoutMs
        );
      }
      result.deepCheckPassed = segResponse.ok;
      result.isPlayable = segResponse.ok;
      if (!segResponse.ok) {
        result.error = `First segment unreachable (HTTP ${segResponse.status})`;
      }
    } catch (err) {
      result.deepCheckPassed = false;
      result.isPlayable = false;
      result.error = `Segment check failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return result;
}