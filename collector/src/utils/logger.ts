import pino from "pino";
import { config } from "@/config/index.js";

export const logger = pino({
  level: config.LOG_LEVEL,
  transport:
    config.NODE_ENV === "production"
      ? {
          target: "@logtail/pino",
          options: {
            sourceToken: config.LOGTAIL_SOURCE_TOKEN,
            options: { endpoint: config.LOGTAIL_INGESTING_HOST },
          },
        }
      : {
          target: "pino-pretty",
        },
});
