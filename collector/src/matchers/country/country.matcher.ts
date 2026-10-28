import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json" with { type: "json" };

countries.registerLocale(enLocale);

type CountryCode = string;

interface CountryCodeMatch {
  code: CountryCode;
  index: number;
}

interface CountryNameMatch {
  code: CountryCode;
  index: number;
}

/**
 * Normalized output names for every ISO 3166-1 alpha-2 country code.
 * Keeping these explicit ensures channel names always resolve to a
 * stable, lowercase display name.
 */

/**
 * Alternative country names and channel-specific aliases.
 *
 * Keys are ISO 3166-1 alpha-2 country codes. Official names from the
 * locale are registered automatically; this map adds common English
 * names, abbreviations, historical names, and native spellings.
 */
const COUNTRY_ALIASES: Readonly<Record<string, readonly string[]>> = {
  AF: ["afghanistan"],
  AL: ["albania"],
  DZ: ["algeria"],
  AS: ["american samoa", "eastern samoa"],
  AD: ["andorra"],
  AO: ["angola"],
  AI: ["anguilla"],
  AQ: ["antarctica"],
  AG: ["antigua and barbuda", "antigua", "antigua barbuda"],
  AR: ["argentina"],
  AM: ["armenia"],
  AW: ["aruba"],
  AU: ["australia"],
  AT: ["austria", "österreich"],
  AZ: ["azerbaijan"],
  BS: ["bahamas", "the bahamas"],
  BH: ["bahrain"],
  BD: ["bangladesh"],
  BB: ["barbados"],
  BY: ["belarus", "byelorussia"],
  BE: ["belgium", "belgië", "belgique"],
  BZ: ["belize"],
  BJ: ["benin"],
  BM: ["bermuda"],
  BT: ["bhutan"],
  BO: ["bolivia", "plurinational state of bolivia"],
  BA: ["bosnia and herzegovina", "bosnia", "bosnia herzegovina"],
  BW: ["botswana"],
  BV: ["bouvet island"],
  BR: ["brazil", "brasil"],
  IO: [
    "british indian ocean territory",
    "chagos islands",
    "chagos archipelago",
  ],
  BN: ["brunei", "brunei darussalam"],
  BG: ["bulgaria"],
  BF: ["burkina faso"],
  BI: ["burundi"],
  KH: ["cambodia", "kampuchea"],
  CM: ["cameroon", "cameroun"],
  CA: ["canada"],
  CV: ["cape verde", "cabo verde"],
  KY: ["cayman islands", "the cayman islands"],
  CF: ["central african republic", "central african rep", "c a r"],
  TD: ["chad"],
  CL: ["chile"],
  CN: [
    "china",
    "people's republic of china",
    "peoples republic of china",
    "prc",
    "p r c",
    "mainland china",
  ],
  CX: ["christmas island"],
  CC: ["cocos islands", "cocos keeling islands", "keeling islands"],
  CO: ["colombia"],
  KM: ["comoros", "the comoros"],
  CG: [
    "congo",
    "republic of the congo",
    "congo brazzaville",
    "congo-brazzaville",
    "french congo",
  ],
  CD: [
    "democratic republic of the congo",
    "dr congo",
    "drc",
    "d r c",
    "congo kinshasa",
    "congo-kinshasa",
    "zaire",
    "belgian congo",
  ],
  CK: ["cook islands"],
  CR: ["costa rica"],
  CI: ["ivory coast", "cote d'ivoire", "côte d'ivoire"],
  HR: ["croatia", "hrvatska"],
  CU: ["cuba"],
  CY: ["cyprus"],
  CZ: ["czech republic", "czechia", "czechoslovakia"],
  DK: ["denmark", "danmark"],
  DJ: ["djibouti", "french somaliland"],
  DM: ["dominica", "commonwealth of dominica"],
  DO: ["dominican republic", "dominican rep"],
  EC: ["ecuador"],
  EG: ["egypt"],
  SV: ["el salvador"],
  GQ: ["equatorial guinea"],
  ER: ["eritrea"],
  EE: ["estonia", "eesti"],
  ET: ["ethiopia"],
  FK: ["falkland islands", "falklands", "malvinas", "islas malvinas"],
  FO: ["faroe islands", "faeroe islands", "faroes"],
  FJ: ["fiji"],
  FI: ["finland", "suomi"],
  FR: ["france", "french republic"],
  GF: ["french guiana", "guyane"],
  PF: ["french polynesia"],
  TF: ["french southern territories", "french southern and antarctic lands"],
  GA: ["gabon"],
  GM: ["gambia", "the gambia", "republic of the gambia"],
  GE: ["georgia"],
  DE: ["germany", "deutschland", "east germany", "west germany"],
  GH: ["ghana"],
  GI: ["gibraltar"],
  GR: ["greece", "hellas", "ellas"],
  GL: ["greenland", "kalaallit nunaat"],
  GD: ["grenada"],
  GP: ["guadeloupe"],
  GU: ["guam"],
  GT: ["guatemala"],
  GN: ["guinea", "guinea conakry", "guinea-conakry"],
  GW: ["guinea bissau", "guinea-bissau"],
  GY: ["guyana"],
  HT: ["haiti"],
  HM: ["heard island and mcdonald islands", "heard island", "mcdonald islands"],
  VA: ["vatican city", "vatican", "holy see", "holy see vatican city state"],
  HN: ["honduras"],
  HK: ["hong kong", "hongkong", "hk"],
  HU: ["hungary", "magyarorszag"],
  IS: ["iceland"],
  IN: ["india", "bharat"],
  ID: ["indonesia"],
  IR: ["iran", "islamic republic of iran", "persia"],
  IQ: ["iraq", "iraqia", "iraqiya", "al iraqia"],
  IE: ["ireland", "eire", "republic of ireland"],
  IL: ["israel"],
  IT: ["italy", "italia"],
  JM: ["jamaica"],
  JP: ["japan", "nippon", "nihon"],
  JO: ["jordan"],
  KZ: ["kazakhstan", "kazakstan"],
  KE: ["kenya"],
  KI: ["kiribati", "gilbert islands"],
  KP: [
    "north korea",
    "dprk",
    "democratic people's republic of korea",
    "democratic peoples republic of korea",
    "korea dprk",
    "d p r k",
  ],
  KR: [
    "south korea",
    "republic of korea",
    "korea",
    "korea republic of",
    "rok",
    "r o k",
  ],
  KW: ["kuwait"],
  KG: ["kyrgyzstan", "kirghizia", "kyrgyz republic"],
  LA: ["laos", "lao", "lao pdr", "lao people's democratic republic"],
  LV: ["latvia", "latvija"],
  LB: ["lebanon"],
  LS: ["lesotho"],
  LR: ["liberia"],
  LY: ["libya"],
  LI: ["liechtenstein"],
  LT: ["lithuania", "lietuva"],
  LU: ["luxembourg", "luxemburg"],
  MO: ["macao", "macau"],
  MG: ["madagascar"],
  MW: ["malawi"],
  MY: ["malaysia"],
  MV: ["maldives", "maldive islands"],
  ML: ["mali"],
  MT: ["malta"],
  MH: ["marshall islands", "the marshall islands"],
  MQ: ["martinique"],
  MR: ["mauritania"],
  MU: ["mauritius"],
  YT: ["mayotte"],
  MX: ["mexico", "méxico"],
  FM: ["micronesia", "federated states of micronesia", "fsm", "f s m"],
  MD: ["moldova", "republic of moldova", "moldavia"],
  MC: ["monaco"],
  MN: ["mongolia"],
  MS: ["montserrat"],
  MA: ["morocco", "maroc"],
  MZ: ["mozambique", "mocambique"],
  MM: ["myanmar", "burma"],
  NA: ["namibia", "south west africa"],
  NR: ["nauru"],
  NP: ["nepal"],
  NL: [
    "netherlands",
    "the netherlands",
    "netherlands kingdom of the",
    "holland",
    "nederland",
  ],
  NC: ["new caledonia"],
  NZ: ["new zealand", "aotearoa"],
  NI: ["nicaragua"],
  NE: ["niger"],
  NG: ["nigeria"],
  NU: ["niue"],
  NF: ["norfolk island"],
  MK: [
    "north macedonia",
    "macedonia",
    "republic of north macedonia",
    "the republic of north macedonia",
  ],
  MP: ["northern mariana islands", "mariana islands"],
  NO: ["norway", "norge"],
  OM: ["oman"],
  PK: ["pakistan"],
  PW: ["palau"],
  PS: [
    "palestine",
    "state of palestine",
    "palestinian territories",
    "palestinian territory",
  ],
  PA: ["panama"],
  PG: ["papua new guinea", "png", "p n g"],
  PY: ["paraguay"],
  PE: ["peru", "perú"],
  PH: ["philippines", "the philippines", "pilipinas"],
  PN: ["pitcairn", "pitcairn islands"],
  PL: ["poland", "polska"],
  PT: ["portugal"],
  PR: ["puerto rico"],
  QA: ["qatar"],
  RE: ["reunion", "réunion", "reunion island"],
  RO: ["romania", "roumania", "rumania"],
  RU: ["russia", "russian federation", "soviet union", "ussr", "u s s r"],
  RW: ["rwanda"],
  SH: [
    "saint helena",
    "st helena",
    "saint helena ascension and tristan da cunha",
  ],
  KN: [
    "saint kitts and nevis",
    "st kitts and nevis",
    "saint kitts",
    "st kitts",
    "saint kitts nevis",
    "st kitts nevis",
  ],
  LC: ["saint lucia", "st lucia"],
  PM: [
    "saint pierre and miquelon",
    "st pierre and miquelon",
    "saint pierre",
    "st pierre",
  ],
  VC: [
    "saint vincent and the grenadines",
    "st vincent and the grenadines",
    "saint vincent",
    "st vincent",
  ],
  WS: ["samoa", "western samoa"],
  SM: ["san marino"],
  ST: [
    "sao tome and principe",
    "sao tome",
    "são tomé and príncipe",
    "são tomé",
  ],
  SA: ["saudi arabia", "ksa", "k s a", "kingdom of saudi arabia"],
  SN: ["senegal"],
  SC: ["seychelles"],
  SL: ["sierra leone"],
  SG: ["singapore"],
  SK: ["slovakia", "slovak republic"],
  SI: ["slovenia", "slovenija"],
  SB: ["solomon islands", "the solomon islands"],
  SO: ["somalia"],
  ZA: ["south africa", "rsa", "r s a", "republic of south africa"],
  GS: [
    "south georgia and the south sandwich islands",
    "south georgia",
    "south sandwich islands",
  ],
  ES: ["spain", "espana", "españa"],
  LK: ["sri lanka", "ceylon"],
  SD: ["sudan"],
  SR: ["suriname", "surinam"],
  SJ: ["svalbard and jan mayen", "svalbard", "jan mayen"],
  SZ: ["eswatini", "swaziland"],
  SE: ["sweden", "sverige"],
  CH: ["switzerland", "schweiz", "suisse", "svizzera", "helvetia"],
  SY: ["syria", "syrian arab republic"],
  TW: ["taiwan", "taiwan province of china", "republic of china", "formosa"],
  TJ: ["tajikistan", "tadzhikistan"],
  TZ: ["tanzania", "united republic of tanzania", "tanganyika", "zanzibar"],
  TH: ["thailand", "siam"],
  TL: ["timor leste", "east timor", "timor-leste"],
  TG: ["togo"],
  TK: ["tokelau"],
  TO: ["tonga"],
  TT: ["trinidad and tobago", "trinidad", "tobago", "trinidad tobago"],
  TN: ["tunisia"],
  TR: ["turkey", "turkiye", "türkiye", "republic of turkey"],
  TM: ["turkmenistan"],
  TC: ["turks and caicos islands", "turks and caicos", "turks caicos"],
  TV: ["tuvalu", "ellice islands"],
  UG: ["uganda"],
  UA: ["ukraine", "ukraina"],
  AE: ["united arab emirates", "uae", "u a e", "the emirates", "emirates"],
  GB: [
    "united kingdom",
    "uk",
    "great britain",
    "britain",
    "england",
    "scotland",
    "wales",
    "northern ireland",
    "u k",
  ],
  US: [
    "usa",
    "united states of america",
    "united states",
    "america",
    "the united states",
    "us",
    "u s",
    "u s a",
  ],
  UM: [
    "united states minor outlying islands",
    "us minor outlying islands",
    "minor outlying islands",
  ],
  UY: ["uruguay"],
  UZ: ["uzbekistan"],
  VU: ["vanuatu", "new hebrides"],
  VE: ["venezuela"],
  VN: ["vietnam", "viet nam", "north vietnam", "south vietnam"],
  VG: ["british virgin islands", "bvi", "b v i", "virgin islands british"],
  VI: [
    "us virgin islands",
    "u s virgin islands",
    "virgin islands us",
    "united states virgin islands",
    "uvi",
    "usvi",
    "u s v i",
  ],
  WF: ["wallis and futuna", "wallis and futuna islands", "wallis futuna"],
  EH: ["western sahara", "sahrawi arab democratic republic"],
  YE: ["yemen", "north yemen", "south yemen"],
  ZM: ["zambia"],
  ZW: ["zimbabwe", "rhodesia", "southern rhodesia"],
  AX: ["aland islands", "åland islands", "aland"],
  BQ: [
    "bonaire sint eustatius and saba",
    "caribbean netherlands",
    "bonaire",
    "sint eustatius",
    "saba",
  ],
  CW: ["curacao", "curaçao", "netherlands antilles"],
  GG: ["guernsey"],
  IM: ["isle of man", "iom", "i o m"],
  JE: ["jersey"],
  ME: ["montenegro", "crna gora"],
  BL: ["saint barthelemy", "st barthelemy", "saint barthélemy", "st barths"],
  MF: ["saint martin", "st martin", "saint martin french part"],
  RS: ["serbia", "srbija", "yugoslavia", "serbia and montenegro"],
  SX: ["sint maarten", "sint maarten dutch part"],
  SS: ["south sudan"],
  XK: ["kosovo", "republic of kosovo"],
};

/**
 * Common alternative and historical codes that are not ISO alpha-2 codes.
 *
 * These aliases are also accepted only after a dot,
 * e.g. "Channel.uk".
 */
const COUNTRY_CODE_ALIASES: Readonly<Record<string, string>> = {
  ac: "sh", // Ascension Island
  an: "cw", // Netherlands Antilles
  bu: "mm", // Burma
  cp: "fr", // Clipperton Island
  cs: "rs", // Serbia and Montenegro
  dd: "de", // East Germany
  dg: "io", // Diego Garcia
  ea: "es", // Ceuta and Melilla
  el: "gr", // Greece (EU code)
  fx: "fr", // Metropolitan France
  ic: "es", // Canary Islands
  su: "ru", // Soviet Union
  ta: "sh", // Tristan da Cunha
  tp: "tl", // East Timor
  uk: "gb", // United Kingdom
  yu: "rs", // Yugoslavia
  zr: "cd", // Zaire
};

/**
 * Channel-name noise tokens that are stripped before parsing.
 *
 * This prevents common suffixes such as "TV" from being interpreted as
 * country codes (TV -> Tuvalu) instead of the intended country (e.g.
 * "CHANNEL AU TV" -> Australia).
 *
 * Matching is case-insensitive and only removes whole words.
 */
const COUNTRY_NAME_BLACKLIST: readonly string[] = [
  "tv",
  "channel",
  "television",
  "network",
  "broadcast",
  "live",
  "stream",
  "streaming",
  "online",
  "radio",
  "news",
  "sports",
  "movies",
  "cinema",
  "kids",
  "music",
  "entertainment",
  "documentary",
  "promo",
  "trailer",
  "test",
  "backup",
  "official",
  "premium",
  "free",
  "pay",
  "plus",
  "max",
  "extra",
  "hd",
  "fhd",
  "uhd",
  "sd",
  "4k",
  "8k",
  "hq",
  "fm",
  "dd",
];

export class CountryParser {
  /**
   * Maps lowercase ISO codes to normalized country names.
   */
  private readonly countryByCode = new Map<string, string>();

  /**
   * Maps normalized country-name aliases to lowercase ISO codes.
   */
  private readonly aliasToCode = new Map<string, string>();

  /**
   * Matches country names and aliases as complete tokens.
   * Longer aliases are tested first.
   */
  private readonly countryNamePattern: RegExp;

  /**
   * Removes channel-name noise such as "TV", "HD", and "Channel"
   * before country names and codes are matched.
   */
  private readonly blacklistPattern: RegExp;

  /**
   * Country codes must be preceded by "." or whitespace, or start
   * the string, and be followed by a non-alphanumeric character or
   * the end of the string.
   *
   * Examples:
   *   "us"     -> valid
   *   ".us"    -> valid
   *   ".ru "   -> valid
   *   ".us@x"  -> valid
   *   "paraus" -> invalid
   *   ".usa"   -> not a two-letter code
   */
  private readonly countryCodePattern =
    /(?:^|[.\s])([a-z]{2})(?=$|[^a-z0-9])/gi;

  constructor() {
    this.registerCountries();

    const blacklistAlternatives = [...COUNTRY_NAME_BLACKLIST]
      .sort((a, b) => b.length - a.length)
      .map((word) => this.escapeRegex(word))
      .join("|");

    this.blacklistPattern = new RegExp(
      `\\b(?:${blacklistAlternatives})\\b`,
      "gi",
    );

    const aliases = [...this.aliasToCode.keys()].sort(
      (a, b) => b.length - a.length,
    );

    const alternatives = aliases.map((alias) =>
      this.escapeRegex(alias).replace(/ /g, "\\s+"),
    );

    this.countryNamePattern = new RegExp(
      `(?:^|\\s)(${alternatives.join("|")})(?=$|\\s)`,
      "i",
    );
  }

  /**
   * Parses a string and returns the detected country name
   * in lowercase, or null when no country is found.
   *
   * @example
   * parseCountry("Al Iraqia Sport (720p)") // "iraq"
   * parseCountry("Astrahan.Ru Sport (720p)") // "russian federation"
   * parseCountry("CRTV (Chile) (720p)") // "chile"
   * parseCountry("Fast&FunBox (Netherlands)") // "netherlands"
   * parseCountry("AE.us@East") // "united states of america"
   * parseCountry("CHANNEL AU TV") // "australia"
   * parseCountry("paraus") // null
   */
  /**
   * Parses an array of strings and returns the first detected
   * country name in lowercase, or null if no country is found.
   */
  parseCountry(inputs: readonly string[]): string | null {
    for (const input of inputs) {
      if (typeof input !== "string" || !input.trim()) {
        continue;
      }

      const country = this.parseCountryFromString(input);

      if (country !== null) {
        return country;
      }
    }

    return null;
  }

  /**
   * Parses an individual string using the existing country
   * name, alias, and country-code matching logic.
   */
  private parseCountryFromString(input: string): string | null {
    const sanitizedInput = this.stripBlacklistedWords(input);
    const normalizedInput = this.normalizeForMatching(sanitizedInput);

    const nameMatch = this.findCountryName(normalizedInput);
    const codeMatch = this.findCountryCode(sanitizedInput);

    if (!nameMatch && !codeMatch) {
      return null;
    }

    if (nameMatch && (!codeMatch || nameMatch.index <= codeMatch.index)) {
      return this.countryByCode.get(nameMatch.code) ?? null;
    }

    if (codeMatch) {
      return this.countryByCode.get(codeMatch.code) ?? null;
    }

    return null;
  }

  private registerCountries(): void {
    const englishNames = countries.getNames("en");

    // Register every country provided by the ISO country database.

    for (const [code, countryName] of Object.entries(englishNames)) {
      const normalizedCode = code.toLowerCase();

      const outputName: string = countryName.toLowerCase();

      this.countryByCode.set(normalizedCode, outputName);
      this.addAlias(countryName, normalizedCode);
    }

    // Add known alternative country names.
    for (const [code, aliases] of Object.entries(COUNTRY_ALIASES)) {
      const normalizedCode = code.toLowerCase();

      if (!this.countryByCode.has(normalizedCode)) {
        continue;
      }

      for (const alias of aliases) {
        this.addAlias(alias, normalizedCode);
      }
    }

    // Support non-ISO country-code aliases such as ".uk".
    for (const [alias, targetCode] of Object.entries(COUNTRY_CODE_ALIASES)) {
      const normalizedTarget = targetCode.toLowerCase();
      const countryName = this.countryByCode.get(normalizedTarget);

      if (countryName) {
        this.countryByCode.set(alias.toLowerCase(), countryName);
      }
    }
  }

  private addAlias(alias: string, code: string): void {
    const normalizedAlias = this.normalizeAlias(alias);

    if (!normalizedAlias || !this.countryByCode.has(code)) {
      return;
    }

    // Keep the first mapping if a normalized alias is ambiguous.
    if (!this.aliasToCode.has(normalizedAlias)) {
      this.aliasToCode.set(normalizedAlias, code);
    }
  }

  private findCountryName(normalizedInput: string): CountryNameMatch | null {
    const match = this.countryNamePattern.exec(normalizedInput);

    if (!match) {
      return null;
    }

    const alias = this.normalizeAlias(match[1]);
    const code = this.aliasToCode.get(alias);

    if (!code) {
      return null;
    }

    // The full match includes the whitespace boundary before
    // the alias. Calculate the alias's starting position.
    const index = match.index + match[0].length - match[1].length;

    return { code, index };
  }

  private findCountryCode(input: string): CountryCodeMatch | null {
    this.countryCodePattern.lastIndex = 0;

    let match: RegExpExecArray | null;
    let lastMatch: CountryCodeMatch | null = null;

    while ((match = this.countryCodePattern.exec(input)) !== null) {
      const code = match[1].toLowerCase();

      // Ignore tokens that aren't recognized country codes.
      if (!this.countryByCode.has(code)) {
        continue;
      }

      lastMatch = {
        code,
        index: match.index + match[0].length - match[1].length,
      };
    }

    return lastMatch;
  }

  private stripBlacklistedWords(value: string): string {
    this.blacklistPattern.lastIndex = 0;

    return value.replace(this.blacklistPattern, " ");
  }

  /**
   * Normalizes aliases by removing accents and converting
   * punctuation and whitespace into single spaces.
   */
  private normalizeAlias(value: string): string {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  /**
   * Normalizes input without collapsing whitespace, so that
   * match positions remain comparable to positions in input.
   */
  private normalizeForMatching(value: string): string {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, " ");
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
