import type { Manifest, ManifestCatalog } from "stremio-addon-sdk";
import { type models } from "@/prisma/contract";
import appConfig from "@/config";
type _CatalogType = typeof models.public.Channel.category;

export type CatalogType = _CatalogType | "ALL";

export const catalogTypes: CatalogType[] = [
  "ALL",
  "ANIME",
  "BASEBALL",
  "BASKETBALL",
  "BUSINESS",
  "CLASSIC_TV",
  "COMBAT_SPORTS",
  "COMEDY",
  "CRICKET",
  "CRIME",
  "DOCUMENTARY",
  "DRAMA",
  "EDUCATION",
  "ENTERTAINMENT",
  "FASHION",
  "FOOD",
  "FOOTBALL",
  "GENERAL",
  "INTERNATIONAL",
  "KIDS",
  "LIFESTYLE",
  "LOCAL",
  "MOVIES",
  "MOTORSPORTS",
  "MUSIC",
  "NEWS",
  "OUTDOORS_AUTO",
  "RADIO",
  "REALITY_TV",
  "RELIGIOUS",
  "SHOPPING",
  "SPORTS",
  "TECHNOLOGY",
  "TRAVEL",
  "JEWISH",
  "CHRISTIAN",
  "CATHOLIC",
  "ADVENTIST",
  "ISLAMIC",
  "GOSPEL",
  "PRAISE_WORSHIP",
];

export function toReadableString(name: string) {
  return capitalize(name.replace(/_/gi, " ").toString());
}

/**
 * Namespace for content ids exposed to Stremio. Incoming meta and stream
 * requests still accept ids without the prefix for backwards compatibility.
 */
export const ADDON_ID_PREFIX = "onair:";

export function addAddonIdPrefix(id: string): string {
  return id.startsWith(ADDON_ID_PREFIX) ? id : `${ADDON_ID_PREFIX}${id}`;
}

export function stripAddonIdPrefix(id: string): string {
  return id.startsWith(ADDON_ID_PREFIX) ? id.slice(ADDON_ID_PREFIX.length) : id;
}

export const baseManifest: Manifest & {
  stremioAddonsConfig: {
    issuer: string;
    signature: string;
  };
} = {
  id: "community.onair",
  version: "1.0.5",
  logo: appConfig.logo,
  // background: appConfig.background,
  contactEmail: "cyrilleodev@gmail.com",
  behaviorHints: {
    configurable: true,
    epgProvider: true,
    configurationRequired: true,
  },
  catalogs: buildCatalog(),
  resources: ["catalog", "stream", "meta"],
  types: ["tv"],
  // The empty prefix keeps legacy unprefixed ids matching in Stremio while new
  // responses are namespaced with onair:.
  idPrefixes: [ADDON_ID_PREFIX],
  name: "Onair",
  description:
    "Live TV for Stremio with a native EPG programme guide. Browse Entertainment, General, News and Sports channel catalogs and watch live channels from Discover or the guide grid.",

  stremioAddonsConfig: {
    issuer: "https://stremio-addons.net",
    signature: appConfig.signature,
  },
};
export function buildCatalog(
  catalog: CatalogType[] = catalogTypes,
  countries?: string[],
  showInHome?: boolean,
): ManifestCatalog[] {
  return catalog.map((a) => ({
    type: "tv",
    id: encodeCatalogType(a),
    name: toReadableString(a),
    extra: [
      { name: "skip" },
      { name: "date" },
      { name: "genre", options: countries },
    ],
    ...(showInHome === undefined || showInHome == false ? {} : { showInHome }),
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
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.substring(1).toLowerCase())
    .join(" ");
}

export interface ExtraArgs {
  skip?: string;
  date?: string;
  genre?: string;
}
