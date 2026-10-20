import Sentry from "@/utils/instrument.js";
import {
  BaseCollector,
  type CollectorContext,
  type CollectResult,
} from "../base.collector.js";
import { logger } from "@/utils/logger.js";
import { fetchJson } from "@/utils/http.js";
import { URLSearchParams } from "url";
import dayjs from "dayjs";

class BeinScheduler extends BaseCollector<BeinSchedule> {
  schedule = "00 03 * * *";
  name = "Bein Schedule";
  baseUrl = "https://www.beinsports.com/api/opta";
  private baseLogoUrl = "https://prod-media.beinsports.com/image/";
  sources: { name: "USA" | "MENA"; region: string }[] = [
    { name: "USA", region: "en-us" },
    { name: "MENA", region: "en-mena" },
  ];
  private buildEventsUrl(region: string) {
    const queryParams = new URLSearchParams();
    queryParams.append("startBefore", dayjs().endOf("day").toISOString());
    queryParams.append("endAfter", dayjs().startOf("day").toISOString());
    queryParams.append("region", region);
    queryParams.append("limit", "30000");

    return `${this.baseUrl}/tv-event?${queryParams.toString()}`;
  }
  private buildChannelUrl(region: string) {
    const queryParams = new URLSearchParams();
    queryParams.append("region", region);
    return `${this.baseUrl}/tv-channel?${queryParams.toString()}`;
  }
  private async fetchChannels(region: string): Promise<TvChannel[]> {
    try {
      const url = this.buildChannelUrl(region);
      const response = await fetchJson<{ rows: TvChannel[] }>(url);
      return response.rows;
    } catch (error) {
      Sentry.captureException(error);
      logger.error({ error }, "Failed to fetch channels");
      return [];
    }
  }
  private buildLogoUrl(id: string) {
    return `${this.baseLogoUrl}${id}.png?ver=03-06-2025`;
  }
  private async collectSchedule(
    region: string,
    channelIds: string[],
  ): Promise<BeinSchedule[]> {
    try {
      const channelString = channelIds.map((a) => `channelIds=${a}`).join("&");
      const response = await fetchJson<{ rows: BeinSchedule[] }>(
        this.buildEventsUrl(region) + `&${channelString}`,
      );
      const schedule = response.rows;
      return schedule;
    } catch (error) {
      Sentry.captureException(error);
      logger.error({ error }, "Failed to fetch schedule");
      return [];
    }
  }
  private async upsertSchedule(
    ctx: CollectorContext,
    channel: Channel,
    schedules: BeinSchedule[],
    region: "USA" | "MENA",
  ) {
    try {
      const channelSlug = this.slugify(channel.name);
      const channelId = await ctx.db.orm.public.Channel.upsert({
        create: {
          country: region,
          slug: channelSlug,
          name: channel.name,
          poster: this.buildLogoUrl(channel.externalUniqueId),
          category: "SPORTS",
        },
        update: {
          country: region,
          slug: channelSlug,
          name: channel.name,
          poster: this.buildLogoUrl(channel.externalUniqueId),
          category: "SPORTS",
        },
        conflictOn: {
          slug: channelSlug,
        },
      });
      await ctx.db.orm.public.Schedule.createAll(
        schedules.map((schedule) => ({
          channelId: channelId.id,
          date: this.buildTemporalDate(dayjs(schedule.startDate).toDate()),
          endTime: this.buildTemporalDate(dayjs(schedule.endDate).toDate()),
          name: schedule.title,
          startTime: this.buildTemporalDate(dayjs(schedule.startDate).toDate()),
          poster: this.buildLogoUrl(channel.externalUniqueId),
          description: schedule.description,
        })),
      );
    } catch (error) {
      ctx.log.error({ error }, "Failed to upsert schedule");
      Sentry.captureException(error);
      return false;
    }
  }
  async collect(
    ctx: CollectorContext,
  ): Promise<Omit<CollectResult<BeinSchedule>, "job" | "durationMs">> {
    try {
      let fetched = 0;

      for (const source of this.sources) {
        const channelSources = await this.fetchChannels(source.region);
        const schedule = await this.collectSchedule(
          source.region,
          channelSources.map((a) => a.id),
        );
        fetched += schedule.length;
        const channels = this.getUniqueArray(schedule.map((a) => a.channel.id));
        for (let index = 0; index < channels.length; index++) {
          const channelId = channels[index];
          const channelSchedule = schedule.filter(
            (a) => a.channel.id == channelId,
          );
          if (channelSchedule.length > 0)
            await this.upsertSchedule(
              ctx,
              channelSchedule[0].channel,
              channelSchedule,
              source.name,
            );
        }
      }
      return {
        fetched: fetched,
        stored: fetched,
        skipped: 0,
      };
    } catch (error) {
      ctx.log.error({ error }, "collect failed");
      Sentry.captureException(error);
      return {
        fetched: 0,
        stored: 0,
        skipped: 0,
        error: String(error),
      };
    }
  }
}

export default BeinScheduler;

export interface BeinSchedule {
  data: BeinScheduleData;
  duration: number;
  id: string;
  externalId: string;
  title: string;
  startDate: Date;
  endDate: Date;
  live: boolean;
  replay: boolean;
  category: string;
  genre: null;
  synopsis: null;
  description: string;
  categoryArabic: null;
  synopsisArabic: null;
  descriptionArabic: null;
  channelId: string;
  sportTypeId: null;
  createdAt: Date;
  updatedAt: Date;
  channel: Channel;
  sportType: null;
}

export interface Channel {
  data: ChannelData;
  id: string;
  externalId: string;
  name: string;
  providerId: string;
  externalUniqueId: string;
  createdAt: Date;
  updatedAt: Date;
  provider: Provider;
}

export interface ChannelData {
  id: string;
  displayName: string;
}

export interface Provider {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BeinScheduleData {
  startDate: Date;
  endDate: Date;
  channelId: string;
  eventId: string;
  matchId: string;
  title: string;
  subTitle: string;
  desc: string;
  category: string;
  length: string;
  episodeNum: string;
  video: Video;
  live: string;
  audio: Audio;
}

export interface Audio {
  present: boolean;
  stereo: string;
}

export interface Video {
  present: boolean;
  colour: boolean;
}

export interface TvChannel {
  data: Data;
  id: string;
  externalId: string;
  name: string;
  providerId: string;
  externalUniqueId: string;
  createdAt: Date;
  updatedAt: Date;
  provider: Provider;
  redirectUrl: string;
}

export interface Data {
  id: string;
  displayName: string;
}
