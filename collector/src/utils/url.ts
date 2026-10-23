// ---------------------------------------------------------------------------
// M3U8 / HLS link verification
// ---------------------------------------------------------------------------

export type PlaylistType = "master" | "media" | "unknown";
export type ResolutionTier = "4k" | "hd" | "sd" | "unknown";

/** Whether the available evidence confirms, rejects, or cannot establish playability. */
export type PlayabilityStatus = "confirmed" | "unplayable" | "unknown" | "unverified";

export interface VariantStreamInfo {
  /** Resolved absolute URL of the variant playlist. */
  url: string;
  /** Quality tier derived from RESOLUTION, when declared. */
  resolution: ResolutionTier;
  /** BANDWIDTH in bits/second, when declared. */
  bandwidth?: number;
}

export interface VerifyOptions {
  /** Total time budget for the complete check, including response bodies and deep checks. Default: 30s. */
  timeoutMs?: number;
  /** Extra HTTP headers, e.g. Referer or User-Agent required by a CDN. */
  headers?: Record<string, string>;
  /** Probe variant playlists and media resources. Defaults to true. */
  deepCheck?: boolean;
  /** Maximum playlist body size. Default: 10 MiB. */
  maxBodyBytes?: number;
  /** Max variants/segments to probe before returning an inconclusive result. Default: 5. */
  maxDeepCheckCandidates?: number;
  /** Include every master-playlist variant in the result. Defaults to true for deep checks and false for shallow checks. */
  includeVariants?: boolean;
  /** Allow a caller to cancel the whole operation. */
  signal?: AbortSignal;
}

export interface VerifyResult {
  url: string;
  /** True only if the response has recognizable, coherent HLS playlist structure. */
  isValid: boolean;
  /** Compatibility boolean: confirmed by deep check, or structurally plausible when deepCheck=false. */
  isPlayable: boolean;
  /** Explains whether playability was confirmed, rejected, not checked, or inconclusive. */
  playabilityStatus: PlayabilityStatus;
  httpStatus?: number;
  contentType?: string;
  playlistType: PlaylistType;
  variantCount?: number;
  /** Number of full segment URIs in a media playlist (not LL-HLS parts). */
  segmentCount?: number;
  /** Number of LL-HLS partial segments, when present. */
  partCount?: number;
  /** For media playlists: true if the ENDLIST tag is absent. */
  isLive?: boolean;
  /** Present when deepCheck was requested; true means one candidate worked. */
  deepCheckPassed?: boolean;
  resolution: ResolutionTier;
  variants?: VariantStreamInfo[];
  /** Human-readable reason validation failed or playability could not be confirmed. */
  error?: string;
}

export const DEFAULT_MAX_BODY_BYTES = 10 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_DEEP_CHECK_CANDIDATES = 5;

/** Kept exported for compatibility with callers importing the original helper. */
export class FileDownloadError extends Error {
  constructor(reason: string) {
    super(`Skipped: response is a file download (${reason})`);
    this.name = "FileDownloadError";
  }
}

interface OperationScope {
  signal: AbortSignal;
  timedOut: () => boolean;
  cleanup: () => void;
}

interface ReadBodyResult {
  text?: string;
  error?: string;
}

interface ParsedPlaylist {
  type: PlaylistType;
  valid: boolean;
  error?: string;
  /** Populated only when the caller needs variant details or deep checking. */
  variants: VariantStreamInfo[];
  variantCount: number;
  resolution: ResolutionTier;
  iframeVariantCount: number;
  segmentUrls: string[];
  partUrls: string[];
  segmentCount: number;
  partCount: number;
  isLive?: boolean;
}

type ProbeStatus = "ok" | "unplayable" | "unknown";

interface ProbeResult {
  status: ProbeStatus;
  error?: string;
  httpStatus?: number;
}

/** Only HTTP(S) URLs are fetchable by this verifier. */
export function isVerifiableM3U8Url(url: string): boolean {
  if (!url || !url.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function createOperationScope(timeoutMs: number, callerSignal?: AbortSignal): OperationScope {
  const controller = new AbortController();
  let didTimeOut = false;
  const timeoutError = new Error(`Timed out after ${timeoutMs}ms`);

  const timer = setTimeout(() => {
    didTimeOut = true;
    controller.abort(timeoutError);
  }, timeoutMs);

  const abortFromCaller = () => {
    controller.abort(callerSignal?.reason ?? new Error("Request aborted"));
  };

  if (callerSignal?.aborted) {
    abortFromCaller();
  } else {
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  return {
    signal: controller.signal,
    timedOut: () => didTimeOut,
    cleanup: () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", abortFromCaller);
    },
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  return String(error ?? "Unknown error");
}

function isDefinitiveUnavailableStatus(status: number): boolean {
  // Authentication, rate limits, and server errors can be environment-dependent;
  // a 404/410 is stronger evidence that the referenced resource is gone.
  return status === 404 || status === 410;
}

function resolvedHttpUrl(reference: string, baseUrl: string): string | undefined {
  try {
    const resolved = new URL(reference, baseUrl);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return undefined;
    return resolved.toString();
  } catch {
    return undefined;
  }
}

function parseResolutionPixels(line: string): { width: number; height: number } | undefined {
  const match = line.match(/\bRESOLUTION=(\d+)x(\d+)(?:,|$)/i);
  if (!match) return undefined;

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    return undefined;
  }
  return { width, height };
}

function classifyResolution(pixels?: { width: number; height: number }): ResolutionTier {
  if (!pixels) return "unknown";
  if (pixels.width >= 3840 || pixels.height >= 2160) return "4k";
  if (pixels.width >= 1280 || pixels.height >= 720) return "hd";
  return "sd";
}

function parseBandwidth(line: string): number | undefined {
  const match = line.match(/\bBANDWIDTH=(\d+)(?:,|$)/i);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

/** Extract a quoted URI attribute from tags such as EXT-X-PART and EXT-X-I-FRAME-STREAM-INF. */
function parseQuotedUriAttribute(line: string): string | undefined {
  return line.match(/(?:^|,)\s*URI="((?:[^"\\]|\\.)*)"/i)?.[1];
}

function toLines(text: string): string[] {
  // Compact in place: split() creates one array, and trimming/filtering into
  // additional arrays is unnecessary for large playlists.
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  let write = 0;

  for (let read = 0; read < lines.length; read++) {
    const line = lines[read].trim();
    if (line) lines[write++] = line;
  }

  lines.length = write;
  return lines;
}

/**
 * Validate a URI reference cheaply for shallow checks. Relative references are
 * valid against the already-validated HTTP(S) playlist URL; construct URL
 * objects only for absolute references. Deep checks still resolve every URI.
 */
function isUsableHttpReference(reference: string): boolean {
  const value = reference.trim();
  if (!value) return false;

  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(value)?.[1]?.toLowerCase();
  if (!scheme) return true;
  if (scheme !== "http" && scheme !== "https") return false;

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Parse recognizable HLS structure. In shallow mode, collectMediaUrls=false
 * avoids allocating arrays of every media URI and avoids resolving URLs that
 * won't be fetched. collectVariants=false avoids materializing variant objects,
 * while still calculating the variant count and representative resolution.
 */
function parsePlaylist(
  text: string,
  baseUrl: string,
  options: { collectMediaUrls: boolean; collectVariants: boolean }
): ParsedPlaylist {
  const empty: ParsedPlaylist = {
    type: "unknown",
    valid: false,
    variants: [],
    variantCount: 0,
    resolution: "unknown",
    iframeVariantCount: 0,
    segmentUrls: [],
    partUrls: [],
    segmentCount: 0,
    partCount: 0,
  };

  const lines = toLines(text);
  if (lines[0] !== "#EXTM3U") {
    return { ...empty, error: "Response is not an HLS playlist (missing #EXTM3U header)" };
  }

  // Detect the playlist family and collect common flags in one pass instead of
  // running several independent Array.some() scans over the same lines.
  let hasStreamInfMarker = false;
  let hasIFrameMarker = false;
  let hasMediaRenditionMarker = false;
  let hasMediaStructure = false;
  let hasEndList = false;

  for (const line of lines) {
    if (line.startsWith("#EXT-X-STREAM-INF")) hasStreamInfMarker = true;
    if (line.startsWith("#EXT-X-I-FRAME-STREAM-INF")) hasIFrameMarker = true;
    if (line.startsWith("#EXT-X-MEDIA:")) hasMediaRenditionMarker = true;
    if (
      line.startsWith("#EXTINF") ||
      line.startsWith("#EXT-X-PART:") ||
      line.startsWith("#EXT-X-TARGETDURATION:") ||
      line.startsWith("#EXT-X-MEDIA-SEQUENCE:") ||
      line.startsWith("#EXT-X-PLAYLIST-TYPE:") ||
      line === "#EXT-X-ENDLIST" ||
      line.startsWith("#EXT-X-I-FRAMES-ONLY")
    ) {
      hasMediaStructure = true;
    }
    if (line === "#EXT-X-ENDLIST") hasEndList = true;
  }

  const looksLikeMaster = hasStreamInfMarker || hasIFrameMarker || hasMediaRenditionMarker;

  if (looksLikeMaster) {
    const variants: VariantStreamInfo[] = [];
    let variantCount = 0;
    let bestBandwidth = -1;
    let bestResolution: ResolutionTier = "unknown";
    let malformedVariant: string | undefined;
    let iframeVariantCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith("#EXT-X-STREAM-INF")) {
        // STREAM-INF's URI is the following non-empty line. Blank lines were
        // compacted by toLines(), so this remains an O(1) look-ahead.
        const uriLine = lines[i + 1];
        if (!line.startsWith("#EXT-X-STREAM-INF:") || !uriLine || uriLine.startsWith("#")) {
          malformedVariant ??= "Master playlist contains an EXT-X-STREAM-INF tag without a following URI";
          continue;
        }

        const shouldResolve = options.collectVariants;
        const resolved = shouldResolve
          ? resolvedHttpUrl(uriLine, baseUrl)
          : isUsableHttpReference(uriLine)
            ? uriLine
            : undefined;

        if (!resolved) {
          malformedVariant ??= `Master playlist contains an invalid variant URI: ${uriLine}`;
          continue;
        }

        const tier = classifyResolution(parseResolutionPixels(line));
        const bandwidth = parseBandwidth(line);
        variantCount++;

        if (
          tier !== "unknown" &&
          (bestResolution === "unknown" || (bandwidth ?? 0) > bestBandwidth)
        ) {
          bestResolution = tier;
          bestBandwidth = bandwidth ?? 0;
        }

        if (options.collectVariants) {
          variants.push({ url: resolved, resolution: tier, bandwidth });
        }
        i++; // Consume the variant URI line.
        continue;
      }

      if (line.startsWith("#EXT-X-I-FRAME-STREAM-INF")) {
        const rawUri = line.startsWith("#EXT-X-I-FRAME-STREAM-INF:")
          ? parseQuotedUriAttribute(line.slice("#EXT-X-I-FRAME-STREAM-INF:".length))
          : undefined;
        if (rawUri && isUsableHttpReference(rawUri)) iframeVariantCount++;
      }
    }

    if (malformedVariant) {
      return {
        ...empty,
        type: "master",
        variants,
        variantCount,
        resolution: bestResolution,
        iframeVariantCount,
        error: malformedVariant,
      };
    }

    // I-frame-only playlists are useful for trick-play but do not declare a
    // regular playback variant.
    if (variantCount === 0 && iframeVariantCount === 0) {
      return {
        ...empty,
        type: "master",
        variants,
        variantCount,
        resolution: bestResolution,
        iframeVariantCount,
        error: "Master playlist does not contain a usable variant URI",
      };
    }

    return {
      ...empty,
      type: "master",
      valid: true,
      variants,
      variantCount,
      resolution: bestResolution,
      iframeVariantCount,
      error:
        variantCount === 0
          ? "Playlist contains only I-frame variants; no regular playback variant is declared"
          : undefined,
    };
  }

  if (!hasMediaStructure) {
    return { ...empty, error: "Playlist has no recognizable master or media playlist tags" };
  }

  const segmentUrls: string[] = [];
  const partUrls: string[] = [];
  let segmentCount = 0;
  let partCount = 0;
  let awaitingSegmentUri = false;
  let sawExtInf = false;
  let malformedMedia: string | undefined;

  // No slice() allocation and no media URL arrays in shallow mode. Full URL
  // resolution is deferred until a resource will actually be probed.
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("#EXTINF")) {
      if (!line.startsWith("#EXTINF:") || awaitingSegmentUri) {
        malformedMedia ??= "Media playlist contains a malformed EXTINF/segment sequence";
        continue;
      }

      const duration = line.slice("#EXTINF:".length).split(",", 1)[0];
      if (!duration.trim() || !Number.isFinite(Number(duration)) || Number(duration) < 0) {
        malformedMedia ??= "Media playlist contains an invalid EXTINF duration";
        continue;
      }

      sawExtInf = true;
      awaitingSegmentUri = true;
      continue;
    }

    if (line.startsWith("#EXT-X-PART:")) {
      const rawUri = parseQuotedUriAttribute(line.slice("#EXT-X-PART:".length));
      const resolved = options.collectMediaUrls
        ? rawUri ? resolvedHttpUrl(rawUri, baseUrl) : undefined
        : rawUri && isUsableHttpReference(rawUri) ? rawUri : undefined;

      if (!resolved) {
        malformedMedia ??= "Media playlist contains an EXT-X-PART tag without a usable URI";
      } else {
        partCount++;
        if (options.collectMediaUrls) partUrls.push(resolved);
      }
      continue;
    }

    if (!line.startsWith("#")) {
      if (!awaitingSegmentUri) {
        malformedMedia ??= `Media playlist contains a URI without a preceding EXTINF tag: ${line}`;
        continue;
      }

      const resolved = options.collectMediaUrls
        ? resolvedHttpUrl(line, baseUrl)
        : isUsableHttpReference(line) ? line : undefined;

      if (!resolved) {
        malformedMedia ??= `Media playlist contains an invalid segment URI: ${line}`;
      } else {
        segmentCount++;
        if (options.collectMediaUrls) segmentUrls.push(resolved);
      }
      awaitingSegmentUri = false;
    }
  }

  if (awaitingSegmentUri) {
    malformedMedia ??= "Media playlist ends before the segment URI for its final EXTINF tag";
  }

  if (malformedMedia) {
    return {
      ...empty,
      type: "media",
      segmentUrls,
      partUrls,
      segmentCount,
      partCount,
      isLive: !hasEndList,
      error: malformedMedia,
    };
  }

  if (!sawExtInf && partCount === 0) {
    return {
      ...empty,
      type: "media",
      segmentUrls,
      partUrls,
      segmentCount,
      partCount,
      isLive: !hasEndList,
      error: "Playlist has no EXTINF segments or LL-HLS partial segments",
    };
  }

  if (segmentCount === 0 && partCount === 0) {
    return {
      ...empty,
      type: "media",
      segmentUrls,
      partUrls,
      segmentCount,
      partCount,
      isLive: !hasEndList,
      error: "Media playlist contains no playable media units",
    };
  }

  return {
    ...empty,
    type: "media",
    valid: true,
    segmentUrls,
    partUrls,
    segmentCount,
    partCount,
    isLive: !hasEndList,
  };
}

import { isBlockedIp } from "./ip-block.js";

async function fetchWithSignal(
  url: string,
  init: RequestInit,
  signal: AbortSignal
): Promise<Response> {
  const hostname = new URL(url).hostname;
  if (await isBlockedIp(hostname)) {
    throw new Error(`Blocked: ${hostname} resolves to private/reserved IP`);
  }
  return fetch(url, { ...init, signal });
}

async function cancelBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Ignore a body that has already been consumed, cancelled, or errored.
  }
}

async function readBodyWithLimit(
  response: Response,
  maxBytes: number,
  signal: AbortSignal
): Promise<ReadBodyResult> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > maxBytes) {
      await cancelBody(response);
      return { error: `Response body too large (${declared} bytes declared; limit ${maxBytes})` };
    }
  }

  if (!response.body) return { text: "" };

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel("Body limit exceeded");
        return { error: `Response body exceeds ${maxBytes} bytes; download aborted` };
      }
      chunks.push(value);
    }
  } catch (error) {
    if (signal.aborted) {
      return { error: errorMessage(signal.reason ?? error) };
    }
    return { error: `Failed to read response body: ${errorMessage(error)}` };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // The stream may already have been cancelled or errored.
    }
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { text: new TextDecoder().decode(merged) };
}

function mergeHeaders(
  base: Record<string, string>,
  overrides?: Record<string, string>
): Headers {
  const headers = new Headers(base);
  if (overrides) {
    for (const [name, value] of Object.entries(overrides)) headers.set(name, value);
  }
  return headers;
}

function isClearlyAnErrorDocument(contentType: string | null, sample: Uint8Array): boolean {
  const mime = (contentType ?? "").split(";", 1)[0].trim().toLowerCase();
  if (mime === "text/html" || mime === "application/json" || mime.endsWith("+json")) return true;

  // Content-Type is often wrong on IPTV endpoints, so reject by payload only
  // when the sample strongly resembles an HTML or JSON error page.
  const prefix = new TextDecoder()
    .decode(sample.slice(0, 1024))
    .replace(/^\uFEFF/, "")
    .trimStart()
    .toLowerCase();
  return (
    prefix.startsWith("<!doctype html") ||
    prefix.startsWith("<html") ||
    prefix.startsWith("<error") ||
    /^\{\s*"(error|message|detail|status|title)"\s*:/i.test(prefix) ||
    /^(access denied|access forbidden|forbidden|unauthorized|nosuchkey|not found|error:)/i.test(prefix) ||
    /<code>\s*(accessdenied|nosuchkey|notfound)\s*<\/code>/i.test(prefix)
  );
}

/** Probe a media resource with a small ranged GET instead of trusting HEAD alone. */
async function probeMediaResource(
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<ProbeResult> {
  let response: Response | undefined;
  try {
    const requestHeaders = mergeHeaders(headers, { Range: "bytes=0-1023" });
    response = await fetchWithSignal(url, { method: "GET", headers: requestHeaders }, signal);

    if (!response.ok) {
      const firstStatus = response.status;
      const firstStatusText = response.statusText;
      await cancelBody(response);

      // Some origins reject Range requests even though a normal GET works. Retry
      // without Range before declaring the media URL unavailable.
      const fallbackStatuses = new Set([400, 403, 405, 416, 501]);
      if (fallbackStatuses.has(firstStatus)) {
        const fallbackHeaders = new Headers(headers);
        fallbackHeaders.delete("range");
        response = await fetchWithSignal(url, { method: "GET", headers: fallbackHeaders }, signal);
      }

      if (!response.ok) {
        const status = response.status;
        const statusText = response.statusText || firstStatusText;
        await cancelBody(response);
        return {
          status: isDefinitiveUnavailableStatus(status) ? "unplayable" : "unknown",
          httpStatus: status,
          error: `HTTP ${status} ${statusText}`.trim(),
        };
      }
    }

    if (!response.body) {
      return { status: "unplayable", error: "Media resource returned an empty body" };
    }

    const reader = response.body.getReader();
    try {
      const sampleChunks: Uint8Array[] = [];
      let sampleLength = 0;
      const sampleLimit = 1024;

      while (sampleLength < sampleLimit) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value?.byteLength) continue;

        const remaining = sampleLimit - sampleLength;
        const piece = value.byteLength > remaining ? value.slice(0, remaining) : value;
        sampleChunks.push(piece);
        sampleLength += piece.byteLength;
      }

      if (sampleLength === 0) {
        return { status: "unplayable", error: "Media resource returned an empty body" };
      }

      const sample = new Uint8Array(sampleLength);
      let offset = 0;
      for (const chunk of sampleChunks) {
        sample.set(chunk, offset);
        offset += chunk.byteLength;
      }

      if (isClearlyAnErrorDocument(response.headers.get("content-type"), sample)) {
        return { status: "unplayable", error: "Media URL returned an HTML/JSON response, not media data" };
      }

      return { status: "ok" };
    } finally {
      try {
        await reader.cancel();
      } catch {
        // The fetch may have aborted while the sample was being read.
      }
      try {
        reader.releaseLock();
      } catch {
        // Ignore a reader that was already released.
      }
    }
  } catch (error) {
    if (signal.aborted) {
      return { status: "unknown", error: errorMessage(signal.reason ?? error) };
    }
    return { status: "unknown", error: `Media probe failed: ${errorMessage(error)}` };
  } finally {
    if (response) await cancelBody(response);
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

async function probeMediaUnits(
  urls: string[],
  headers: Record<string, string>,
  signal: AbortSignal,
  maxCandidates: number
): Promise<ProbeResult> {
  const candidates = unique(urls);
  if (candidates.length === 0) {
    return { status: "unplayable", error: "Media playlist contains no probeable segment or part URI" };
  }

  let sawUnknown = false;
  const errors: string[] = [];
  const tested = candidates.slice(0, maxCandidates);

  for (const candidate of tested) {
    const probe = await probeMediaResource(candidate, headers, signal);
    if (probe.status === "ok") return probe;
    if (probe.status === "unknown") sawUnknown = true;
    if (probe.error) errors.push(`${candidate}: ${probe.error}`);
    if (signal.aborted) {
      return { status: "unknown", error: errorMessage(signal.reason) };
    }
  }

  // If there are more candidates than we probed, failure is inconclusive—not
  // proof that the entire playlist is dead.
  if (candidates.length > tested.length || sawUnknown) {
    return {
      status: "unknown",
      error: errors[0] ?? `No media unit passed; only ${tested.length} of ${candidates.length} candidates were checked`,
    };
  }

  return {
    status: "unplayable",
    error: errors[0] ?? `None of the ${tested.length} media resources could be reached`,
  };
}

async function checkMediaPlaylistReachable(
  url: string,
  headers: Record<string, string>,
  maxBodyBytes: number,
  maxCandidates: number,
  signal: AbortSignal
): Promise<ProbeResult> {
  let response: Response | undefined;
  try {
    response = await fetchWithSignal(url, { headers }, signal);
    if (!response.ok) {
      const status = response.status;
      await cancelBody(response);
      return {
        status: isDefinitiveUnavailableStatus(status) ? "unplayable" : "unknown",
        httpStatus: status,
        error: `HTTP ${status} ${response.statusText}`.trim(),
      };
    }

    const responseUrl = response.url || url;
    const body = await readBodyWithLimit(response, maxBodyBytes, signal);
    if (body.error !== undefined || body.text === undefined) {
      return {
        // An unreadable/oversized body is inconclusive, not proof of an invalid stream.
        status: "unknown",
        error: body.error ?? "Failed to read variant playlist body",
      };
    }

    const parsed = parsePlaylist(body.text, responseUrl, {
      collectMediaUrls: true,
      collectVariants: true,
    });
    if (!parsed.valid) {
      return { status: "unplayable", error: parsed.error ?? "Variant URL did not return a valid playlist" };
    }
    if (parsed.type !== "media") {
      return {
        status: "unplayable",
        error: "A regular variant URI returned a master playlist instead of a media playlist",
      };
    }

    return probeMediaUnits(
      [...parsed.segmentUrls, ...parsed.partUrls],
      headers,
      signal,
      maxCandidates
    );
  } catch (error) {
    if (signal.aborted) return { status: "unknown", error: errorMessage(signal.reason ?? error) };
    return { status: "unknown", error: `Variant playlist check failed: ${errorMessage(error)}` };
  } finally {
    if (response) await cancelBody(response);
  }
}

function sortVariantsForProbe(variants: VariantStreamInfo[]): VariantStreamInfo[] {
  // Probe high-bandwidth variants first, then fall back to other renditions.
  // Missing bandwidth is kept behind explicitly declared bandwidths.
  return [...variants].sort((a, b) => (b.bandwidth ?? -1) - (a.bandwidth ?? -1));
}

/**
 * Verify that a URL returns a coherent HLS playlist and optionally probe media
 * resources. Network failures and access restrictions are marked "unknown"
 * rather than treated as proof that the stream is dead.
 */
export async function verifyM3U8(
  url: string,
  options: VerifyOptions = {}
): Promise<VerifyResult> {
  const timeoutMs = Number.isFinite(options.timeoutMs) && (options.timeoutMs ?? 0) > 0
    ? Math.max(1, Math.floor(options.timeoutMs!))
    : DEFAULT_TIMEOUT_MS;
  const maxBodyBytes = Number.isFinite(options.maxBodyBytes) && (options.maxBodyBytes ?? 0) > 0
    ? Math.max(1, Math.floor(options.maxBodyBytes!))
    : DEFAULT_MAX_BODY_BYTES;
  const maxCandidates = Number.isFinite(options.maxDeepCheckCandidates) && (options.maxDeepCheckCandidates ?? 0) > 0
    ? Math.max(1, Math.floor(options.maxDeepCheckCandidates!))
    : DEFAULT_MAX_DEEP_CHECK_CANDIDATES;
  const headers = options.headers ?? {};
  const deepCheck = options.deepCheck ?? true;
  // Shallow checks do not need to retain each variant URL. Callers that use the
  // returned variant list for UI/reporting can opt in explicitly.
  const includeVariants = options.includeVariants ?? deepCheck;

  const result: VerifyResult = {
    url,
    isValid: false,
    isPlayable: false,
    playabilityStatus: "unknown",
    playlistType: "unknown",
    resolution: "unknown",
  };

  if (!isVerifiableM3U8Url(url)) {
    result.error = "Skipped verification: URL must use HTTP or HTTPS";
    result.playabilityStatus = "unplayable";
    return result;
  }

  const scope = createOperationScope(timeoutMs, options.signal);
  let response: Response | undefined;

  try {
    if (scope.signal.aborted) {
      result.error = errorMessage(scope.signal.reason ?? new Error("Request aborted"));
      result.playabilityStatus = "unknown";
      return result;
    }

    response = await fetchWithSignal(url, { headers }, scope.signal);
    result.httpStatus = response.status;
    result.contentType = response.headers.get("content-type") ?? undefined;

    if (!response.ok) {
      const status = response.status;
      result.error = `HTTP ${status} ${response.statusText}`.trim();
      result.playabilityStatus = isDefinitiveUnavailableStatus(status) ? "unplayable" : "unknown";
      return result;
    }

    const responseUrl = response.url || url; // Relative paths must use the final URL after redirects.
    const body = await readBodyWithLimit(response, maxBodyBytes, scope.signal);
    if (body.error !== undefined || body.text === undefined) {
      result.error = body.error ?? "Failed to read response body";
      // A body that could not be fully read is inconclusive; don't count it as a
      // confirmed invalid playlist or a dead stream.
      result.playabilityStatus = "unknown";
      return result;
    }

    const parsed = parsePlaylist(body.text, responseUrl, {
      collectMediaUrls: deepCheck,
      collectVariants: includeVariants || deepCheck,
    });
    result.playlistType = parsed.type;
    if (parsed.type === "master") {
      result.variantCount = parsed.variantCount;
      result.resolution = parsed.resolution;
      if (includeVariants) result.variants = parsed.variants;
    } else if (parsed.type === "media") {
      result.segmentCount = parsed.segmentCount;
      result.partCount = parsed.partCount;
      result.isLive = parsed.isLive;
    }

    if (!parsed.valid) {
      result.error = parsed.error ?? "Response is not a coherent HLS playlist";
      result.playabilityStatus = "unplayable";
      return result;
    }

    result.isValid = true;

    if (parsed.type === "master" && parsed.variantCount === 0) {
      // A valid I-frame-only master can be used for seeking, but is not a normal
      // playback entry point, so do not call it playable.
      result.isPlayable = false;
      result.playabilityStatus = "unplayable";
      result.error = parsed.error ?? "No regular playback variant is declared";
      return result;
    }

    // Preserve the original shallow-check behavior. The status tells callers
    // that actual media delivery was not tested when deepCheck=false.
    result.isPlayable = true;
    result.playabilityStatus = deepCheck ? "unknown" : "unverified";

    if (!deepCheck) return result;

    if (parsed.type === "master") {
      const candidates = sortVariantsForProbe(parsed.variants);
      const toCheck = candidates.slice(0, maxCandidates);
      let sawUnknown = false;
      const errors: string[] = [];

      for (const variant of toCheck) {
        const check = await checkMediaPlaylistReachable(
          variant.url,
          headers,
          maxBodyBytes,
          maxCandidates,
          scope.signal
        );
        if (check.status === "ok") {
          result.isPlayable = true;
          result.playabilityStatus = "confirmed";
          result.deepCheckPassed = true;
          result.error = undefined;
          return result;
        }
        if (check.status === "unknown") sawUnknown = true;
        if (check.error) errors.push(`${variant.url}: ${check.error}`);
        if (scope.signal.aborted) break;
      }

      result.isPlayable = false;
      result.deepCheckPassed = false;
      result.playabilityStatus =
        scope.signal.aborted || sawUnknown || candidates.length > toCheck.length
          ? "unknown"
          : "unplayable";
      result.error = errors[0] ?? "No variant passed the deep check";
      return result;
    }

    const mediaCheck = await probeMediaUnits(
      [...parsed.segmentUrls, ...parsed.partUrls],
      headers,
      scope.signal,
      maxCandidates
    );
    result.deepCheckPassed = mediaCheck.status === "ok";
    result.isPlayable = mediaCheck.status === "ok";
    result.playabilityStatus =
      mediaCheck.status === "ok"
        ? "confirmed"
        : mediaCheck.status === "unplayable"
          ? "unplayable"
          : "unknown";
    if (!result.isPlayable) result.error = mediaCheck.error ?? "No media resource passed the deep check";

    return result;
  } catch (error) {
    result.isPlayable = false;
    result.playabilityStatus = "unknown";
    result.error = scope.signal.aborted
      ? errorMessage(scope.signal.reason ?? error)
      : `Network error: ${errorMessage(error)}`;
    return result;
  } finally {
    if (response) await cancelBody(response);
    scope.cleanup();
  }
}
