import "dotenv/config";
import "@/utils/instrument.js";
import * as Sentry from "@sentry/node";
import { logger } from "@/utils/logger.js";
import { flushSentry, reportError } from "@/utils/sentry.js";
import { getDb } from "../db/client.js";
import { load } from "cheerio";
import { fetchHtml } from "@/utils/http.js";
import { v2 as cloudinary } from "cloudinary";
import { config } from "../config/index.js";
if (config.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: config.CLOUDINARY_CLOUD_NAME,
    api_key: config.CLOUDINARY_API_KEY,
    api_secret: config.CLOUDINARY_API_SECRET,
    secure: true,
  });
}
async function channelCollector(page: number) {
  try {
    const html = await fetchHtml(
      `https://online-television.com/tv-channels/page/${page}/`,
    );
    if (!html) return [];
    const $ = load(html);
    const body = $(".topch__grid")
      .find(".topch-item")
      .map((_, el) => {
        const channel = $(el);
        const name = channel.find(".topch-item__name").find("a").text();
        const url = channel.find(".topch-item__name").find("a").attr("href");
        const country = channel.find(".topch-item__country").text();
        const logo = channel.find(".topch-item__logo").find("img").attr("src");
        const logoUrl = logo ? `https://online-television.com${logo}` : null;
        return {
          name,
          url,
          country,
          poster: logoUrl,
          slug: slugify(name),
        };
      })
      .get();
    return body;
  } catch (error) {
    logger.error({ error, page }, "failed to build channels list");
    reportError(error, {
      job: "channels-seed",
      message: "failed to build channels list",
      page,
    });
    return [];
  }
}

async function main() {
  try {
    const db = getDb();
    const pages = 16;
    for (let index = 0; index < pages; index++) {
      try {
        const page = index + 1;
        const channels = await channelCollector(page);
        await db.orm.public.Channel.createAll(
          channels.map((a) => {
            const channelId = a.url
              ?.split("/")
              .filter((a) => a)
              ?.at(-1);
            return {
              country: a.country,
              name: a.name,
              category: "GENERAL",
              description: "",
              externalId: channelId,
              slug: a.slug,
              poster: a.poster,
            };
          }),
          { onConflict: "skip" },
        );
        await sleep();
      } catch (error) {
        logger.error({ error, page: index + 1 }, "failed to ingest channels page");
        reportError(error, {
          job: "channels-seed",
          message: "failed to ingest channels page",
          page: index + 1,
        });
      }
    }
  } catch (error) {
    logger.error({ error }, "error running collector");
    reportError(error, { job: "channels-seed", message: "error running collector" });
  }
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

async function sleep() {
  return new Promise((resolve) => {
    setTimeout(resolve, 5000);
  });
}

main().catch((err) => {
  logger.fatal({ err }, "collector failed to start");
  reportError(err, { job: "channels-seed", message: "collector failed to start" });
  void (async () => {
    await Sentry.flush(5_000);
    await flushSentry();
    process.exit(1);
  })();
});
