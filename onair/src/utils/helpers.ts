import type { Manifest, ManifestCatalog } from "stremio-addon-sdk";
import { models } from "@/prisma/contract";
import appConfig from "@/config";
export type CatalogType = typeof models.public.Channel.category;
export const catalogTypes: CatalogType[] = [
  "ADULT",
  "CLASSIC_TV",
  "CRIME",
  "DOCUMENTARY",
  "ENTERTAINMENT",
  "GENERAL",
  "INTERNATIONAL",
  "KIDS",
  "LIFESTYLE",
  "MOVIES",
  "MUSIC",
  "NEWS",
  "OUTDOORS_AUTO",
  "RADIO",
  "RELIGIOUS",
  "SHOPPING",
  "SPORTS",
];

export function toReadableString(name: string) {
  return capitalize(name.replace(/_/gi, " ").toString());
}

export const baseManifest: Manifest = {
  id: "community.onair",
  version: "1.0.2",
  logo: appConfig.logo,
  // background: appConfig.background,
  contactEmail: "cyrilleotieno7@gmail.com",
  behaviorHints: {
    configurable: true,
    epgProvider: true,
    configurationRequired: true,
  },
  catalogs: buildCatalog(),
  resources: ["catalog", "stream", "meta"],
  types: ["tv"],
  name: "Onair",
  description:
    "Live TV for Stremio with a native EPG programme guide. Browse Entertainment, General, News and Sports channel catalogs and watch live channels from Discover or the guide grid.",
};

export function buildCatalog(
  catalog: CatalogType[] = catalogTypes,
  showInHome?: boolean,
): ManifestCatalog[] {
  return catalog.map((a) => ({
    type: "tv",
    id: encodeCatalogType(a),
    name: toReadableString(a),
    extra: [{ name: "skip" }, { name: "search" }, { name: "date" }],
    ...(showInHome === undefined ? {} : { showInHome }),
  }));
}

export function encodeCatalogType(a: CatalogType): string {
  return a.toLowerCase();
}

export function reverseCatalogId(id: string): CatalogType {
  return id.toUpperCase() as CatalogType;
}

export function capitalize(s: string) {
  const words = s.split(" ");
  return words.map((w) => w.charAt(0).toUpperCase() + w.substring(1)).join(" ");
}

export interface ExtraArgs {
  skip?: string;
  search?: string;
  date?: string;
}
