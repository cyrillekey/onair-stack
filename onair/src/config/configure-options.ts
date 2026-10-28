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
  { value: "United States", label: "United States" },
  { value: "United Kingdom", label: "United Kingdom" },
  { value: "Canada", label: "Canada" },
  { value: "Australia", label: "Australia" },
  { value: "New Zealand", label: "New Zealand" },
];

/** Categories exposed as Stremio catalogs (ADULT is intentionally omitted). */
export const GENRES: readonly ConfigureOption[] = catalogTypes.map((type) => ({
  value: type,
  label: toReadableString(type),
}));

export const CONFIGURE_GROUPS: ConfigureGroup[] = [
  {
    name: "countries",
    label: "Countries",
    eyebrow: "Regions",
    hint: "Choose at least one region to pull channels from.",
    placeholder: "Choose countries",
    options: COUNTRIES,
  },
  {
    name: "categories",
    label: "Genres",
    eyebrow: "Catalog rails",
    hint: "Choose at least one genre for your Stremio catalog rails.",
    placeholder: "Choose genres",
    options: GENRES,
  },
];
