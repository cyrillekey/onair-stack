export type ConfigureOption = Readonly<{
  value: string;
  label: string;
}>;

export type ConfigureGroup = {
  name: "countries" | "categories";
  label: string;
  eyebrow: string;
  hint: string;
  placeholder: string;
  options: readonly ConfigureOption[];
  selected?: string[];
};

/** Countries the collector currently produces channels for. */
export const COUNTRIES: readonly ConfigureOption[] = [
  { value: "United States", label: "United States" },
  { value: "United Kingdom", label: "United Kingdom" },
  { value: "Canada", label: "Canada" },
  { value: "Australia", label: "Australia" },
];

/** Categories exposed as Stremio catalogs (ADULT is intentionally omitted). */
export const GENRES: readonly ConfigureOption[] = [
  { value: "ENTERTAINMENT", label: "Entertainment" },
  { value: "SPORTS", label: "Sports" },
  { value: "MOVIES", label: "Movies" },
  { value: "NEWS", label: "News" },
  { value: "INTERNATIONAL", label: "International" },
  { value: "RADIO", label: "Radio" },
  { value: "RELIGIOUS", label: "Religious" },
  { value: "DOCUMENTARY", label: "Documentary" },
  { value: "MUSIC", label: "Music" },
  { value: "KIDS", label: "Kids" },
  { value: "SHOPPING", label: "Shopping" },
  { value: "LIFESTYLE", label: "Lifestyle" },
  { value: "CLASSIC_TV", label: "Classic TV" },
  { value: "CRIME", label: "Crime" },
  { value: "OUTDOORS_AUTO", label: "Outdoors & Auto" },
  { value: "GENERAL", label: "General" },
];

export const CONFIGURE_GROUPS:  ConfigureGroup[] = [
  {
    name: "countries",
    label: "Countries",
    eyebrow: "Regions",
    hint: "Choose the regions to pull channels from. Skip this group to include every country.",
    placeholder: "Choose countries",
    options: COUNTRIES,
  },
  {
    name: "categories",
    label: "Genres",
    eyebrow: "Catalog rails",
    hint: "Each genre becomes a catalog row you can browse in Stremio. Skip this group to include every genre.",
    placeholder: "Choose genres",
    options: GENRES,
  },
];

export const TIMEZONES: readonly ConfigureOption[] = Intl.supportedValuesOf(
  "timeZone",
).map((timezone) => ({
  value: timezone,
  label: timezone,
}));
