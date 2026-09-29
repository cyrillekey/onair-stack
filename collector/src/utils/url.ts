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
  /** Abort the check if it takes longer than this many milliseconds (default: 30000). */
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
  /**
   * Abort reading a response body once it exceeds this many bytes
   * (default: 10 MiB). Some URLs serve multi-gigabyte media files instead of a
   * playlist; without a cap, buffering the body would exhaust memory.
   */
  maxBodyBytes?: number;
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

/** Options for fetchWithTimeout. */
interface FetchWithTimeoutOptions {
  /**
   * When true, throw FileDownloadError if the response headers show a file
   * download (attachment disposition or binary media type) instead of a
   * playlist. Enable for playlist fetches; leave off when the target is
   * itself a file (e.g. the deep-check on a media segment).
   */
  abortOnFileDownload?: boolean;
}

/** Thrown when a response is a file download rather than a fetchable playlist. */
export class FileDownloadError extends Error {
  constructor(reason: string) {
    super(`Skipped: response is a file download (${reason})`);
    this.name = "FileDownloadError";
  }
}

/** `application/*` subtypes that can never be a text M3U8 playlist. */
const BINARY_APPLICATION_SUBTYPES = new Set([
  "zip",
  "x-zip-compressed",
  "gzip",
  "x-gzip",
  "x-rar-compressed",
  "x-7z-compressed",
  "x-tar",
  "pdf",
  "msword",
  "mp4",
  "ogg",
]);

/**
 * Conservative check for "this response is a media/binary file, not a playlist".
 * Deliberately narrow: `application/octet-stream`, `text/*`, or a missing
 * content-type are all served for real playlists by misconfigured servers, so
 * those still go through the #EXTM3U gate instead of being rejected here.
 */
function isBinaryContentType(contentType: string): boolean {
  const mime = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (mime.startsWith("video/") || mime.startsWith("image/")) return true;
  if (mime.startsWith("audio/") && !mime.includes("mpegurl")) return true;
  return BINARY_APPLICATION_SUBTYPES.has(mime);
}

function getFileDownloadReason(response: Response): string | undefined {
  const disposition = response.headers.get("content-disposition");
  if (disposition && /attachment/i.test(disposition)) {
    return `content-disposition: ${disposition}`;
  }
  const contentType = response.headers.get("content-type");
  if (contentType && isBinaryContentType(contentType)) {
    return `content-type: ${contentType}`;
  }
  return undefined;
}

/** Best-effort body cancel so the socket doesn't linger when we won't read it. */
async function cancelBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Already closed/errored; nothing to clean up.
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  options: FetchWithTimeoutOptions = {}
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  // Honor a caller-provided signal (e.g. shutdown) alongside the timeout
  // instead of silently discarding it.
  const externalSignal = init.signal;
  const onExternalAbort = () => controller.abort(externalSignal?.reason);
  const clear = () => {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  };
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  if (externalSignal?.aborted) {
    clear();
    throw externalSignal.reason instanceof Error
      ? externalSignal.reason
      : new Error("Request aborted", { cause: externalSignal.reason });
  }
  externalSignal?.addEventListener("abort", onExternalAbort, { once: true });

  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    clear();
    if (timedOut) throw new Error(`Timed out after ${timeoutMs}ms`);
    throw err;
  }

  if (options.abortOnFileDownload) {
    const reason = getFileDownloadReason(response);
    if (reason) {
      await cancelBody(response);
      clear();
      throw new FileDownloadError(reason);
    }
  }

  if (!response.body) {
    // No body to stream (e.g. HEAD): nothing left for the timeout to cover.
    clear();
    return response;
  }

  // Track the body so the timeout covers a slow/trickling download too, not
  // just time-to-headers. The timer stops when the body completes, errors,
  // or is cancelled; every terminal path also settles the source stream.
  const source = response.body.getReader();
  const trackedBody = new ReadableStream<Uint8Array>({
    async pull(streamController) {
      try {
        const { done, value } = await source.read();
        if (done) {
          streamController.close();
          clear();
        } else {
          streamController.enqueue(value);
        }
      } catch (err) {
        clear();
        streamController.error(err);
      }
    },
    async cancel(reason) {
      clear();
      try {
        await source.cancel(reason);
      } catch {
        // Source already closed/errored; nothing to do.
      }
    },
  });

  return new Response(trackedBody, response);
}

function resolvePlaylistUrl(maybeRelative: string, baseUrl: string): string {
  try {
    return new URL(maybeRelative, baseUrl).toString();
  } catch {
    return maybeRelative;
  }
}

/** Default cap for how much of a response body verifyM3U8 will buffer (10 MiB). */
export const DEFAULT_MAX_BODY_BYTES = 10 * 1024 * 1024;

/**
 * Read a response body as text, aborting if it exceeds `maxBytes`.
 * Checks the declared Content-Length first (fast path), then enforces the cap
 * while streaming so an over-limit body is cut off mid-download instead of
 * being buffered fully into memory.
 */
async function readBodyWithLimit(
  response: Response,
  maxBytes: number,
  timeoutMs: number
): Promise<{ text?: string; error?: string }> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > maxBytes) {
      await cancelBody(response);
      return {
        error: `Response body too large (~${declared} bytes declared, limit ${maxBytes})`,
      };
    }
  }

  if (!response.body) {
    try {
      return { text: await response.text() };
    } catch {
      return { error: "Failed to read response body" };
    }
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        return { error: `Response body exceeds ${maxBytes} bytes, aborting` };
      }
      chunks.push(value);
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      // Timeout (or external cancellation) fired mid-download. Nothing passes
      // an external signal today, so in practice this is always the timeout.
      return { error: `Timed out after ${timeoutMs}ms` };
    }
    return { error: "Failed to read response body" };
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(merged) };
}

/**
 * Quick syntactic check for whether a string is worth passing to verifyM3U8:
 * non-blank with an http(s) scheme. Anything else (empty, relative, rtmp://,
 * udp://, rtsp://, etc.) can never be fetched as an M3U8 playlist, so callers
 * should skip verification instead of burning a network round trip.
 */
export function isVerifiableM3U8Url(url: string): boolean {
  if (!url || !url.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
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
  timeoutMs: number,
  maxBodyBytes: number
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetchWithTimeout(url, { headers }, timeoutMs, {
      abortOnFileDownload: true,
    });
    if (!response.ok) {
      await cancelBody(response);
      return { ok: false, error: `HTTP ${response.status} ${response.statusText}` };
    }
    const body = await readBodyWithLimit(response, maxBodyBytes, timeoutMs);
    if (body.error !== undefined || body.text === undefined) {
      return { ok: false, error: body.error ?? "Failed to read response body" };
    }
    const text = body.text;
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
 * Bodies larger than `maxBodyBytes` (default 10 MiB) are aborted before being
 * buffered, so a URL serving a huge media file instead of a playlist can't
 * exhaust memory. Responses that declare themselves a file download
 * (attachment disposition or binary media type) are rejected on headers
 * without downloading the body at all.
 *
 * This cannot guarantee a video will actually render in a specific player (that also
 * depends on codecs, DRM, and client support), but it reliably distinguishes a live,
 * well-formed stream from a broken, empty, or dead link.
 */
export async function verifyM3U8(
  url: string,
  options: VerifyOptions = {}
): Promise<VerifyResult> {
  const {
    timeoutMs = 30000,
    headers = {},
    deepCheck = true,
    maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
  } = options;

  const result: VerifyResult = {
    url,
    isValid: false,
    isPlayable: false,
    playlistType: "unknown",
    resolution: "unknown",
  };

  if (!isVerifiableM3U8Url(url)) {
    result.error = "Skipped verification: not a verifiable HTTP(S) URL";
    return result;
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(url, { headers }, timeoutMs, {
      abortOnFileDownload: true,
    });
  } catch (err) {
    if (err instanceof FileDownloadError) {
      result.error = err.message;
    } else if (
      err instanceof Error &&
      err.message.startsWith("Timed out after")
    ) {
      result.error = err.message;
    } else if (err instanceof Error && err.name === "AbortError") {
      result.error = "Request aborted";
    } else {
      result.error = `Network error: ${err instanceof Error ? err.message : String(err)}`;
    }
    return result;
  }

  result.httpStatus = response.status;
  result.contentType = response.headers.get("content-type") ?? undefined;

  if (!response.ok) {
    await cancelBody(response);
    result.error = `HTTP ${response.status} ${response.statusText}`;
    return result;
  }

  const body = await readBodyWithLimit(response, maxBodyBytes, timeoutMs);
  if (body.error !== undefined || body.text === undefined) {
    result.error = body.error ?? "Failed to read response body";
    return result;
  }
  const text = body.text;

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
      const deep = await checkMediaPlaylistReachable(
        firstVariant,
        headers,
        timeoutMs,
        maxBodyBytes
      );
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
      // Note: no abortOnFileDownload here — a segment IS a file by nature.
      if (!segResponse.ok && (segResponse.status === 405 || segResponse.status === 501)) {
        await cancelBody(segResponse);
        segResponse = await fetchWithTimeout(
          firstSegment,
          { headers: { ...headers, Range: "bytes=0-0" } },
          timeoutMs
        );
      }
      // Status-only check: the body is never read, so cancel it to stop the
      // timeout and free the socket (no-op for HEAD responses).
      await cancelBody(segResponse);
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