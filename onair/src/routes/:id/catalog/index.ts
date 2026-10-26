import {
  catalogTypes,
  encodeCatalogType,
  ExtraArgs,
  reverseCatalogId,
} from "@/utils/helpers";
import { FastifyPluginAsyncJsonSchemaToTs } from "@fastify/type-provider-json-schema-to-ts";

const catalogRoutes: FastifyPluginAsyncJsonSchemaToTs<{
  SerializerSchemaOptions: {
    deserialize: [
      {
        pattern: { type: "string"; format: "date-time" };
        output: Date | undefined | null;
      },
    ];
  };
}> = async (fastify, opts): Promise<void> => {
  fastify.get(
    "/{resource}/:catalog/:{extraArgs}.json",
    {
      schema: {
        tags: ["Stremio"],
        consumes: ["application/json"],
        produces: ["application/json"],
        summary: "Get tv catalogs based on catalog id",
        description: "Get tv catalogs based on catalog id",
        response: {
          default: {
            type: "object",
            properties: {
              metas: {
                type: "array",
                items: {
                  properties: {
                    id: {
                      type: "string",
                    },
                    name: {
                      type: "string",
                    },
                    type: {
                      type: "string",
                    },
                    description: {
                      type: "string",
                    },
                    poster: {
                      type: "string",
                    },
                    posterShape: {
                      type: "string",
                    },
                    logo: {
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
        params: {
          type: "object",
          properties: {
            resource: {
              type: "string",
              enum: ["movie", "series", "channel", "tv"],
            },
            id: {
              type: "string",
            },
            catalog: {
              type: "string",
              enum: catalogTypes.map(encodeCatalogType),
            },
            extraArgs: {
              type: "string",
            },
          },
          required: ["id", "catalog", "resource", "extraArgs"],
        },
      },
    },
    async (req, reply) => {
      try {
        const config = await fastify.db.orm.public.Configuration.where({
          userId: req.params.id,
        }).first();
        const catalog = reverseCatalogId(req.params.catalog);
        if (!config) {
          return {
            metas: [],
            cacheMaxAge: 120,
            staleRevalidate: 600,
            staleError: 172800,
          };
        }
        const extraArgs: ExtraArgs = Object.fromEntries(
          new URLSearchParams(req.params.extraArgs),
        );
        let query = fastify.db.orm.public.Channel.where({
          category: catalog,
        }).where((catalog) => catalog.country.in(config.countries));
        if (extraArgs?.search) {
          query = query.where((channel) =>
            channel.name.ilike(`%${extraArgs.search}%`),
          );
        }
        if (extraArgs?.skip) {
          const skip = Number(extraArgs.skip);
          query = query.offset(skip);
        }
        if (extraArgs?.date) {
          // handle epg case
        } else {
          const channels = await query.all();
          const metas = channels.map((channel) => ({
            id: channel.id,
            name: channel.name,
            type: "tv",
            description: channel.description,
            poster: channel.poster,
            posterShape: "landscape",
            logo: channel.poster,
          }));
          return {
            metas,
            cacheMaxAge: 120,
            staleRevalidate: 600,
            staleError: 172800,
          };
        }
      } catch (error) {
        fastify.log.error(error);
        return {
          metas: [],
          cacheMaxAge: 120,
          staleRevalidate: 600,
          staleError: 172800,
        };
      }
    },
  );
};
export default catalogRoutes;
