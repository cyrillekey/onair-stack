import { readFileSync } from "node:fs";
import { join } from "node:path";
import ejs from "ejs";
import appConfig from "../config/index";
import { models } from "../prisma/contract";
type Option = Readonly<{ value: string; label: string }>;
type Config = Omit<typeof models.public.Configuration, "user">;
type CheckboxGroup = Readonly<{
  name: string;
  legend: string;
  hint: string;
  options: readonly Option[];
}>;

/** Countries the collector currently produces channels for. */
const COUNTRIES: readonly Option[] = [
  { value: "United States", label: "United States" },
  { value: "United Kingdom", label: "United Kingdom" },
  { value: "Canada", label: "Canada" },
  { value: "Australia", label: "Australia" },
];

/** Categories exposed as Stremio catalogs (ADULT is intentionally omitted). */
const CATEGORIES: readonly Option[] = [
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

const GROUPS: readonly CheckboxGroup[] = [
  {
    name: "countries",
    legend: "Countries",
    hint: "Choose which channel regions to include.",
    options: COUNTRIES,
  },
  {
    name: "categories",
    legend: "Categories",
    hint: "Choose which catalog tabs to show in Stremio.",
    options: CATEGORIES,
  },
];

/** Common IANA zones offered as autocomplete suggestions. */
const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Vancouver",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Stockholm",
  "Europe/Warsaw",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Perth",
  "Australia/Adelaide",
  "Australia/Sydney",
  "Pacific/Auckland",
];

const TEMPLATE_PATH = join(__dirname, "..", "templates", "configure.ejs");

let template: ejs.TemplateFunction | undefined;

function compiledTemplate(): ejs.TemplateFunction {
  template ??= ejs.compile(readFileSync(TEMPLATE_PATH, "utf8"), {
    filename: TEMPLATE_PATH,
  });
  return template;
}

/**
 * Renders the Stremio configuration page: collects the user's catalog
 * preferences and builds an install link that carries them in the addon URL.
 */
export function renderConfigurePage(config?: Config): string {
  return compiledTemplate()({
    title: "Onair",
    logo: appConfig.logo ?? appConfig.background,
    background: JSON.stringify(appConfig.background),
    timezones: TIMEZONES,
    groups: GROUPS,
  });
}
