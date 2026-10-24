import type { BaseCollector } from "@/collectors/base.collector.js";
import BroadcastCollector from "@/collectors/stream/broadcast.collector.js";
import StreamsCollector from "@/collectors/stream/index.js";

import StreamHealthCollector from "@/collectors/cleaner/stream-health.collector.js";
import EpgScheduler from "@/collectors/schedule/epg.scheduler.js";

// Single place to add/remove sources. Append new collectors here.
// StreamHealth runs first so a RUN_ONCE pass marks newly broken links before
// the ingest collectors re-add working ones. Its delayed confirmations run on
// the BullMQ worker instead of waiting for the next cron tick.
export function buildRegistry(): BaseCollector[] {
  return [
    new StreamHealthCollector(),
    new StreamsCollector(),
    new BroadcastCollector(),
    new EpgScheduler(),
  ];
}
