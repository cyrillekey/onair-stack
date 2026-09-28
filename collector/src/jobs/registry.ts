import type { BaseCollector } from "@/collectors/base.collector.js";
import StreamsCollector from "@/collectors/index.js";
import ScheduleCollector from "@/collectors/schedule/index.js";

// Single place to add/remove sources. Append new collectors here.
export function buildRegistry(): BaseCollector[] {
  // TODO: Implement

  return [new ScheduleCollector(), new StreamsCollector()];
}
