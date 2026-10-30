import { catalogTypes, toReadableString } from "@/utils/helpers";

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
  { value: "United States of America", label: "United States" },
  { value: "United Kingdom", label: "United Kingdom" },
  { value: "Canada", label: "Canada" },
  { value: "Australia", label: "Australia" },
  { value: "New Zealand", label: "New Zealand" },
  {
    value: "Brazil",
    label: "Brazil",
  },
];

/** Categories exposed as Stremio catalogs (ADULT is intentionally omitted). */
export const GENRES: readonly ConfigureOption[] = catalogTypes.map((a) => ({
  value: a,
  label: toReadableString(a),
}));

export const CONFIGURE_GROUPS: ConfigureGroup[] = [
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
