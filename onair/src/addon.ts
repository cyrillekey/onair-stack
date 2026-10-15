import {
  addonBuilder,
  type Manifest,
  type MetaDetail,
  type MetaVideo,
} from "@/stremio.js";
import { Temporal } from "temporal-polyfill";
import { db } from "./prisma/db.js";
import appConfig from "./config/index.js";
import type { CATALOG_TYPE } from "./global.js";
import Sentry from "./utils/instrument.js";

// Docs: https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/responses/manifest.md
const manifest: Manifest = {
  id: "community.onair",
  version: "0.0.1",
  logo: appConfig.logo,
  behaviorHints: { configurable: false, epgProvider: true },
  catalogs: [
    {
      type: "tv",
      id: "ENTERTAINMENT",
      name: "Entertainment",
      extra: [{ name: "skip" }, { name: "date" }],
    },
    {
      id: "GENERAL",
      name: "General",
      type: "tv",
      extra: [{ name: "skip" }, { name: "date" }],
    },
    {
      id: "NEWS",
      name: "NEWS",
      type: "tv",
      extra: [{ name: "skip" }, { name: "date" }],
    },
    {
      id: "SPORTS",
      name: "Sports",
      type: "tv",
      extra: [{ name: "skip" }, { name: "date" }],
    },
  ],
  resources: ["catalog", "stream", "meta"],
  types: ["tv"],
  name: "Onair",
  description: "Live tv",
};

const builder = new addonBuilder(manifest);

/** Page size Discover and Native EPG use when paging with `skip`. */
const PAGE_SIZE = 100;

/** Programme data goes stale quickly, see the SDK Native EPG docs. */
const EPG_CACHE = {
  cacheMaxAge: 300,
  staleRevalidate: 1800,
  staleError: 604800,
};

type GuideWindow = {
  /** Inclusive start of the guide window. */
  start: Temporal.Instant;
  /** Exclusive end of the guide window. */
  end: Temporal.Instant;
};

/**
 * Native EPG sends `extra.date` as a UTC calendar day (`YYYY-MM-DD`); anything
 * missing or malformed falls back to the current UTC day.
 */
function resolveGuideDay(date?: string): Temporal.PlainDate {
  if (date) {
    try {
      return Temporal.PlainDate.from(date);
    } catch {
      // Malformed dates fall back to today.
    }
  }
  return Temporal.Now.plainDateISO("UTC");
}

/**
 * `skip` is typed as a number but reaches the handler as a string when parsed
 * from the request path (`/catalog/tv/NEWS/skip=100.json`), and the query
 * builder refuses a string offset.
 */
function pageOffset(skip: unknown): number {
  const value = Number(skip);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/** Half-open UTC window, `days` long, the guide wants schedules for. */
function guideWindow(date?: string, days = 1): GuideWindow {
  const day = resolveGuideDay(date);
  return {
    start: day.toZonedDateTime("UTC").toInstant(),
    end: day.add({ days }).toZonedDateTime("UTC").toInstant(),
  };
}

/**
 * Maps a schedule row to the programme block Stremio renders on the guide.
 *
 * A video counts as a programme only when both `startTime` and `endTime` are
 * set, so every field Stremio requires is filled here. See the SDK's
 * `docs/epg.md`.
 */
function toProgramme(
  channel: { id: string; poster: string | null },
  programme: {
    name: string;
    poster: string | null;
    startTime: Temporal.Instant;
    endTime: Temporal.Instant;
  },
): MetaVideo {
  const startTime = programme.startTime.toString();
  return {
    id: `${channel.id}:epg:${startTime}`,
    title: programme.name,
    released: startTime,
    startTime,
    endTime: programme.endTime.toString(),
    thumbnail: programme.poster ?? channel.poster ?? appConfig.fallbackImage,
  };
}

function toChannelMeta(
  channel: { id: string; name: string; poster: string | null },
  videos: MetaVideo[],
): MetaDetail {
  return {
    id: channel.id,
    name: channel.name,
    type: "tv",
    description: channel.name,
    language: "eng",
    poster: channel.poster ?? appConfig.fallbackImage,
    posterShape: "landscape",
    logo: channel.poster ?? appConfig.fallbackImage,
    behaviorHints: { isLive: true, hasScheduledVideos: true },
    videos,
  };
}

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

  // Native EPG requests carry the `date` extra and expect full channel meta
  // with the programmes airing that UTC day instead of a plain channel list.
  if (extra?.date) {
    Sentry.metrics.count("catalog-epg-request", 1);
    const window = guideWindow(extra.date);
    const channels = await db.orm.public.Channel
      .include("schedule", (schedule) =>
        schedule
          .where((programme) => programme.endTime.gt(window.start))
          .where((programme) => programme.startTime.lt(window.end))
          .orderBy((programme) => programme.startTime.asc()),
      )
      .where({ category: type })
      .where((channel) => channel.streams.some())
      .orderBy([
        (channel) => channel.name.asc(),
        (channel) => channel.id.asc(),
      ])
      .offset(pageOffset(extra.skip))
      .limit(PAGE_SIZE)
      .all();

    return {
      metasDetailed: channels.map((channel) =>
        toChannelMeta(
          channel,
          channel.schedule.map((programme) => toProgramme(channel, programme)),
        ),
      ),
      ...EPG_CACHE,
    };
  }

  const channels = await db.orm.public.Channel
    .where({ category: type })
    .where((channel) => channel.streams.some())
    .orderBy([
      (channel) => channel.name.asc(),
      (channel) => channel.id.asc(),
    ])
    .offset(pageOffset(extra?.skip))
    .limit(PAGE_SIZE)
    .all();

  // Docs: https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/requests/defineCatalogHandler.md
  return {
    metas: channels.map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: "tv",
      description: channel.name,
      poster: channel.poster ?? appConfig.fallbackImage,
      posterShape: "landscape",
      logo: channel.poster ?? appConfig.fallbackImage,
    })),
  };
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

  // The details page refreshes meta regularly and would lose its schedule
  // across midnight, so return the current UTC day plus the next one.
  const window = guideWindow(undefined, 2);
  const schedule = await db.orm.public.Schedule
    .where((programme) => programme.channelId.eq(id))
    .where((programme) => programme.endTime.gt(window.start))
    .where((programme) => programme.startTime.lt(window.end))
    .orderBy((programme) => programme.startTime.asc())
    .all();

  // Docs: https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/requests/defineMetaHandler.md
  // The protocol allows a null response, but the SDK type currently does not.
  return {
    meta: toChannelMeta(
      catalog,
      schedule.map((programme) => toProgramme(catalog, programme)),
    ),
    ...EPG_CACHE,
  };
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
