import { type models } from "@/prisma/contract.js";

type Category = typeof models.public.Channel.category;

/**
 * Keyword-based channel classifier.
 *
 * Rules are checked IN ORDER and the first match wins, so more specific
 * categories come before broader ones (e.g. "Sports Radio" is RADIO, and
 * "Investigation Discovery" is CRIME rather than DOCUMENTARY).
 *
 * Keywords are regex fragments matched against whole words, so "sports?"
 * matches "sport" and "sports" but not "transport". Digits after a word
 * are fine, so "ESPN2" still matches "espn".
 */
type Rule = { category: Category; keywords: string[] };

const RULES: Rule[] = [
  {
    category: "ADULT",
    keywords: [
      "playboy",
      "hustler",
      "penthouse",
      "xxx",
      "porno?",
      "erotic(?:a|s)?",
      "adults?(?! swim| contemporary)",
    ],
  },
  {
    category: "RADIO",
    keywords: [
      "radio",
      "fm",
      "lbc",
      "talk ?sport",
      "podcasts?",
      "heart (?:uk|dance|extra|\\d0s)",
    ],
  },
  {
    category: "KIDS",
    keywords: [
      "kids?",
      "kidz",
      "children(?: s)?",
      "nickelodeon",
      "nick jr",
      "nicktoons?",
      "disney",
      "cartoons?",
      "cbbc",
      "cbeebies",
      "boomerang",
      "baby ?tv",
      "junior",
      "toons?",
      "sprout",
    ],
  },
  {
    category: "RELIGIOUS",
    keywords: [
      "ewtn",
      "tbn",
      "3abn",
      "daystar",
      "church",
      "christian",
      "gospel",
      "bible",
      "catholic",
      "islam(?:ic)?",
      "quran",
      "hindu",
      "jesus",
      "god",
      "faith",
      "sermons?",
      "prayer",
      "worship",
      "ministr(?:y|ies)",
      "salaam",
    ],
  },
  {
    category: "SHOPPING",
    keywords: [
      "qvc",
      "hsn",
      "shop(?:ping|hq)?",
      "jewel(?:ry|lery) television",
      "jtv",
      "ideal world",
    ],
  },
  {
    category: "SPORTS",
    keywords: [
      "sports?(?:net|center)?",
      "nba",
      "wnba",
      "nfl",
      "mlb",
      "nhl",
      "mls",
      "ufc",
      "wwe",
      "aew",
      "ncaa",
      "espn",
      "bein",
      "dazn",
      "eurosport",
      "league pass",
      "football",
      "soccer",
      "basketball",
      "baseball",
      "hockey",
      "cricket",
      "tennis",
      "golf",
      "rugby",
      "boxing",
      "wrestling",
      "mma",
      "olympics?",
      "racing",
      "nascar",
      "motogp",
      "f1",
      "formula 1",
      "premier league",
      "la liga",
      "serie a",
      "bundesliga",
      "champions league",
    ],
  },
  {
    category: "CRIME",
    keywords: [
      "crime",
      "criminal",
      "court tv",
      "law and crime",
      "investigation",
      "justice",
      "murder",
      "forensic",
      "detective",
      "cold case",
      "police",
      "cops?",
    ],
  },
  {
    category: "MOVIES",
    keywords: [
      "films?",
      "movies?",
      "cinema",
      "cine(?:max|plex)?",
      "hbo",
      "starz",
      "showtime",
      "mgm",
      "epix",
      "encore",
      "flix",
      "tcm",
      "multiplex",
      "kino",
    ],
  },
  {
    category: "NEWS",
    keywords: [
      "news",
      "cnn",
      "msnbc",
      "cnbc",
      "bloomberg",
      "newsmax",
      "newsnation",
      "weather",
      "headlines?",
      "business",
      "financ(?:e|ial)",
      "al jazeera",
      "euronews",
      "france 24",
      "cgtn",
      "wion",
      "c ?span",
      "parliament",
    ],
  },
  {
    category: "MUSIC",
    keywords: [
      "music",
      "vevo",
      "mtv",
      "vh1",
      "axs",
      "hits?",
      "karaoke",
      "concerts?",
      "jukebox",
      "cmt",
      "hip ?hop",
      "rnb",
      "rock",
      "jazz",
      "reggae",
      "stingray",
      "kerrang",
      "qello",
    ],
  },
  {
    category: "DOCUMENTARY",
    keywords: [
      "documentar(?:y|ies)",
      "docus?",
      "discovery",
      "nat(?:ional)? geo(?:graphic)?",
      "history",
      "curiosity",
      "quest",
      "science",
      "smithsonian",
      "animal planet",
      "nature",
      "wildlife",
      "biography",
      "knowledge",
      "viceland",
      "ancient",
    ],
  },
  {
    category: "LIFESTYLE",
    keywords: [
      "food",
      "cook(?:ing|ery)?",
      "chefs?",
      "kitchen",
      "bak(?:e|ing)",
      "recipes?",
      "hgtv",
      "home",
      "garden(?:ing)?",
      "tastemade",
      "travel",
      "pets?",
      "lifestyle",
      "fashion",
      "beauty",
      "fitness",
      "health",
      "wellness",
      "diy",
      "design",
      "property",
      "real estate",
      "fine living",
    ],
  },
  {
    category: "OUTDOORS_AUTO",
    keywords: [
      "outdoors?",
      "hunt(?:ing)?",
      "fish(?:ing)?",
      "sportsman",
      "pursuit",
      "camping",
      "motors?",
      "automotive",
      "auto",
      "cars?",
      "trucks?",
      "hot rod",
      "garage",
      "off ?road",
      "rv",
    ],
  },
  {
    category: "CLASSIC_TV",
    keywords: [
      "classic",
      "retro",
      "me ?tv",
      "antenna tv",
      "tv land",
      "rewind",
      "vintage",
      "nostalgia",
      "oldies",
      "decades",
      "throwback",
      "sitcoms?",
      "heroes and icons",
    ],
  },
  {
    category: "INTERNATIONAL",
    keywords: [
      "univision",
      "telemundo",
      "kbs",
      "zee",
      "star plus",
      "spanish",
      "espanol",
      "latino",
      "latina",
      "hindi",
      "punjabi",
      "tamil",
      "telugu",
      "urdu",
      "bangla",
      "bengali",
      "gujarati",
      "marathi",
      "malayalam",
      "kannada",
      "arabic",
      "arab",
      "chinese",
      "mandarin",
      "cantonese",
      "korean",
      "japanese",
      "turkish",
      "persian",
      "farsi",
      "filipino",
      "tagalog",
      "vietnamese",
      "thai",
      "polish",
      "russian",
      "french",
      "german",
      "italian",
      "portuguese",
      "african",
      "caribbean",
      "asian",
      "desi",
      "bollywood",
      "nollywood",
      "kdrama",
      "k drama",
      "telenovelas?",
      "india(?:n)?",
      "pakistan(?:i)?",
    ],
  },
  {
    // Mainstream general-entertainment brands (checked last on purpose, so
    // "Fox News" or "Fox Sports" are already caught by their own rules).
    category: "ENTERTAINMENT",
    keywords: [
      "itv",
      "bbc (?:one|two|three|four)",
      "channel (?:4|5)",
      "e4",
      "tnt",
      "lifetime",
      "tlc",
      "abc",
      "cbs",
      "nbc",
      "fox",
      "cw",
      "amc",
      "fx",
      "bravo",
      "syfy",
      "comedy",
      "drama",
      "reality",
      "entertainment",
      "hallmark",
      "paramount network",
      "usa network",
      "adult swim",
      "sky (?:one|witness|atlantic|showcase)",
      "dave",
    ],
  },
];

const MATCHERS = RULES.map(({ category, keywords }) => ({
  category,
  regex: new RegExp(`(?<![a-z])(?:${keywords.join("|")})(?![a-z])`),
}));

/** Lowercase, strip accents, split camelCase, and reduce to words and digits. */
function normalize(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2") // talkSPORT -> talk SPORT, MotorTrend -> Motor Trend
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function classifyTvChannel(name: string): Category {
  const normalized = normalize(name ?? "");
  if (!normalized) return "GENERAL";

  for (const { category, regex } of MATCHERS) {
    if (regex.test(normalized)) return category;
  }
  return "GENERAL";
}

// Examples
// classifyChannel("ESPN2 HD");              // SPORTS
// classifyChannel("NBA League Pass 4");     // SPORTS
// classifyChannel("talkSPORT");             // RADIO
// classifyChannel("BBC Radio 4");           // RADIO
// classifyChannel("Crime + Investigation"); // CRIME
// classifyChannel("Cinemax Action");        // MOVIES
// classifyChannel("Disney Junior");         // KIDS
// classifyChannel("Adult Swim");            // ENTERTAINMENT (not ADULT)
// classifyChannel("Some Random Channel");   // GENERAL
