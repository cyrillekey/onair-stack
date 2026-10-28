import { type FastifyPluginCallbackJsonSchemaToTs } from "@fastify/type-provider-json-schema-to-ts";

const updateConfigurationRoutes: FastifyPluginCallbackJsonSchemaToTs<{
  SerializerSchemaOptions: {
    deserialize: [
      {
        pattern: { type: "string"; format: "date-time" };
        output: Date | undefined | null;
      },
    ];
  };
}> = (fastify): void => {
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
    async function (_, reply) {
      return reply.redirect("/configure");
    },
  );
};
export default updateConfigurationRoutes;
