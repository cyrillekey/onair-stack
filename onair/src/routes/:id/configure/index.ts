import {
  CONFIGURE_GROUPS,
  COUNTRIES,
  GENRES,
  TIMEZONES,
} from "@/config/configure-options";
import { FastifyPluginAsyncJsonSchemaToTs } from "@fastify/type-provider-json-schema-to-ts";

const updateConfigurationRoutes: FastifyPluginAsyncJsonSchemaToTs<{
  SerializerSchemaOptions: {
    deserialize: [
      {
        pattern: { type: "string"; format: "date-time" };
        output: Date | undefined | null;
      },
    ];
  };
}> = async (fastify, opts): Promise<void> => {
  // Older add-on links pointed at /:id/configure; the builder now lives at
  // /configure, so send those visitors to the canonical page.
  fastify.get(
    "",
    {
      schema: {
        hide: true,
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
    async function (req, reply) {
      try {
        const id = req.params.id;
        const config = await fastify.db.orm.public.Configuration.whereUnique({
          userId: id,
        })
          .include("user")
          .first();
        if (!config) return reply.redirect("/configure");
        const template = fastify.ejs.compile("/configure/index", {
          pageTitle: "Update your line-up — Onair",
          groups: CONFIGURE_GROUPS,
          countries: COUNTRIES,
          genres: GENRES,
          timezones: TIMEZONES,
          config: { ...config, username: config.user.name },
        });
        return reply
          .header("cache-control", "no-store")
          .type("text/html; charset=utf-8")
          .send(template);
      } catch (error) {
        req.log.error(error);
        return reply.redirect("/configure");
      }
    },
  );
};
export default updateConfigurationRoutes;
