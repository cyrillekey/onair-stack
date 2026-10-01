import { logger } from "@/utils/logger.js";
import {
  BaseCollector,
  type CollectorContext,
  type CollectResult,
} from "../base.collector.js";
import { fetchJson } from "@/utils/http.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
dayjs.extend(utc);

class UkScheduler extends BaseCollector {
  readonly name = "uk.schedule";
  readonly schedule = "15 03 * * *";
  private apiUrl = "https://www.freeview.co.uk/api/tv-guide?nid=64257&start=";
  private url = "https://www.freeview.co.uk/tv-guide?userNid=64257";
  private async collectChannels(): Promise<BbcChannel[]> {
    try {
      const date = dayjs().utc().startOf("date").unix();

      const url = this.apiUrl + date;

      const response = await fetchJson<{
        data: { programs: BbcChannel[] } | null;
      }>(url);
      const channels = response.data?.programs ?? [];
      return channels;
    } catch (error) {
      console.error("Failed to fetch channels", error);
      logger.error({ error }, "Failed to fetch ,channels");
      return [];
    }
  }

  private async upsertChannel(ctx: CollectorContext, channel: BbcChannel) {
    try {
      const channelLogo = channel.events?.find((a) => a.fallback_image_url);
      const channelId = await ctx.db.orm.public.Channel.upsert({
        create: {
          country: "UK",
          slug: this.slugify(channel.title),
          name: channel.title,
          poster: channelLogo?.fallback_image_url ?? "",
          category: "GENERAL",
        },
        update: {
          country: "UK",
          slug: this.slugify(channel.title),
          name: channel.title,
          poster: channelLogo?.fallback_image_url ?? "",
          category: "GENERAL",
        },
        conflictOn: {
          slug: this.slugify(channel.title),
        },
      });
      await ctx.db.orm.public.Schedule.createAll(
        channel.events.map((event, index) => ({
          date: this.buildTemporalDate(new Date()),
          channelId: channelId.id,
          startTime: this.buildTemporalDate(dayjs(event.start_time).toDate()),
          endTime: this.buildTemporalDate(
            index + 1 == channel.events.length
              ? dayjs(event.start_time).add(30, "minutes").toDate()
              : dayjs(channel.events[index + 1].start_time).toDate(),
          ),

          name: event.main_title,
          poster: event.image_url ?? event.fallback_image_url,
        })),
      );
      return true;
    } catch (error) {
      ctx.log.error({ error }, "Failed to upsert channel");
      return false;
    }
  }

  async collect(
    ctx: CollectorContext,
  ): Promise<Omit<CollectResult<BbcChannel>, "job" | "durationMs">> {
    try {
      const channels = await this.collectChannels();
      const fetched = channels;

      return {
        fetched: fetched.length,
        stored: fetched.length,
        skipped: 0,
      };
    } catch (error) {
      ctx.log.error({ error }, "collect ");
      return {
        fetched: 0,
        stored: 0,
        error: String(error),
        skipped: 0,
      };
    }
  }
}

export default UkScheduler;

export interface BbcChannel {
  service_id: string;
  title: string;
  events: Event[];
}

interface Event {
  program_id: string;
  event_locator: string;
  main_title: string;
  secondary_title: string;
  image_url: string;
  start_time: string;
  duration: string;
  on_demand: OnDemand;
  genre: string;
  fallback_image_url: string;
  uuid: string;
}

interface OnDemand {
  start_of_availability: string;
  end_of_availability: string;
}
