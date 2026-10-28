import { type FastifyPluginCallbackJsonSchemaToTs } from "@fastify/type-provider-json-schema-to-ts";
import {
  cacheControl,
  GUIDE_CACHE,
  metaForChannel,
  metaWindow,
  videoForSchedule,
} from "@/utils/epg";

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

const metaSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    type: { type: "string" },
    name: { type: "string" },
    description: { type: "string" },
    poster: { type: "string" },
    posterShape: { type: "string" },
    logo: { type: "string" },
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
} as const;

const metaRoutes: FastifyPluginCallbackJsonSchemaToTs<{
  SerializerSchemaOptions: {
    deserialize: [
      {
        pattern: { type: "string"; format: "date-time" };
        output: Date | undefined | null;
      },
    ];
  };
}> = (fastify):void => {
  fastify.get(
    "/:type/:metaId.json",
    {
      schema: {
        tags: ["Stremio"],
        consumes: ["application/json"],
        produces: ["application/json"],
        summary: "Get channel metadata and programme guide",
        description:
          "Returns the channel details and its current and upcoming native EPG programmes.",
        response: {
          default: {
            type: "object",
            properties: {
              meta: metaSchema,
              cacheMaxAge: {
                type: "integer",
                default: 300,
              },
              staleRevalidate: {
                type: "integer",
                default: 1800,
              },
              staleError: {
                type: "integer",
                default: 604800,
              },
            },
          },
        },
        params: {
          type: "object",
          properties: {
            id: {
              type: "string",
            },
            type: {
              type: "string",
              enum: ["tv"],
              default: "tv",
            },
            metaId: {
              type: "string",
            },
          },
          required: ["id", "type", "metaId"],
        },
      },
    },
    async (req, reply) => {
      try {
        const config = await fastify.configCache.get(req.params.id);
        if (!config) {
          return reply
            .header("cache-control", cacheControl(GUIDE_CACHE))
            .send({ meta: {}, ...GUIDE_CACHE });
        }

        const channel = await fastify.db.orm.public.Channel.where({
          id: req.params.metaId,
        }).first();
        if (!channel) {
          return reply
            .header("cache-control", cacheControl(GUIDE_CACHE))
            .send({ meta: {}, ...GUIDE_CACHE });
        }

        const window = metaWindow(config.timezone);
        const schedules = await fastify.db.orm.public.Schedule.where({
          channelId: channel.id,
        })
          .where((schedule) => schedule.endTime.gt(window.start))
          .where((schedule) => schedule.startTime.lt(window.end))
          .orderBy((schedule) => schedule.startTime.asc())
          .all();

        const response = {
          meta: metaForChannel(
            channel,
            schedules.map((schedule) => videoForSchedule(channel, schedule)),
          ),
          ...GUIDE_CACHE,
        };

        return reply
          .header("cache-control", cacheControl(response))
          .send(response);
      } catch (error) {
        fastify.log.error(error);
        return reply
          .header("cache-control", cacheControl(GUIDE_CACHE))
          .send({ meta: {}, ...GUIDE_CACHE });
      }
    },
  );
};
export default metaRoutes;
