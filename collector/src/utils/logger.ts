import pino from "pino";
import { config } from "@/config/index.js";

export const logger = pino({
  level: config.LOG_LEVEL,
  transport: {
    target: "@logtail/pino",
    options: {
      sourceToken: config.LOGTAIL_SOURCE_TOKEN,
      options: { endpoint: "https://$INGESTING_HOST" },
    },
  },
});
