import { baseManifest, buildCatalog, type CatalogType } from "@/utils/helpers";
import { GENRES } from "@/config/configure-options";
import { type FastifyPluginCallbackJsonSchemaToTs } from "@fastify/type-provider-json-schema-to-ts";
import { type Manifest } from "stremio-addon-sdk";

const stremioRoutes: FastifyPluginCallbackJsonSchemaToTs<{
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
    "/manifest.json",
    {
      schema: {
        tags: ["Stremio"],
        consumes: ["application/json"],
        produces: ["application/json"],
        summary: "Get user stremio manifest",
        description: "Ger stremio manifest for user given id",
        params: {
          type: "object",
          properties: {
            id: {
              type: "string",
            },
          },
          required: ["id"],
        },
        querystring: {
          type: "object",
          properties: {
            home: {
              type: "string",
              enum: ["0", "1"],
            },
          },
        },
      },
    },
    async (req, reply) => {
      try {
        const config = await fastify.configCache.get(req.params.id);
        if (!config?.id) {
          return reply.redirect("/configure");
        }
        const showInHome =
          req.query.home === undefined
            ? config.showInHome
            : req.query.home !== "0";
        // An empty genre list means every configurable genre.
        const categories =
          config.categories.length > 0
            ? config.categories
            : (GENRES.map((genre) => genre.value) as CatalogType[]);
        const catalogs = buildCatalog(categories, showInHome);
        const manifest: Manifest = {
          ...baseManifest,
          catalogs,
          behaviorHints: {
            configurable: true,
            epgProvider: true,
            configurationRequired: false,
          },
        };

        reply.status(200).send(manifest);
      } catch (error) {
        req.log.error(error);
        reply.redirect("/configure");
      }
    },
  );
};
export default stremioRoutes;
