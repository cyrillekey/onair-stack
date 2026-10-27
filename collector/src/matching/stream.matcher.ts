import similarity from "similarity";

export interface StreamMatcherConfig {
  /** Minimum confidence threshold for a match (default: 0.75) */
  minConfidence: number;
  qualityTokens: string[];
  stopWords: string[];
}

export interface ParsedName {
  /** Base network name without variant/quality/region/language */
  network: string;
  /** Variant identifier: number (1,2,3) or word (premier, news, main event) */
  variant: string | null;
  /** Quality suffix: hd, fhd, 4k, etc. */
  quality: string | null;
  /** Region code: us, uk, mena, etc. */
  region: string | null;
  /** Language code: en, ar, fr, etc. */
  language: string | null;
  /** All raw tokens after stop-word removal */
  rawTokens: string[];
}

export interface MatchResult {
  /** Whether the match passes the confidence threshold */
  matched: boolean;
  /** Confidence score 0-1 */
  confidence: number;
  /** Tokens that contributed to the match */
  /** Parsed stream name */
  stream?: string;
  /** Parsed channel name */
  channel?: string;
}

const DEFAULT_CONFIG: StreamMatcherConfig = {
  minConfidence: 0.8,
  qualityTokens: ["hd", "fhd", "uhd", "4k", "720p", "1080p", "2160p", "sd"],
  stopWords: [
    "live",
    "tv",
    "channel",
    "network",
    "stream",
    "official",
    "internacional",
    "television",
  ],
};

export class StreamMatcher {
  private config: StreamMatcherConfig;

  constructor(config: Partial<StreamMatcherConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  /**
   * Match a stream name against a channel name
   */
  match(streamName: string, channelName: string): MatchResult {
    const channelNumbers = channelName.replace(/\D/gi, "");
    const streamNumbers = streamName.replace(/\D/gi, "");
    // for channels with digits that do not match break early as non matching
    if (channelNumbers != streamNumbers) {
      return {
        channel: undefined,
        stream: undefined,
        confidence: 0,
        matched: false,
      };
    } else {
      // strip numbers and compare
      const strippedChannel = channelName.replace(/\d/gi, "").trim();
      const strippedStreams = streamName.replace(/\d/gi, "").trim();
      // empty string or matches exactly. Mark as similar exit early
      if (strippedChannel.toLowerCase() == strippedStreams.toLowerCase()) {
        return {
          matched: true,
          confidence: 1,
          channel: strippedChannel,
          stream: strippedStreams,
        };
      } else {
        // strip out common channel identifiers
        const pureChannel = strippedChannel
          .replace(/(?:\s*(?:network|tv|international))+$/i, "")
          .trim();

        const pureStream = strippedStreams
          .replace(/(?:\s*(?:network|tv|international|internacional))+$/i, "")
          .trim();
        // strip quality
        const channelStripQuality = pureChannel
          .replace(/\s*\(?\b(?:SD|HD|FHD|4K|8K|HVEC)\)?\s*$/gi,"")
          .trim();
        const streamStripQuality = pureStream
          .replace(/\s*\(?\b(?:SD|HD|FHD|4K|8K|HVEC)\)?\s*$/gi,"")
          .trim();
        const cleanChannel = channelStripQuality
          .replace(/\[\s*\]|\(\s*\)|\{\s*\}/g, "")
          .trim();
        const cleanStream = streamStripQuality
          .replace(/\[\s*\]|\(\s*\)|\{\s*\}/g, "")
          .trim();

        const confidence = similarity(
          cleanChannel.toLowerCase(),
          cleanStream.toLowerCase(),
        );

        return {
          confidence,
          matched: confidence >= this.config.minConfidence,
          channel: cleanChannel,
          stream: cleanStream,
        };
      }
    }
  }

  /**
   * Find the best matching channel from a list
   */
  findBestMatch(
    streamName: string,
    channelNames: string[],
  ): { channel: string; result: MatchResult } | null {
    const results = channelNames
      .map((channel) => ({ channel, result: this.match(streamName, channel) }))
      .filter((r) => r.result.matched)
      .sort((a, b) => b.result.confidence - a.result.confidence);

    return results[0] ?? null;
  }
}
/**
 * Default matcher instance for convenience
 */
export const defaultStreamMatcher = new StreamMatcher();
