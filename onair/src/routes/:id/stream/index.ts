import { type FastifyPluginCallbackJsonSchemaToTs } from "@fastify/type-provider-json-schema-to-ts";

const streamRoutes: FastifyPluginCallbackJsonSchemaToTs<{
  SerializerSchemaOptions: {
    deserialize: [
      {
        pattern: { type: "string"; format: "date-time" };
        output: Date | undefined | null;
      },
    ];
  };
}> = (fastify): void => {
  fastify.route({
    method: "GET",
    schema: {
      summary: "Get catalog streams",
      description: "Get streams for a catalog based on type and catalog id",
      consumes: ["application/json"],
      produces: ["application/json"],
      params: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["movie", "tv", "series", "channel"],
          },
          catalogId: {
            type: "string",
          },
        },
        required: ["type", "catalogId"],
      },
      response: {
        default: {
          type: "object",
          properties: {
            streams: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                  },
                  name: {
                    type: "string",
                  },
                  url: {
                    type: "string",
                  },
                },
              },
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
        },
      },
      tags: ["Stremio"],
    },
    url: "/:type/:catalogId.json",
    handler: async (req, reply) => {
      try {
        const streams = await fastify.db.orm.public.Stream.where({
          channelId: req.params.catalogId,
        })
          .orderBy((a) => a.createdat.desc())
          .all();
        return reply.send({
          streams: streams.map((stream) => ({
            id: stream.id,
            name: `${stream.name} ${stream.failureCount > 0 ? " 🔴" : " 🟢"}`,
            url: stream.url,
            title: stream.resolution || "Unknown",
            description: stream.resolution || "Unknown",
          })),
          cacheMaxAge: 60,
          staleRevalidate: 300,
          staleError: 172800,
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.send({
          streams: [],
          cacheMaxAge: 120,
          staleRevalidate: 600,
          staleError: 172800,
        });
      }
    },
  });
};
export default streamRoutes;
