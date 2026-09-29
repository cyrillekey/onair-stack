import { addonBuilder, type Manifest } from "@/stremio.js";
import { db } from "./prisma/db.js";
import appConfig from "./config/index.js";
import type { CATALOG_TYPE } from "./global.js";
import Sentry from "./utils/instrument.js";

// Docs: https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/responses/manifest.md
const manifest: Manifest = {
  id: "community.onair",
  version: "0.0.1",
  logo: appConfig.logo,
  behaviorHints: { configurable: false },
  catalogs: [
    {
      type: "tv",
      id: "ENTERTAINMENT",
      name: "Entertainment",
      extra: [{ name: "skip" }],
    },
    {
      id: "GENERAL",
      name: "General",
      type: "tv",
      extra: [{ name: "skip" }],
    },
    {
      id: "NEWS",
      name: "USA tv",
      type: "tv",
      extra: [{ name: "skip" }],
    },
    {
      id: "SPORTS",
      name: "Sports",
      type: "tv",
      extra: [{ name: "skip" }],
    },
  ],
  resources: ["catalog", "stream", "meta"],
  types: ["tv"],
  name: "Onair",
  description: "Live tv",
};

const builder = new addonBuilder(manifest);

builder.defineCatalogHandler(async ({ id, extra }) => {
  const allowedTypes = [
    "ENTERTAINMENT",
    "GENERAL",
    "NEWS",
    "SPORTS",
  ] satisfies CATALOG_TYPE[];
  const type = id as unknown as CATALOG_TYPE;
  Sentry.metrics.count("catalog-request", 1);
  if (!allowedTypes.includes(type)) {
    return { metas: [] };
  }
  if (extra?.date) {
    // TODO: implement catalog schedul
    return Promise.resolve({
      metasDetailed: [],
    });
  }
  const catalogs = (
    await db.orm.public.Channel.include("streams", (a) => a.count())
      .where({
        category: type,
      })
      .offset(extra.skip ?? 0)
      .all()
  ).filter((a) => a.streams > 0);

  // Docs: https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/requests/defineCatalogHandler.md
  return Promise.resolve({
    metas: catalogs.map((a) => ({
      id: a.id,
      name: a.name,
      type: "tv",
      description: a.name,
      poster: a?.poster ?? appConfig.fallbackImage,
      posterShape: "landscape",
      logo: a?.poster ?? appConfig.fallbackImage,
    })),
  });
});

builder.defineMetaHandler(async (params) => {
  Sentry.metrics.count("catalog-meta-request", 1);
  const { id } = params;
  const catalog = await db.orm.public.Channel.where({
    id: id,
  }).first();
  if (!catalog) {
    return { meta: {} as never };
  }
  // Docs: https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/requests/defineMetaHandler.md
  // The protocol allows a null response, but the SDK type currently does not.

  return Promise.resolve({
    meta: {
      id: catalog.id,
      name: catalog.name,
      type: "tv",
      description: catalog.name,
      language: "eng",
      poster: catalog.poster ?? appConfig.fallbackImage,
      posterShape: "landscape",
      logo: catalog.poster ?? appConfig.fallbackImage,
    },
  });
});

builder.defineStreamHandler(async ({ id }) => {
  Sentry.metrics.count("catalog-stream-request", 1);
  const streams = await db.orm.public.Stream.where({
    channelId: id,
  }).all();
  return Promise.resolve({
    streams: streams.map((a) => ({
      url: a.url,
      name: a?.name || "",
      title: a.resolution ?? "SD",
    })),
  });
});

export const addonInterface = builder.getInterface();
