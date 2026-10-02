import type { BaseCollector } from "@/collectors/base.collector.js";
import StreamsCollector from "@/collectors/index.js";
import UkScheduler from "@/collectors/schedule/uk.schedule.js";
import ScheduleCollector from "@/collectors/schedule/usa.schedule.js";
import StreamHealthCollector from "@/collectors/stream-health.collector.js";

// Single place to add/remove sources. Append new collectors here.
// StreamHealth runs first so a RUN_ONCE pass prunes dead links before
// the ingest collectors re-add working ones.
export function buildRegistry(): BaseCollector[] {
  return [
    new StreamHealthCollector(),
    new ScheduleCollector(),
    new StreamsCollector(),
    new UkScheduler(),
  ];
}
