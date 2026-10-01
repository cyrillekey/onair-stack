import type { BaseCollector } from "@/collectors/base.collector.js";
import StreamsCollector from "@/collectors/index.js";
import UkScheduler from "@/collectors/schedule/uk.schedule.js";
import ScheduleCollector from "@/collectors/schedule/usa.schedule.js";

// Single place to add/remove sources. Append new collectors here.
export function buildRegistry(): BaseCollector[] {
  return [new ScheduleCollector(), new StreamsCollector(), new UkScheduler()];
}
