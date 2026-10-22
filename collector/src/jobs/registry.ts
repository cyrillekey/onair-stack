import type { BaseCollector } from "@/collectors/base.collector.js";
import BroadcastCollector from "@/collectors/stream/broadcast.collector.js";
import StreamsCollector from "@/collectors/stream/index.js";
import BeinScheduler from "@/collectors/schedule/bein.schedule.js";
import UkScheduler from "@/collectors/schedule/uk.schedule.js";
import ScheduleCollector from "@/collectors/schedule/americas.schedule.js";
import StreamHealthCollector from "@/collectors/stream/stream-health.collector.js";
import UkSportScheduler from "@/collectors/schedule/uk.sports.scheduler.js";
import TvChannelCollector from "@/collectors/channels/america.channes.js";

// Single place to add/remove sources. Append new collectors here.
// StreamHealth runs first so a RUN_ONCE pass prunes dead links before
// the ingest collectors re-add working ones.
export function buildRegistry(): BaseCollector[] {
  return [
    new StreamHealthCollector(),
    new ScheduleCollector(),
    new StreamsCollector(),
    new UkScheduler(),
    new BroadcastCollector(),
    new BeinScheduler(),
    new UkSportScheduler(),
    new TvChannelCollector(),
  ];
}
