import { type FastifyPluginCallbackJsonSchemaToTs } from "@fastify/type-provider-json-schema-to-ts";
import {
  CONFIGURE_GROUPS,
  COUNTRIES,
  GENRES,
  TIMEZONES,
} from "@/config/configure-options";
import type { CatalogType } from "@/utils/helpers";
import appConfig from "@/config";
import { getCountryForTimezone } from "countries-and-timezones";

const countryValues = COUNTRIES.map((option) => option.value);
const genreValues = GENRES.map((option) => option.value);

const configurationRoutes: FastifyPluginCallbackJsonSchemaToTs<{
  SerializerSchemaOptions: {
    deserialize: [
      {
        pattern: { type: "string"; format: "date-time" };
        output: Date | undefined | null;
      },
    ];
  };
}> = (fastify): void => {
  fastify.get("", { schema: { hide: true } }, async function (_, reply) {
    const view = await fastify.ejs.compile("/configure/index", {
      pageTitle: "Configure your line-up — Onair",
      groups: CONFIGURE_GROUPS,
      countries: COUNTRIES,
      genres: GENRES,
      timezones: TIMEZONES,
      config: {
        countries: COUNTRIES,
        genres: GENRES,
      },
    });
    return reply
      .header("cache-control", "no-store")
      .type("text/html; charset=utf-8")
      .send(view);
  });

  fastify.post(
    "",
    {
      schema: {
        consumes: ["application/json"],
        tags: ["Stremio"],
        summary: "Generate stremio addon",
        body: {
          type: "object",
          properties: {
            countries: {
              type: "array",
              items: {
                type: "string",
                enum: countryValues,
              },
            },
            categories: {
              type: "array",
              items: {
                type: "string",
                enum: genreValues,
              },
            },
            timezone: {
              type: "string",
              minLength: 1,
              maxLength: 64,
            },
            username: {
              type: "string",
              minLength: 1,
              maxLength: 48,
            },
            showOnHome: {
              type: "boolean",
              default: true,
            },
          },
          required: ["timezone", "username"],
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: {
                type: "boolean",
              },
              manifest: {
                type: "string",
              },
            },
            required: ["success", "manifest"],
          },
          400: {
            type: "object",
            properties: {
              success: {
                type: "boolean",
              },
              message: {
                type: "string",
              },
            },
            additionalProperties: true,
          },
          500: {
            type: "object",
            properties: {
              success: {
                type: "boolean",
              },
              message: {
                type: "string",
              },
            },
            additionalProperties: true,
          },
        },
      },
    },
    async function (request, reply) {
      const username = request.body.username.trim();
      const countries = request.body.countries ?? [];
      const categories = request.body.categories ?? [];

      if (!username) {
        return reply.code(400).send({
          success: false,
          message: "Add a username to generate your link.",
        });
      }

      if (countries.length === 0 && categories.length === 0) {
        return reply.code(400).send({
          success: false,
          message:
            "Select at least one country or genre to generate your link.",
        });
      }

      try {
        const user = await fastify.db.orm.public.User.create({
          name: username,
          country:
            getCountryForTimezone(request.body.timezone)?.name ??
            request.body.timezone,
        });

        try {
          await fastify.db.orm.public.Configuration.create({
            countries,
            categories: categories as CatalogType[],
            timezone: request.body.timezone,
            userId: user.id,
            showInHome: request.body.showOnHome,
          });
        } catch (error) {
          // Do not leave a user behind when the configuration write fails.
          await fastify.db.orm.public.User.where({ id: user.id }).delete();
          throw error;
        }

        const manifest = `${appConfig.baseUrl}/${user.id}/manifest.json`;

        return { success: true, manifest };
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({
          success: false,
          message: "Could not generate your link. Try again.",
        });
      }
    },
  );

  fastify.put(
    "/:id",
    {
      schema: {
        consumes: ["application/json"],
        produces: ["application/json"],
        params: {
          type: "object",
          properties: {
            id: {
              type: "string",
            },
          },
          required: ["id"],
        },
        tags: ["Stremio"],
        summary: "Update user stremio configuration",
        body: {
          type: "object",
          properties: {
            countries: {
              type: "array",
              items: {
                type: "string",
                enum: countryValues,
              },
            },
            categories: {
              type: "array",
              items: {
                type: "string",
                enum: genreValues,
              },
            },
            timezone: {
              type: "string",
              minLength: 1,
              maxLength: 64,
            },
            username: {
              type: "string",
              minLength: 1,
              maxLength: 48,
            },
            showOnHome: {
              type: "boolean",
              default: true,
            },
          },
          required: ["timezone", "username"],
          additionalProperties: false,
        },
        response: {
          default: {
            type: "object",
            properties: {
              success: {
                type: "boolean",
              },
              manifest: {
                type: "string",
              },
              message: {
                type: "string",
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const countries = request.body.countries ?? [];
      const categories = request.body.categories ?? [];

      if (countries.length === 0 && categories.length === 0) {
        return reply.code(400).send({
          success: false,
          message: "Select at least one country or genre to update your link.",
        });
      }

      try {
        const config = await fastify.db.orm.public.Configuration.where({
          userId: request.params.id,
        }).first();
        let userId = config?.userId;
        if (!config?.id) {
          // create config and user
          const user = await fastify.db.orm.public.User.create({
            name: request.body.username,
            country:
              getCountryForTimezone(request.body.timezone)?.name ??
              request.body.timezone,
          });
          await fastify.db.orm.public.Configuration.create({
            countries,
            categories: categories as CatalogType[],
            timezone: request.body.timezone,
            userId: user.id,
            showInHome: request.body.showOnHome,
          });
        } else {
          const updated = await fastify.db.orm.public.Configuration.where({
            id: config.id,
          }).update({
            categories: categories as CatalogType[],
            countries,
            showInHome: request.body.showOnHome,
            timezone: request.body.timezone,
          });
          userId = updated?.userId;
        }
        const manifest = `${appConfig.baseUrl}/${userId}/manifest.json`;
        return {
          success: true,
          manifest,
          message: "Manifest updated",
        };
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({
          success: false,
          message: "Could not generate your link. Try again.",
        });
      }
    },
  );
};
export default configurationRoutes;
