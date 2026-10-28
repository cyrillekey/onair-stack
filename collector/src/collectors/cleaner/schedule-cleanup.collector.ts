import { config } from "@/config/index.js";
import {
  BaseCollector,
  type CollectorContext,
  type CollectResult,
} from "../base.collector.js";

/**
 * Deletes Schedule rows whose programme has ended more than
 * SCHEDULE_RETENTION_DAYS ago. The EPG collectors keep a few days ahead, so
 * trimming the tail keeps the guide table bounded without touching upcoming
 * programmes. Runs after the daily ingest jobs.
 */
class ScheduleCleanupCollector extends BaseCollector<string> {
  name = "ScheduleCleanup";
  readonly schedule = config.SCHEDULE_CLEANUP_CRON;

  async collect(
    ctx: CollectorContext,
  ): Promise<Omit<CollectResult<string>, "job" | "durationMs">> {
    const cutoff = this.buildTemporalDate(
      new Date(
        Date.now() - config.SCHEDULE_RETENTION_DAYS * 24 * 60 * 60 * 1000,
      ),
    );

    const deleted = await ctx.db.orm.public.Schedule.where((schedule) =>
      schedule.endTime.lt(cutoff),
    ).deleteAndCount();

    ctx.log.info(
      {
        cutoff: cutoff.toString(),
        retentionDays: config.SCHEDULE_RETENTION_DAYS,
        deleted,
      },
      "schedule cleanup finished",
    );

    return { fetched: 0, stored: deleted };
  }
}

export default ScheduleCleanupCollector;
