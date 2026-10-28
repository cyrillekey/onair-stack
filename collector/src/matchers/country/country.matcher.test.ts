import countries from "i18n-iso-countries";
import { beforeEach, describe, expect, it } from "vitest";
import { CountryParser } from "./country.matcher.js";

type CountryCase = readonly [input: string, expected: string | null];

describe("CountryParser", () => {
  let parser: CountryParser;

  beforeEach(() => {
    parser = new CountryParser();
  });

  function describeCases(name: string, cases: readonly CountryCase[]): void {
    describe(name, () => {
      for (const [input, expected] of cases) {
        it(`${JSON.stringify(input)} -> ${JSON.stringify(expected)}`, () => {
          expect(parser.parseCountry([input])).toBe(expected);
        });
      }
    });
  }

  describe("official country names", () => {
    it("parses every official English country name", () => {
      for (const [code, name] of Object.entries(countries.getNames("en"))) {
        expect(parser.parseCountry([name]), `${code}: ${name}`).toBe(
          name.toLowerCase(),
        );
      }
    });

    describeCases("notable official names", [
      ["United States of America", "united states of america"],
      ["United Kingdom", "united kingdom"],
      ["Russian Federation", "russian federation"],
      ["South Korea", "south korea"],
      ["North Korea", "north korea"],
      ["Republic of the Congo", "republic of the congo"],
      [
        "Democratic Republic of the Congo",
        "democratic republic of the congo",
      ],
      ["Czech Republic", "czech republic"],
      ["Netherlands", "netherlands"],
      ["People's Republic of China", "people's republic of china"],
      ["Islamic Republic of Iran", "islamic republic of iran"],
      ["Lao People's Democratic Republic", "lao people's democratic republic"],
      ["United Republic of Tanzania", "united republic of tanzania"],
      ["State of Palestine", "state of palestine"],
      ["Taiwan, Province of China", "taiwan, province of china"],
      ["Holy See (Vatican City State)", "holy see (vatican city state)"],
      ["Moldova, Republic of", "moldova, republic of"],
      ["Syrian Arab Republic", "syrian arab republic"],
      ["Brunei Darussalam", "brunei darussalam"],
      ["Micronesia, Federated States of", "micronesia, federated states of"],
      ["Virgin Islands, British", "virgin islands, british"],
      ["Virgin Islands, U.S.", "virgin islands, u.s."],
      ["Timor-Leste", "timor-leste"],
      ["Côte d'Ivoire", "cote d'ivoire"],
      ["Curaçao", "curaçao"],
      ["Åland Islands", "åland islands"],
      ["Türkiye", "türkiye"],
    ]);
  });

  describeCases("aliases and common names", [
    // United States
    ["USA", "united states of america"],
    ["U.S.A.", "united states of america"],
    ["US", "united states of america"],
    ["U.S.", "united states of america"],
    ["America", "united states of america"],
    ["The United States", "united states of america"],
    ["U S A", "united states of america"],
    ["U S", "united states of america"],
    // United Kingdom
    ["UK", "united kingdom"],
    ["Great Britain", "united kingdom"],
    ["Britain", "united kingdom"],
    ["England", "united kingdom"],
    ["Scotland", "united kingdom"],
    ["Wales", "united kingdom"],
    ["Northern Ireland", "united kingdom"],
    ["U K", "united kingdom"],
    // Russia and former Soviet states
    ["Russia", "russian federation"],
    ["Soviet Union", "russian federation"],
    ["USSR", "russian federation"],
    ["U.S.S.R.", "russian federation"],
    ["Byelorussia", "belarus"],
    ["Srbija", "serbia"],
    ["Yugoslavia", "serbia"],
    ["Hrvatska", "croatia"],
    ["Slovenija", "slovenia"],
    ["Crna Gora", "montenegro"],
    ["Eesti", "estonia"],
    ["Latvija", "latvia"],
    ["Lietuva", "lithuania"],
    // Germany and Central Europe
    ["Deutschland", "germany"],
    ["East Germany", "germany"],
    ["West Germany", "germany"],
    ["Österreich", "austria"],
    ["Schweiz", "switzerland"],
    ["Suisse", "switzerland"],
    ["Svizzera", "switzerland"],
    ["Helvetia", "switzerland"],
    ["Polska", "poland"],
    ["Magyarorszag", "hungary"],
    // Benelux and Nordics
    ["Holland", "netherlands"],
    ["The Netherlands", "netherlands"],
    ["Nederland", "netherlands"],
    ["België", "belgium"],
    ["Belgique", "belgium"],
    ["Sverige", "sweden"],
    ["Norge", "norway"],
    ["Danmark", "denmark"],
    ["Suomi", "finland"],
    // Asia
    ["Korea", "south korea"],
    ["Korea Republic of", "south korea"],
    ["Korea, Republic of", "south korea"],
    ["DPRK", "north korea"],
    ["Democratic People's Republic of Korea", "north korea"],
    ["D P R K", "north korea"],
    ["Nippon", "japan"],
    ["Bharat", "india"],
    ["Persia", "islamic republic of iran"],
    ["Siam", "thailand"],
    ["Kampuchea", "cambodia"],
    ["Ceylon", "sri lanka"],
    ["Burma", "myanmar"],
    ["Formosa", "taiwan, province of china"],
    ["P R C", "people's republic of china"],
    ["Hongkong", "hong kong"],
    ["Macau", "macao"],
    // Africa
    ["DR Congo", "democratic republic of the congo"],
    ["DRC", "democratic republic of the congo"],
    ["Zaire", "democratic republic of the congo"],
    ["Congo-Kinshasa", "democratic republic of the congo"],
    ["Congo Brazzaville", "republic of the congo"],
    ["Ivory Coast", "cote d'ivoire"],
    ["Tanganyika", "united republic of tanzania"],
    ["Zanzibar", "united republic of tanzania"],
    ["Rhodesia", "zimbabwe"],
    ["Maroc", "morocco"],
    ["Mocambique", "mozambique"],
    ["The Gambia", "republic of the gambia"],
    // Oceania and the Americas
    ["Aotearoa", "new zealand"],
    ["New Hebrides", "vanuatu"],
    ["Brasil", "brazil"],
    ["Perú", "peru"],
    ["México", "mexico"],
    ["España", "spain"],
    ["Netherlands Antilles", "curaçao"],
    ["Curacao", "curaçao"],
    ["Bonaire", "bonaire, sint eustatius and saba"],
    ["Sint Eustatius", "bonaire, sint eustatius and saba"],
    ["Saba", "bonaire, sint eustatius and saba"],
    ["Caribbean Netherlands", "bonaire, sint eustatius and saba"],
    ["Saint Barthelemy", "saint barthélemy"],
    ["Sao Tome", "sao tome and principe"],
    ["Trinidad", "trinidad and tobago"],
    ["Tobago", "trinidad and tobago"],
    ["British Virgin Islands", "virgin islands, british"],
    ["US Virgin Islands", "virgin islands, u.s."],
    // Abbreviations
    ["UAE", "united arab emirates"],
    ["U.A.E.", "united arab emirates"],
    ["KSA", "saudi arabia"],
    ["RSA", "south africa"],
    ["FSM", "micronesia, federated states of"],
    ["PNG", "papua new guinea"],
    ["BVI", "virgin islands, british"],
    ["USVI", "virgin islands, u.s."],
    ["IOM", "isle of man"],
    ["C A R", "central african republic"],
    ["Sao Tome and Principe", "sao tome and principe"],
    ["The Philippines", "philippines"],
    ["Réunion", "reunion"],
    ["Reunion Island", "reunion"],
    ["Aland", "åland islands"],
    ["Aland Islands", "åland islands"],
  ]);

  describe("country codes", () => {
    describeCases("dotted ISO codes", [
      [".us", "united states of america"],
      [".ru", "russian federation"],
      [".uk", "united kingdom"],
      [".de", "germany"],
      [".fr", "france"],
      [".es", "spain"],
      [".it", "italy"],
      [".nl", "netherlands"],
      [".se", "sweden"],
      [".ch", "switzerland"],
      [".pl", "poland"],
      [".gr", "greece"],
      [".tr", "türkiye"],
      [".jp", "japan"],
      [".cn", "people's republic of china"],
      [".in", "india"],
      [".br", "brazil"],
      [".ca", "canada"],
      [".au", "australia"],
      [".nz", "new zealand"],
      [".za", "south africa"],
      [".ae", "united arab emirates"],
    ]);

    describeCases("dotted non-ISO and historical codes", [
      [".el", "greece"],
      [".su", "russian federation"],
      [".yu", "serbia"],
      [".zr", "democratic republic of the congo"],
      [".an", "curaçao"],
      [".tp", "timor-leste"],
      [".ac", "saint helena"],
      [".dg", "british indian ocean territory"],
      [".ta", "saint helena"],
      [".cs", "serbia"],      
      [".ea", "spain"],
      [".ic", "spain"],
      [".fx", "france"],
      [".cp", "france"],
      [".bu", "myanmar"],
    ]);

    describeCases("codes are case-insensitive", [
      [".US", "united states of america"],
      [".Ru", "russian federation"],
      [".uK", "united kingdom"],
      [".EL", "greece"],
    ]);

    describeCases("bare codes at the start of the string", [
      ["AU", "australia"],
      ["GB", "united kingdom"],
      ["DE", "germany"],
      ["FR", "france"],
      ["ES", "spain"],
      ["IT", "italy"],
      ["NL", "netherlands"],
      ["SE", "sweden"],
      ["CH", "switzerland"],
      ["PL", "poland"],
      ["GR", "greece"],
      ["TR", "türkiye"],
      ["JP", "japan"],
      ["CN", "people's republic of china"],
      ["IN", "india"],
      ["BR", "brazil"],
      ["CA", "canada"],
      ["NZ", "new zealand"],
      ["ZA", "south africa"],
      ["AE", "united arab emirates"],
      ["NO", "norway"],
      ["BE", "belgium"],
      ["IS", "iceland"],
      ["AT", "austria"],
      ["TO", "tonga"],
      ["SO", "somalia"],
      ["MY", "malaysia"],
      ["AM", "armenia"],
      ["DO", "dominican republic"],
      ["AS", "american samoa"],
    ]);

    describeCases("bare codes after whitespace", [
      ["Sports DE", "germany"],
      ["Channel JP", "japan"],
      ["News US", "united states of america"],
      ["match FR", "france"],
      ["Sport ZA", "south africa"],
      ["feed .br", "brazil"],
    ]);

    describeCases("codes embedded in channel names", [
      ["Astrahan.Ru Sport (720p)", "russian federation"],
      ["AE.us@East", "united states of america"],
      ["Sky.UK", "united kingdom"],
      ["Channel.us", "united states of america"],
      ["Stream.DE", "germany"],
    ]);

    describeCases("codes must be complete two-letter tokens", [
      ["paraus", null],
      ["house", null],
      ["USANetwork", null],
      ["AUS", null],
      ["GER", null],
      ["FRA", null],
      ["USX", null],
      ["xUS", null],
      ["CanadaUS", null],
      [".usx", null],
      ["S U", null],
      ["E L", null],
    ]);
  });

  describeCases("blacklist stripping", [
    // Every noise token on its own resolves to nothing.
    ["TV", null],
    ["Channel", null],
    ["Television", null],
    ["Network", null],
    ["Broadcast", null],
    ["Live", null],
    ["Stream", null],
    ["Streaming", null],
    ["Online", null],
    ["Radio", null],
    ["News", null],
    ["Sports", null],
    ["Movies", null],
    ["Cinema", null],
    ["Kids", null],
    ["Music", null],
    ["Entertainment", null],
    ["Documentary", null],
    ["Promo", null],
    ["Trailer", null],
    ["Test", null],
    ["Backup", null],
    ["Official", null],
    ["Premium", null],
    ["Free", null],
    ["Pay", null],
    ["Plus", null],
    ["Max", null],
    ["Extra", null],
    ["HD", null],
    ["FHD", null],
    ["UHD", null],
    ["SD", null],
    ["4K", null],
    ["8K", null],
    ["HQ", null],
    ["FM", null],
    // Stripping noise leaves the intended country untouched.
    ["CHANNEL AU TV", "australia"],
    ["AU TV", "australia"],
    ["Channel AU", "australia"],
    ["Tuvalu TV", "tuvalu"],
    ["Canada TV", "canada"],
    ["Canada HD", "canada"],
    ["Canada FHD", "canada"],
    ["US HD", "united states of america"],
    ["US 4K", "united states of america"],
    ["US FM", "united states of america"],
    ["UK UHD", "united kingdom"],
    ["CHANNEL US", "united states of america"],
    ["France 24 HD", "france"],
    ["Sky Sports US", "united states of america"],
    ["USA Network", "united states of america"],
    ["BBC America", "united states of america"],
    ["Russia Today", "russian federation"],
    ["Deutschland TV", "germany"],
    ["Kuwait TV", "kuwait"],
    ["Iran TV", "islamic republic of iran"],
    ["China TV", "people's republic of china"],
    ["Taiwan TV", "taiwan, province of china"],
    ["Palestine TV", "state of palestine"],
    ["Macedonia TV", "the republic of north macedonia"],
    ["Moldova TV", "moldova, republic of"],
    ["Syria TV", "syrian arab republic"],
    ["Trinidad TV", "trinidad and tobago"],
    ["Bosnia TV", "bosnia and herzegovina"],
    ["Korea TV", "south korea"],
    // Matching is whole-word only.
    ["CTV", null],
    ["TVE", null],
    ["Tuvalu", "tuvalu"],
    ["HDMI", null],
    ["SDS", null],
  ]);

  describeCases("name versus code precedence", [
    ["ru Canada", "russian federation"],
    [".ru Canada", "russian federation"],
    ["ru.Canada", "russian federation"],
    ["jp Korea", "japan"],
    ["Canada ru", "canada"],
    ["Canada.ru", "canada"],
    ["Canada US", "canada"],
    ["Canada .US", "canada"],
    ["Korea .jp", "south korea"],
    ["France .de", "france"],
    [".de France", "germany"],
    ["US Canada .ru", "united states of america"],
  ]);

  describeCases("ambiguous and overlapping names", [
    ["Congo", "republic of the congo"],
    ["DR Congo", "democratic republic of the congo"],
    ["Korea", "south korea"],
    ["North Korea", "north korea"],
    ["Niger", "niger"],
    ["Nigeria", "nigeria"],
    ["Sudan", "sudan"],
    ["South Sudan", "south sudan"],
    ["Samoa", "samoa"],
    ["American Samoa", "american samoa"],
    ["Western Samoa", "samoa"],
    ["Guinea", "guinea"],
    ["Guinea Bissau", "guinea-bissau"],
    ["Equatorial Guinea", "equatorial guinea"],
    ["Papua New Guinea", "papua new guinea"],
    ["Dominica", "dominica"],
    ["Dominican Republic", "dominican republic"],
    ["Ireland", "ireland"],
    ["Northern Ireland", "united kingdom"],
    ["Macedonia", "the republic of north macedonia"],
    ["North Macedonia", "the republic of north macedonia"],
    ["China", "people's republic of china"],
    ["Taiwan", "taiwan, province of china"],
    ["Virgin Islands", null],
    ["British Virgin Islands", "virgin islands, british"],
    ["US Virgin Islands", "virgin islands, u.s."],
    ["Czech Republic", "czech republic"],
    ["Czechoslovakia", "czech republic"],
    ["Korea North", "south korea"],
  ]);

  describeCases("realistic channel names", [
    ["Al Iraqia Sport (720p)", "iraq"],
    ["CRTV (Chile) (720p)", "chile"],
    ["Fast&FunBox (Netherlands)", "netherlands"],
    ["France 24", "france"],
    ["France 24 HD", "france"],
    ["BBC World News", null],
    ["Discovery Channel", null],
    ["National Geographic", null],
    ["beIN Sports 1", null],
    ["NBA TV", null],
    ["Cartoon Network", null],
    ["Food Network", null],
    ["Travel Channel", null],
    ["History Channel", null],
  ]);

  describe("multiple inputs", () => {
    it("returns the first country found across inputs", () => {
      expect(parser.parseCountry(["Canada", "France"])).toBe("canada");
      expect(parser.parseCountry(["TV", "France", "Canada"])).toBe("france");
      expect(parser.parseCountry(["beIN Sports", "Germany"])).toBe("germany");
    });

    it("skips empty and whitespace-only inputs", () => {
      expect(parser.parseCountry(["", "   ", "Canada"])).toBe("canada");
      expect(parser.parseCountry(["\t", "\n", "France"])).toBe("france");
    });

    it("skips inputs with no country", () => {
      expect(parser.parseCountry(["paraus", "France"])).toBe("france");
      expect(parser.parseCountry(["TV", "AU"])).toBe("australia");
      expect(parser.parseCountry(["paraus", "house"])).toBeNull();
    });

    it("returns null for an empty input list", () => {
      expect(parser.parseCountry([])).toBeNull();
    });

    it("returns null when every input is only blacklisted noise", () => {
      expect(parser.parseCountry(["TV", "HD"])).toBeNull();
      expect(parser.parseCountry(["Channel", "4K", "News"])).toBeNull();
    });

    it("ignores non-string values defensively", () => {
      expect(
        parser.parseCountry([null as unknown as string, "France"]),
      ).toBe("france");
    });
  });

  describeCases("empty and malformed inputs", [
    ["", null],
    ["   ", null],
    ["\t\n", null],
    ["12345", null],
    ["!!!", null],
  ]);

  describeCases("case, spacing, and punctuation", [
    ["UNITED STATES", "united states of america"],
    ["  Canada  ", "canada"],
    ["(Canada)", "canada"],
    ["Canada!", "canada"],
    ["united   states", "united states of america"],
    ["Cote d'Ivoire", "cote d'ivoire"],
    ["Trinidad & Tobago", "trinidad and tobago"],
  ]);
});
