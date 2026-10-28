import {
  type CatalogType,
  catalogTypes,
  encodeCatalogType,
  type ExtraArgs,
  reverseCatalogId,
} from "@/utils/helpers";
import {
  cacheControl,
  GUIDE_CACHE,
  metaForChannel,
  parseGuideDate,
  previewForChannel,
  videoForSchedule,
} from "@/utils/epg";
import { type FastifyPluginCallbackJsonSchemaToTs } from "@fastify/type-provider-json-schema-to-ts";

const CATALOG_PAGE_SIZE = 100;
const dateTimeFormat: string = "date-time";

const videoSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    released: { type: "string", format: dateTimeFormat },
    startTime: { type: "string", format: dateTimeFormat },
    endTime: { type: "string", format: dateTimeFormat },
    overview: { type: "string" },
    thumbnail: { type: "string" },
    runtime: { type: "string" },
    releaseInfo: { type: "string" },
    genres: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["id", "title", "released", "startTime", "endTime"],
} as const;

const metaPreviewSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    type: { type: "string" },
    description: { type: "string" },
    poster: { type: "string" },
    posterShape: { type: "string" },
    logo: { type: "string" },
    behaviorHints: {
      type: "object",
      properties: {
        isLive: { type: "boolean" },
      },
    },
  },
  required: ["id", "name", "type", "poster"],
} as const;

const metaDetailSchema = {
  type: "object",
  properties: {
    ...metaPreviewSchema.properties,
    background: { type: "string" },
    country: { type: "string" },
    genres: {
      type: "array",
      items: { type: "string" },
    },
    videos: {
      type: "array",
      items: videoSchema,
    },
    behaviorHints: {
      type: "object",
      properties: {
        isLive: { type: "boolean" },
        hasScheduledVideos: { type: "boolean" },
      },
    },
  },
  required: ["id", "name", "type", "poster"],
} as const;

const catalogResponseSchema = {
  type: "object",
  properties: {
    metas: {
      type: "array",
      items: metaPreviewSchema,
    },
    metasDetailed: {
      type: "array",
      items: metaDetailSchema,
    },
    cacheMaxAge: {
      type: "integer",
      default: 120,
    },
    staleRevalidate: {
      type: "integer",
      default: 600,
    },
    staleError: {
      type: "integer",
      default: 172800,
    },
  },
} as const;

const catalogParamsSchema = {
  type: "object",
  properties: {
    id: {
      type: "string",
    },
    catalog: {
      type: "string",
      enum: catalogTypes.map(encodeCatalogType),
      default: "sports",
    },
    type: {
      type: "string",
      enum: ["tv", "movie", "series", "channel"],
      default: "tv",
    },
  },
  required: ["id", "catalog"],
} as const;

const catalogExtraParamsSchema = {
  type: "object",
  properties: {
    ...catalogParamsSchema.properties,
    extraArgs: {
      type: "string",
    },
  },
  required: ["id", "catalog", "extraArgs"],
} as const;

const catalogRoutes: FastifyPluginCallbackJsonSchemaToTs<{
  SerializerSchemaOptions: {
    deserialize: [
      {
        pattern: { type: "string"; format: "date-time" };
        output: Date | undefined | null;
      },
    ];
  };
}> = (fastify): void => {
  async function getCatalog(
    userId: string,
    catalogId: string,
    extraArgsValue: string,
  ) {
    const extraArgs: ExtraArgs = Object.fromEntries(
      new URLSearchParams(extraArgsValue),
    );
    const hasGuideDate = Boolean(extraArgs.date);
    const guideWindow = parseGuideDate(extraArgs.date);
    const emptyResponse = hasGuideDate
      ? { metasDetailed: [], ...GUIDE_CACHE }
      : {
          metas: [],
          cacheMaxAge: 120,
          staleRevalidate: 600,
          staleError: 172800,
        };

    try {
      const config = await fastify.db.orm.public.Configuration.where({
        userId,
      }).first();
      if (!config) {
        return emptyResponse;
      }

      const catalog = reverseCatalogId(catalogId);

      if (hasGuideDate && !guideWindow) {
        return emptyResponse;
      }

      let query = fastify.db.orm.public.Channel.include(
        "schedule",
        (schedules) =>
          schedules
            .where((schedule) => schedule.endTime.gt(guideWindow.start))
            .where((schedule) => schedule.startTime.lt(guideWindow.end))
            .orderBy((schedule) => schedule.startTime.asc()),
      );
      if (catalog == "SPORTS") {
        const sports: CatalogType[] = [
          "SPORTS",
          "BASEBALL",
          "BASKETBALL",
          "COMBAT_SPORTS",
          "CRICKET",
          "FOOTBALL",
          "MOTORSPORTS",
        ];
        query = query.where((channel) => channel.category.in(sports));
      } else {
        query = query.where({
          category: catalog,
        });
      }

      // An empty country list means every country.
      if (config.countries.length > 0) {
        query = query.where((channel) => channel.country.in(config.countries));
      }

      if (extraArgs.search) {
        const search = `%${extraArgs.search}%`;
        query = query.where((channel) => channel.name.ilike(search));
      }
      if (extraArgs.skip) {
        const skip = Number(extraArgs.skip);
        if (Number.isInteger(skip) && skip > 0) {
          query = query.offset(skip);
        }
      }

      const channels = await query
        .orderBy((channel) => channel.slug.asc())
        .where((a) => a.streams.some())
        .limit(CATALOG_PAGE_SIZE)
        .all();

      if (!guideWindow) {
        return {
          metas: channels.map(previewForChannel),
          cacheMaxAge: 120,
          staleRevalidate: 600,
          staleError: 172800,
        };
      }

      if (channels.length === 0) {
        return { metasDetailed: [], ...GUIDE_CACHE };
      }

      return {
        metasDetailed: channels.map((channel) =>
          metaForChannel(
            channel,
            channel.schedule.map((schedule) =>
              videoForSchedule(channel, schedule),
            ),
          ),
        ),
        ...GUIDE_CACHE,
      };
    } catch (error) {
      fastify.log.error(error);
      return emptyResponse;
    }
  }

  fastify.get(
    "/:type/:catalog.json",
    {
      schema: {
        tags: ["Stremio"],
        consumes: ["application/json"],
        produces: ["application/json"],
        summary: "Get tv catalogs based on catalog id",
        description: "Get tv catalogs based on catalog id",
        response: {
          default: catalogResponseSchema,
        },
        params: catalogParamsSchema,
      },
    },
    async (req, reply) => {
      const response = await getCatalog(req.params.id, req.params.catalog, "");
      return reply
        .header("cache-control", cacheControl(response))
        .send(response);
    },
  );

  fastify.get(
    "/:type/:catalog/:extraArgs.json",
    {
      schema: {
        tags: ["Stremio"],
        consumes: ["application/json"],
        produces: ["application/json"],
        summary: "Get tv catalogs based on catalog id and extra arguments",
        description:
          "Get tv catalogs based on catalog id. A date extra returns the native EPG guide page.",
        response: {
          default: catalogResponseSchema,
        },
        params: catalogExtraParamsSchema,
      },
    },
    async (req, reply) => {
      const response = await getCatalog(
        req.params.id,
        req.params.catalog,
        req.params.extraArgs,
      );
      return reply
        .header("cache-control", cacheControl(response))
        .send(response);
    },
  );
};
export default catalogRoutes;
