import { logger } from "@/utils/logger.js";
import { getDb } from "../db/client.js";
import { load } from "cheerio";
import { fetchHtml } from "@/utils/http.js";
import { uploadImageFromUrl } from "@/utils/image.js";
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
    logger.error({ error }, "failed to build channels list");
    return [];
  }
}

async function main() {
  try {
    const db = getDb();
    const pages = 16;
    for (let index = 0; index < pages; index++) {
      const page = index + 1;
      const channels = await channelCollector(page);
      const withPosters = [];
      for (let index = 0; index < channels.length; index++) {
        const channel = channels[index];
        if (!channel?.poster) {
          withPosters.push(channel);
        } else {
          const poster = await uploadImageFromUrl(channel.poster);
          if (poster?.secure_url) {
            channel.poster = poster.secure_url;
            withPosters.push(channel);
          }
        }
      }
      await db.orm.public.Channel.createAll(
        withPosters.map((a) => {
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
    }
  } catch (error) {
    logger.error({ error });
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
  process.exit(1);
});
