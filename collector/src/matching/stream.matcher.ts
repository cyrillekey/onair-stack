export interface StreamMatcherConfig {
  /** Minimum confidence threshold for a match (default: 0.75) */
  minConfidence: number;
  /**
   * If true, both stream and channel must have the same variant when both have one (default: true)
   *
   * @example
   * // requireVariantMatch = true (default)
   * matcher.match("beIN Sports 2", "beIN Sports 1")  // ❌ BLOCKED: variant "2" ≠ "1"
   * matcher.match("beIN Sports 1", "beIN Sports 1")  // ✅ MATCH: variant "1" = "1"
   *
   * @example
   * // requireVariantMatch = false (DANGEROUS - allows cross-channel contamination)
   * matcher.match("beIN Sports 2", "beIN Sports 1")  // ⚠️ Would match (not recommended)
   */
  requireVariantMatch: boolean;
  /**
   * If true, allow a stream with a variant to match a channel without one,
   * e.g. "Sports 1" matches the generic "Sports" channel (default: true).
   *
   * The opposite direction is always blocked: a stream without a variant must
   * never be attached to a more specific channel, e.g. "Willow" must not match
   * "Willow Cricket" or "Willow 2 Xtra".
   *
   * @example
   * // allowVariantSubset = true (default)
   * matcher.match("beIN Sports 1", "beIN Sports")      // ✅ MATCH: stream has variant, channel doesn't
   * matcher.match("beIN Sports", "beIN Sports 1")      // ❌ BLOCKED: stream lacks the channel's variant
   *
   * @example
   * // allowVariantSubset = false (strict - for beIN, premium channels)
   * matcher.match("beIN Sports 1", "beIN Sports")      // ❌ BLOCKED: stream has variant, channel doesn't
   * matcher.match("beIN Sports", "beIN Sports 1")      // ❌ BLOCKED: channel has variant, stream doesn't
   * matcher.match("beIN Sports 1", "beIN Sports 1")    // ✅ MATCH: both have same variant
   */
  allowVariantSubset: boolean;
  /** Bonus for matching quality suffix (default: 0.05) */
  qualityBonus: number;
  /** Bonus for matching region (default: 0.05) */
  regionBonus: number;
  /** Bonus for matching language (default: 0.03) */
  languageBonus: number;
  /** Known variant tokens (numbers + variant words) */
  variantTokens: string[];
  /** Known quality tokens */
  qualityTokens: string[];
  /** Known region tokens */
  regionTokens: string[];
  /** Known language tokens */
  languageTokens: string[];
  /** Stop words to ignore in network name */
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
  matchedTokens: string[];
  /** Human-readable reason for debugging */
  reason: string;
  /** Parsed stream name */
  stream: ParsedName;
  /** Parsed channel name */
  channel: ParsedName;
}

const DEFAULT_CONFIG: StreamMatcherConfig = {
  minConfidence: 0.8,
  requireVariantMatch: true,
  allowVariantSubset: true,
  qualityBonus: 0.05,
  regionBonus: 0.05,
  languageBonus: 0.03,
  variantTokens: [
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "premier",
    "news",
    "main event",
    "f1",
    "f2",
    "action",
    "extra",
    "plus",
    "max",
    "select",
    "showcase",
    "cricket",
    "golf",
    "football",
    "tennis",
    "racing",
    "documentary",
    "movies",
    "kids",
    "family",
    "entertainment",
  ],
  qualityTokens: ["hd", "fhd", "uhd", "4k", "720p", "1080p", "2160p", "sd"],
  regionTokens: [
    "us",
    "usa",
    "uk",
    "mena",
    "eu",
    "ca",
    "au",
    "fr",
    "de",
    "it",
    "es",
    "br",
    "mx",
    "latam",
    "apac",
  ],
  languageTokens: [
    "en",
    "ar",
    "fr",
    "es",
    "pt",
    "de",
    "it",
    "tr",
    "ru",
    "hi",
    "zh",
    "ja",
    "ko",
  ],
  stopWords: ["live", "tv", "channel", "network", "stream", "official"],
};

/**
 * Normalizes a token for comparison (handles ESPN2 -> ESPN 2, beINSports -> beIN Sports)
 * Preserves single-letter + number patterns like F1, F2, G1 (motorsport variants)
 */
function normalizeToken(token: string): string {
  return (
    token
      .normalize("NFC") // compose accents so "é" matches "e + combining accent"
      .toLowerCase()
      // Don't split single letter + digit (F1, F2, G1, etc.) - these are known variants
      .replace(/(\p{L}{2,})(\p{N})/gu, "$1 $2") // ESPN2 -> ESPN 2 (but not F1)
      .replace(/(\p{N})(\p{L}{2,})/gu, "$1 $2") // 2HD -> 2 HD (but not 1F)
      // Keep letters/numbers/marks from every script (Cyrillic, Greek, Arabic, ...),
      // not just ASCII like \w does; replace other punctuation with a space.
      .replace(/[^\p{L}\p{N}\p{M}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Dice coefficient similarity (0-1) using multisets of character bigrams.
 *
 * Multiset counts matter: with set semantics "bang bang" and "bang" have the
 * same bigrams, so a repeated word adds no weight and short/prefix names look
 * artificially similar. Counting duplicates keeps repetition significant.
 */
function diceSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const aBigrams = new Map<string, number>();
  let aBigramCount = 0;
  for (let i = 0; i < a.length - 1; i++) {
    const bg = a.slice(i, i + 2);
    aBigrams.set(bg, (aBigrams.get(bg) ?? 0) + 1);
    aBigramCount++;
  }

  let bBigramCount = 0;
  let intersection = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bg = b.slice(i, i + 2);
    bBigramCount++;
    const remaining = aBigrams.get(bg) ?? 0;
    if (remaining > 0) {
      intersection++;
      aBigrams.set(bg, remaining - 1);
    }
  }

  return (2 * intersection) / (aBigramCount + bBigramCount);
}

/**
 * How much of `tokens` is accounted for by the other name (0-1).
 *
 * A token counts as covered when it appears verbatim in the other name
 * (including across token boundaries, e.g. "skysports" vs "sky sports") or
 * when it is a close typo of one of the other name's tokens.
 */
function tokenCoverage(
  tokens: string[],
  otherTokens: string[],
  otherCompact: string,
): number {
  if (tokens.length === 0 || otherTokens.length === 0) return 0;

  let covered = 0;
  for (const token of tokens) {
    if (otherCompact.includes(token)) {
      covered += 1;
      continue;
    }

    let best = 0;
    for (const other of otherTokens) {
      best = Math.max(best, diceSimilarity(token, other));
    }
    covered += best;
  }

  return covered / tokens.length;
}

/**
 * Network similarity (0-1).
 *
 * Character similarity alone is too forgiving for short names: "Bang Bang"
 * and "Bang U" share almost every bigram despite the mismatched second word.
 * The token-coverage factor penalizes tokens that the other name does not
 * account for, so matching requires both character and token agreement.
 */
function networkSimilarity(tokensA: string[], tokensB: string[]): number {
  const compactA = tokensA.join("");
  const compactB = tokensB.join("");
  if (!compactA || !compactB) return 0;

  const charScore = diceSimilarity(compactA, compactB);
  const coverage = Math.min(
    tokenCoverage(tokensA, tokensB, compactB),
    tokenCoverage(tokensB, tokensA, compactA),
  );

  return charScore * coverage;
}

export class StreamMatcher {
  private config: StreamMatcherConfig;

  constructor(config: Partial<StreamMatcherConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Parse a stream/channel name into structured components
   */
  parse(name: string): ParsedName {
    const normalized = normalizeToken(name);
    const tokens = normalized
      .split(/\s+/)
      .filter((t) => t.length > 0 && !this.config.stopWords.includes(t));

    // Locate the variant token(s). Channel numbers/names usually sit at the end
    // ("beIN Sports 1", "Sky Sports News") but can also prefix the network name
    // ("5 StarMAX East"), in which case the network is everything after them.
    let variant: string | null = null;
    let variantStart = -1; // index of the first variant token
    let variantLength = 0; // number of tokens the variant spans

    // Check multi-word variants first (e.g., "main event"), from the end
    for (let wordCount = 3; wordCount >= 2; wordCount--) {
      if (tokens.length >= wordCount) {
        const candidate = tokens.slice(-wordCount).join(" ");
        if (this.config.variantTokens.includes(candidate)) {
          variant = candidate;
          variantStart = tokens.length - wordCount;
          variantLength = wordCount;
          break;
        }
      }
    }

    // Otherwise take the last single-token variant (numbers included)
    if (!variant) {
      for (let i = tokens.length - 1; i >= 0; i--) {
        const token = tokens[i];
        const isNumber = /^\d+$/.test(token);
        const isVariantWord = this.config.variantTokens.includes(token);

        if (isNumber || isVariantWord) {
          variant = token;
          variantStart = i;
          variantLength = 1;
          break;
        }
      }
    }

    // Network tokens are all remaining tokens. A leading variant ("5 StarMAX
    // East") and a trailing variant ("beIN Sports 1") remove only the variant.
    // A numeric variant in the middle ("Willow 2 Xtra") leaves the trailing
    // brand token in the network, so it cannot match the plain "Willow 2".
    // Word variants describe the channel identity ("Sky Sports Premier
    // League"), so any trailing tokens after them stay ignored.
    let networkTokens: string[];
    if (variantStart === -1) {
      networkTokens = [...tokens];
    } else if (variantStart === 0) {
      networkTokens = tokens.slice(variantLength);
    } else if (/^\d+$/.test(variant ?? "")) {
      networkTokens = tokens.filter((_, index) => index !== variantStart);
    } else {
      networkTokens = tokens.slice(0, variantStart);
    }

    // Extract quality, region, language (first match anywhere in original tokens)
    const quality =
      tokens.find((t) => this.config.qualityTokens.includes(t)) ?? null;
    const region =
      tokens.find((t) => this.config.regionTokens.includes(t)) ?? null;
    const language =
      tokens.find((t) => this.config.languageTokens.includes(t)) ?? null;

    // Remove quality/region/language tokens from network tokens
    const excludeTokens = new Set(
      [quality, region, language].filter(Boolean) as string[],
    );
    networkTokens = networkTokens.filter((t) => !excludeTokens.has(t));

    return {
      network: networkTokens.join(" "),
      variant,
      quality,
      region,
      language,
      rawTokens: tokens,
    };
  }

  /**
   * Match a stream name against a channel name
   */
  match(streamName: string, channelName: string): MatchResult {
    const stream = this.parse(streamName);
    const channel = this.parse(channelName);

    // ⛔ HARD CONSTRAINT: Variant mismatch = NO MATCH
    if (this.config.requireVariantMatch && stream.variant && channel.variant) {
      if (stream.variant !== channel.variant) {
        return {
          matched: false,
          confidence: 0,
          matchedTokens: [],
          reason: `variant mismatch: "${stream.variant}" ≠ "${channel.variant}"`,
          stream,
          channel,
        };
      }
    }

    // If only one has a variant, check if subset matching is allowed
    if (stream.variant && !channel.variant) {
      if (!this.config.allowVariantSubset) {
        return {
          matched: false,
          confidence: 0,
          matchedTokens: [],
          reason: `stream has variant "${stream.variant}" but channel has none (subset not allowed)`,
          stream,
          channel,
        };
      }
    }
    // A channel-specific variant can never be satisfied by a generic stream
    // name. Allowing this would attach "Willow" to every sibling channel such
    // as "Willow Cricket" or "Willow 2 Xtra".
    if (!stream.variant && channel.variant) {
      return {
        matched: false,
        confidence: 0,
        matchedTokens: [],
        reason: `channel has variant "${channel.variant}" but stream has none`,
        stream,
        channel,
      };
    }

    // Network-level similarity (primary signal)
    const streamNetworkTokens = stream.network.split(/\s+/).filter(Boolean);
    const channelNetworkTokens = channel.network.split(/\s+/).filter(Boolean);

    let networkScore: number;
    if (streamNetworkTokens.length === 0 && channelNetworkTokens.length === 0) {
      // Both names consist only of variant/quality/region/language tokens
      // (e.g. "5 HD" vs "5"), so the variant is the only signal available.
      networkScore =
        stream.variant !== null && stream.variant === channel.variant ? 1 : 0;
    } else if (
      streamNetworkTokens.length === 0 ||
      channelNetworkTokens.length === 0
    ) {
      // A missing network name on one side is not evidence of similarity.
      networkScore = 0;
    } else {
      networkScore = networkSimilarity(
        streamNetworkTokens,
        channelNetworkTokens,
      );
    }

    // Soft signal bonuses
    let bonus = 0;
    const matchedTokens: string[] = [];

    if (stream.network && channel.network && networkScore > 0.5) {
      matchedTokens.push(stream.network);
    }

    if (
      stream.variant &&
      channel.variant &&
      stream.variant === channel.variant
    ) {
      matchedTokens.push(`variant:${stream.variant}`);
      bonus += 0.1; // Strong bonus for exact variant match
    }

    if (
      stream.quality &&
      channel.quality &&
      stream.quality === channel.quality
    ) {
      matchedTokens.push(`quality:${stream.quality}`);
      bonus += this.config.qualityBonus;
    } else if (stream.quality || channel.quality) {
      // Quality mismatch is neutral (not a penalty)
    }

    if (stream.region && channel.region && stream.region === channel.region) {
      matchedTokens.push(`region:${stream.region}`);
      bonus += this.config.regionBonus;
    }

    if (
      stream.language &&
      channel.language &&
      stream.language === channel.language
    ) {
      matchedTokens.push(`lang:${stream.language}`);
      bonus += this.config.languageBonus;
    }

    const confidence = Math.min(1, networkScore + bonus);

    const matched = confidence >= this.config.minConfidence;

    return {
      matched,
      confidence,
      matchedTokens,
      reason: matched
        ? "match"
        : `low confidence (${confidence.toFixed(2)} < ${this.config.minConfidence})`,
      stream,
      channel,
    };
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

/**
 * Convenience function for simple matching
 */
export function fuzzyMatch(
  streamName: string,
  channelName: string,
  config?: Partial<StreamMatcherConfig>,
): boolean {
  const matcher = config ? new StreamMatcher(config) : defaultStreamMatcher;
  return matcher.match(streamName, channelName).matched;
}
