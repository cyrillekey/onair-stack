import appConfig from "@/config";
import type { Models } from "@/prisma/contract";
import { toIsoString } from "@/utils/api";
import { toReadableString } from "@/utils/helpers";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
dayjs.extend(timezone);
dayjs.extend(utc);

export type ChannelRecord = Omit<Models.public_Channel, "schedule" | "streams">;
export type ScheduleRecord = Omit<Models.public_Schedule, "channel">;

export interface GuideWindow {
  start: dayjs.Dayjs;
  end: dayjs.Dayjs;
}

/** Programme data changes often, so cache it briefly and revalidate in the background. */
export const GUIDE_CACHE = {
  cacheMaxAge: 300,
  staleRevalidate: 1800,
  staleError: 604800,
} as const;

export function cacheControl(cache: {
  cacheMaxAge: number;
  staleRevalidate: number;
  staleError: number;
}) {
  return `max-age=${cache.cacheMaxAge}, stale-while-revalidate=${cache.staleRevalidate}, stale-if-error=${cache.staleError}, public`;
}

export function parseGuideDate(date: string | undefined): GuideWindow {
  const startDate = dayjs(date).startOf("day");
  const endDate = dayjs(date).endOf("day");
  const start = startDate;
  return { start, end: endDate };
}

/**
 * Stremio asks for UTC days when rendering the guide. The channel detail page
 * starts at the user's local midnight instead, so it shows the schedule the
 * viewer is actually living through.
 */
export function metaWindow(_timezone: string | undefined): GuideWindow {
  const now = dayjs()

  return { start: now, end: now.clone().add(46, "hours") };
}

export function previewForChannel(channel: ChannelRecord) {
  const poster = channel.poster || appConfig.fallbackImage;

  return {
    id: channel.id,
    type: "tv",
    name: channel.name,
    description: channel.description || undefined,
    poster,
    posterShape: "landscape",
    logo: poster,
    country: channel.country,
    language: channel.country,
    behaviorHints: {
      isLive: true,
    },
  };
}

export function metaForChannel(
  channel: ChannelRecord,
  videos: ReturnType<typeof videoForSchedule>[],
) {
  const preview = previewForChannel(channel);

  return {
    ...preview,
    background: appConfig.background,
    country: channel.country,
    language: channel.country,
    genres: [toReadableString(channel.category)],
    videos,
    behaviorHints: {
      isLive: true,
      hasScheduledVideos: true,
    },
  };
}

export function videoForSchedule(
  channel: ChannelRecord,
  schedule: ScheduleRecord,
) {
  const startTime = toIsoString(schedule.startTime);
  const endTime = toIsoString(schedule.endTime);
  const startMs = Date.parse(startTime);
  const endMs = Date.parse(endTime);
  const durationMs = endMs - startMs;
  const runtime =
    Number.isFinite(durationMs) && durationMs > 0
      ? `${Math.max(1, Math.round(durationMs / 60_000))} min`
      : undefined;

  return {
    id: `${channel.id}:epg:${startTime}`,
    title: schedule.name,
    released: startTime,
    startTime,
    endTime,
    overview: schedule.description || undefined,
    thumbnail: schedule.poster || channel.poster || appConfig.fallbackImage,
    runtime,
    releaseInfo: startTime.slice(0, 4),
    genres: [toReadableString(channel.category)],
  };
}
