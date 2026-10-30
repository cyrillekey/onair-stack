import { type FastifyPluginCallbackJsonSchemaToTs } from "@fastify/type-provider-json-schema-to-ts";
import { catalogTypes } from "@/utils/helpers";
import { toIsoString } from "@/utils/api";

const channelSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    slug: { type: "string" },
    description: { type: "string", nullable: true },
    country: { type: "string" },
    category: { type: "string", enum: catalogTypes },
    poster: { type: "string", nullable: true },
    externalId: { type: "string", nullable: true },
    createdat: { type: "string", format: "date-time" },
    updatedat: { type: "string", format: "date-time" },
  },
  required: [
    "id",
    "name",
    "slug",
    "country",
    "category",
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

const channelsRoutes: FastifyPluginCallbackJsonSchemaToTs<{
  SerializerSchemaOptions: {
    deserialize: [
      {
        pattern: { type: "string"; format: "date-time" };
        output: Date | undefined | null;
      },
    ];
  };
}> = (fastify): void => {
  fastify.get(
    "",
    {
      schema: {
        tags: ["Channels"],
        operationId: "listChannels",
        summary: "List channels",
        description:
          "Returns channels ordered by name. Filter by country, category, or a case-insensitive name search.",
        produces: ["application/json"],
        querystring: {
          type: "object",
          properties: {
            country: {
              type: "string",
              minLength: 1,
              description: "Filter channels by country.",
            },
            category: {
              type: "string",
              enum: catalogTypes,
              description: "Filter channels by category.",
            },
            search: {
              type: "string",
              minLength: 1,
              maxLength: 120,
              description: "Search channel names (case-insensitive).",
            },
            limit: {
              type: "integer",
              minimum: 1,
              default: 50,
              maximum: 500,
              description: "Maximum number of channels to return.",
            },
            offset: {
              type: "integer",
              minimum: 0,
              description: "Number of channels to skip.",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              channels: {
                type: "array",
                items: channelSchema,
              },
            },
            required: ["channels"],
          },
          400: errorSchema,
          500: errorSchema,
        },
      },
    },
    async function (request, reply) {
      try {
        let query = fastify.db.orm.public.Channel.where({});

        if (request.query.country) {
          const country = request.query.country;
          query = query.where((channel) => channel.country.eq(country));
        }
        if (request.query.category) {
          const category = request.query.category;
          query = query.where((channel) => channel.category.eq(category));
        }
        if (request.query.search) {
          const search = `%${request.query.search}%`;
          query = query.where((channel) => channel.name.ilike(search));
        }
        if (request.query.limit !== undefined) {
          query = query.limit(request.query.limit);
        }
        if (request.query.offset !== undefined) {
          query = query.offset(request.query.offset);
        }

        const channels = await query
          .orderBy((channel) => channel.name.asc())
          .all();

        return {
          channels: channels.map((channel) => ({
            ...channel,
            createdat: toIsoString(channel.createdat),
            updatedat: toIsoString(channel.updatedat),
          })),
        };
      } catch (error) {
        request.log.error(error);
        return reply
          .code(500)
          .send({ message: "Could not fetch channels. Try again." });
      }
    },
  );

  fastify.get(
    "/:id",
    {
      schema: {
        tags: ["Channels"],
        operationId: "getChannel",
        summary: "Get a channel",
        description: "Returns a single channel by its ID.",
        produces: ["application/json"],
        params: {
          type: "object",
          properties: {
            id: {
              type: "string",
              minLength: 1,
              description: "Channel ID.",
            },
          },
          required: ["id"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              channel: channelSchema,
            },
            required: ["channel"],
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
          id: request.params.id,
        }).first();

        if (!channel) {
          return reply.code(404).send({ message: "Channel not found." });
        }

        return {
          channel: {
            ...channel,
            createdat: toIsoString(channel.createdat),
            updatedat: toIsoString(channel.updatedat),
          },
        };
      } catch (error) {
        request.log.error(error);
        return reply
          .code(500)
          .send({ message: "Could not fetch the channel. Try again." });
      }
    },
  );
};

export default channelsRoutes;
