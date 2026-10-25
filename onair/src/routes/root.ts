import { renderConfigurePage } from "../views/configure";
import { FastifyPluginAsyncJsonSchemaToTs } from "@fastify/type-provider-json-schema-to-ts";

const root: FastifyPluginAsyncJsonSchemaToTs<{
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
    "/manifest.json",
    {
      schema: {
        consumes: ["application/json"],
        produces: ["application/json"],
        tags: ["Stremio"],
      },
    },
    async (req, reply) => ({}),
  );
  fastify.get(
    "/:id/manifest.json",
    {
      schema: {
        tags: ["Stremio"],
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
      },
    },
    async (req, reply) => {
      try {
        const config = await fastify.db.orm.public.Configuration.whereUnique({
          userId: req.params.id,
        }).first();
        if (!config?.id) {
          return reply.redirect("/configure");
        }
        reply.send({});
      } catch (error) {
        reply.send({});
      }
    },
  );
  fastify.get(
    "/configure",
    { schema: { hide: true } },
    async function (request, reply) {
      return reply
        .header("cache-control", "no-store")
        .type("text/html; charset=utf-8")
        .send(renderConfigurePage());
    },
  );
  fastify.get(
    "/:id/configure",
    {
      schema: {
        hide: true,
        produces: ["text/html"],
        params: {
          type: "object",
          properties: {
            id: {
              type: "string",
            },
          },
          required: ["id"],
        },
      },
    },
    async function (request, reply) {
      try {
        const id = request.params.id;
        const user = await fastify.db.orm.public.User.whereUnique({
          id,
        })
          .include("configuration")
          .first();
        if (!user?.id)
          return reply
            .header("cache-control", "no-store")
            .type("text/html; charset=utf-8")
            .send(renderConfigurePage());
        const config = user.configuration!;
        return reply
          .header("cache-control", "no-store")
          .type("text/html; charset=utf-8")
          .send(renderConfigurePage(config));
      } catch (error) {
        return reply.redirect("/configure");
      }
    },
  );
};

export default root;
