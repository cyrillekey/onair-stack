/**
 * Returns true if the given name contains profanity, false otherwise.
 *
 * Two lists are used to limit false positives on real names:
 *  - SUBSTRING_WORDS: unambiguous terms, flagged even when embedded
 *    in a longer string (e.g. "xXfuckXx").
 *  - EXACT_WORDS: terms that are also common names or fragments of
 *    legitimate names (e.g. "Dick", "Cockburn", "Assumpta"), flagged
 *    only when they appear as a standalone word.
 *
 * Extend the lists (or swap in a library such as "bad-words" or
 * "obscenity") for production use and for other languages.
 */

const SUBSTRING_WORDS = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "whore",
  "slut",
  "wanker",
  "bollocks",
  // racial slurs that are safe to match inside longer strings
  "wetback",
  "towelhead",
  "raghead",
].map(squeeze);

const EXACT_WORDS = new Set([
  "dick",
  "cock",
  "cunt",
  "twat",
  // racial slurs that double as names, surnames or common words, so only
  // flagged as standalone words (e.g. "Spicer" and "Chinkara" pass)
  "chink",
  "gook",
  "spic",
  "kike",
  "coon",
  "beaner",
  "paki",
]);

/**
 * Patterns run against the letters-only string WITHOUT collapsing repeats,
 * because collapsing would turn a slur into a real place name
 * (e.g. "nigger" -> "niger", which would flag "Niger" and "Nigerian").
 * The lookahead keeps words like "niggardly" from matching.
 */
const PATTERNS: RegExp[] = [/ni+g{2,}(er|ah?)(?!rd)/];

const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
  "!": "i",
};

/** Collapse repeated letters: "fuuuck" -> "fuck". */
function squeeze(s: string): string {
  return s.replace(/(.)\1+/g, "$1");
}

/** Lowercase, strip accents, and undo common character substitutions. */
function normalize(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[0134577@$!]/g, (c) => LEET[c] ?? c);
}

export function isProfane(name: string): boolean {
  const normalized = normalize(name);

  // 1. Standalone words (split on anything that isn't a letter).
  const tokens = normalized.split(/[^a-z]+/).filter(Boolean);
  if (tokens.some((t) => EXACT_WORDS.has(t))) return true;

  // 2. Unambiguous words, even when padded, spaced out, or stretched
  //    ("f.u.c.k", "fuuuck", "xxshitxx").
  const letters = normalized.replace(/[^a-z]/g, "");
  if (PATTERNS.some((p) => p.test(letters))) return true;

  const collapsed = squeeze(letters);
  return SUBSTRING_WORDS.some((w) => collapsed.includes(w));
}

// Examples
// isProfane("John Smith");   // false
// isProfane("Dick Van Dyke"); // true  (standalone word; see note below)
// isProfane("Cockburn");     // false
// isProfane("Scunthorpe");   // false
// isProfane("f.u.c.k");      // true
// isProfane("sh1t");         // true
// isProfane("Nigeria");      // false (not confused with a slur)
// isProfane("Spicer");       // false (slur only flagged as a standalone word)
// isProfane("n1gg3r");       // true
