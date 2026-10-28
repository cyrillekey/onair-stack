import { type FastifyPluginCallbackJsonSchemaToTs } from "@fastify/type-provider-json-schema-to-ts";
import type { FastifyRequest } from "fastify";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIGURE_GROUPS, COUNTRIES, GENRES } from "@/config/configure-options";
import type { CatalogType } from "@/utils/helpers";
import { getCountryForTimezone } from "countries-and-timezones";

const PUBLIC_DIRS = [
  join(process.cwd(), "src", "public"),
  join(__dirname, "..", "..", "public"),
];
const assets = new Map<string, string>();

function readAsset(name: string): string {
  const cached = assets.get(name);
  if (cached !== undefined) {
    return cached;
  }
  const path = PUBLIC_DIRS.map((dir) => join(dir, name)).find((candidate) =>
    existsSync(candidate),
  );
  if (!path) {
    throw new Error(`Configure asset not found: ${name}`);
  }
  const contents = readFileSync(path, "utf8");
  assets.set(name, contents);
  return contents;
}

function requestOrigin(request: FastifyRequest): string {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const protoHeader = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto;
  const protocol = protoHeader?.split(",")[0]?.trim() || request.protocol;

  const forwardedHost = request.headers["x-forwarded-host"];
  const hostHeader = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : forwardedHost;
  const host =
    hostHeader?.split(",")[0]?.trim() ||
    request.headers.host ||
    request.hostname;

  return `${protocol}://${host}`;
}

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
      pageStyles: ["/configure/configure.css"],
      pageScript: "/configure/configure.js",
      groups: CONFIGURE_GROUPS,
    });
    return reply
      .header("cache-control", "no-store")
      .type("text/html; charset=utf-8")
      .send(view);
  });

  fastify.get(
    "/configure.css",
    { schema: { hide: true } },
    async function (_, reply) {
      return reply
        .header("cache-control", "no-cache")
        .type("text/css; charset=utf-8")
        .send(readAsset("configure.css"));
    },
  );

  fastify.get(
    "/configure.js",
    { schema: { hide: true } },
    async function (_, reply) {
      return reply
        .header("cache-control", "no-cache")
        .type("text/javascript; charset=utf-8")
        .send(readAsset("configure.js"));
    },
  );

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
              minItems: 1,
              items: {
                type: "string",
                enum: countryValues,
              },
            },
            categories: {
              type: "array",
              minItems: 1,
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
          required: ["countries", "categories", "timezone", "username"],
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
      if (!username) {
        return reply.code(400).send({
          success: false,
          message: "Add a username to generate your link.",
        });
      }

      const showOnHome = request.body.showOnHome ?? true;

      try {
        const user = await fastify.db.orm.public.User.create({
          name: username,
          country:
            getCountryForTimezone(request.body.timezone)?.name ??
            request.body.timezone,
        });

        try {
          await fastify.db.orm.public.Configuration.create({
            countries: request.body.countries,
            categories: request.body.categories as CatalogType[],
            timezone: request.body.timezone,
            userId: user.id,
            showInHome: showOnHome,
          });
        } catch (error) {
          // Do not leave a user behind when the configuration write fails.
          await fastify.db.orm.public.User.where({ id: user.id }).delete();
          throw error;
        }

        const manifest = `${requestOrigin(request)}/${user.id}/manifest.json${
          showOnHome ? "" : "?home=0"
        }`;

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

      const showOnHome = request.body.showOnHome ?? true;

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
            showInHome: showOnHome,
          });
          userId = user.id;
        } else {
          const updated = await fastify.db.orm.public.Configuration.where({
            id: config.id,
          }).update({
            categories: categories as CatalogType[],
            countries,
            showInHome: showOnHome,
            timezone: request.body.timezone,
          });
          userId = updated?.userId;
        }
        const manifest = `${requestOrigin(request)}/${userId}/manifest.json`;
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
