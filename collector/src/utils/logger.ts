import pino from "pino";
import { config } from "@/config/index.js";

export const logger = pino({
  level: config.LOG_LEVEL,
  transport:
    config.NODE_ENV === "production"
      ? {
          target: "@axiomhq/pino",
          options: {
            dataset: config.AXIOM_DATASET,
            token: config.AXIOM_TOKEN,
            edge: config.AXIOM_REGION,
          },
        }
      : {
          target: "pino-pretty",
        },
});
