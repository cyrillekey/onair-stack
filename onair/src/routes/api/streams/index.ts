import { FastifyPluginAsyncJsonSchemaToTs } from "@fastify/type-provider-json-schema-to-ts";
import { toIsoString } from "@/utils/api";

const streamSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    slug: { type: "string" },
    url: { type: "string" },
    language: { type: "string" },
    resolution: { type: "string", nullable: true },
    youtubeId: { type: "string", nullable: true },
    channelId: { type: "string" },
    createdat: { type: "string", format: "date-time" },
    updatedat: { type: "string", format: "date-time" },
  },
  required: [
    "id",
    "name",
    "slug",
    "url",
    "language",
    "channelId",
    "createdat",
    "updatedat",
  ],
};

const errorSchema = {
  type: "object",
  properties: {
    message: { type: "string" },
  },
  required: ["message"],
};

const streamsRoutes: FastifyPluginAsyncJsonSchemaToTs<{
  SerializerSchemaOptions: {
    deserialize: [
      {
        pattern: { type: "string"; format: "date-time" };
        output: Date | undefined | null;
      },
    ];
  };
}> = async (fastify): Promise<void> => {
  fastify.get(
    "",
    {
      schema: {
        tags: ["Streams"],
        operationId: "listStreams",
        summary: "List streams for a channel",
        description:
          "Returns stream sources for a specific channel, ordered by name. The channelId parameter is required so streams are never listed across all channels.",
        produces: ["application/json"],
        querystring: {
          type: "object",
          properties: {
            channelId: {
              type: "string",
              minLength: 1,
              description: "Channel ID whose streams to return.",
            },
            language: {
              type: "string",
              minLength: 1,
              description: "Filter streams by language.",
            },
            resolution: {
              type: "string",
              minLength: 1,
              description: "Filter streams by resolution.",
            },
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 500,
              description: "Maximum number of streams to return.",
            },
            offset: {
              type: "integer",
              minimum: 0,
              description: "Number of streams to skip.",
            },
          },
          required: ["channelId"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              streams: {
                type: "array",
                items: streamSchema,
              },
            },
            required: ["streams"],
          },
          400: errorSchema,
          404: errorSchema,
          500: errorSchema,
        },
      },
    },
    async function (request, reply) {
      try {
        const channel = await fastify.db.orm.public.Channel.where({
          id: request.query.channelId,
        }).first();

        if (!channel) {
          return reply.code(404).send({ message: "Channel not found." });
        }

        let query = fastify.db.orm.public.Stream.where({
          channelId: request.query.channelId,
        });

        if (request.query.language) {
          const language = request.query.language;
          query = query.where((stream) => stream.language.eq(language));
        }
        if (request.query.resolution) {
          const resolution = request.query.resolution;
          query = query.where((stream) => stream.resolution.eq(resolution));
        }
        if (request.query.limit !== undefined) {
          query = query.limit(request.query.limit);
        }
        if (request.query.offset !== undefined) {
          query = query.offset(request.query.offset);
        }

        const streams = await query.orderBy((stream) => stream.name.asc()).all();

        return {
          streams: streams.map((stream) => ({
            ...stream,
            createdat: toIsoString(stream.createdat),
            updatedat: toIsoString(stream.updatedat),
          })),
        };
      } catch (error) {
        request.log.error(error);
        return reply
          .code(500)
          .send({ message: "Could not fetch streams. Try again." });
      }
    },
  );

  fastify.get(
    "/:id",
    {
      schema: {
        tags: ["Streams"],
        operationId: "getStream",
        summary: "Get a stream",
        description: "Returns a single stream source by its ID.",
        produces: ["application/json"],
        params: {
          type: "object",
          properties: {
            id: {
              type: "string",
              minLength: 1,
              description: "Stream ID.",
            },
          },
          required: ["id"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              stream: streamSchema,
            },
            required: ["stream"],
          },
          400: errorSchema,
          404: errorSchema,
          500: errorSchema,
        },
      },
    },
    async function (request, reply) {
      try {
        const stream = await fastify.db.orm.public.Stream.where({
          id: request.params.id,
        }).first();

        if (!stream) {
          return reply.code(404).send({ message: "Stream not found." });
        }

        return {
          stream: {
            ...stream,
            createdat: toIsoString(stream.createdat),
            updatedat: toIsoString(stream.updatedat),
          },
        };
      } catch (error) {
        request.log.error(error);
        return reply
          .code(500)
          .send({ message: "Could not fetch the stream. Try again." });
      }
    },
  );
};

export default streamsRoutes;
