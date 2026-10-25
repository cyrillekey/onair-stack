import { FastifyPluginAsyncJsonSchemaToTs } from "@fastify/type-provider-json-schema-to-ts";

const configurationRoutes: FastifyPluginAsyncJsonSchemaToTs<{
  SerializerSchemaOptions: {
    deserialize: [
      {
        pattern: { type: "string"; format: "date-time" };
        output: Date | undefined | null;
      },
    ];
  };
}> = async (fastify, opts): Promise<void> => {
  fastify.post(
    "/",
    {
      schema: {
        consumes: ['application/json'],
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
          },
        },
        body: {
          type: "object",
          properties: {
            countries: {
              type: "array",
              items: {
                type: "string",
              },
            },
            categories: {
              type: "array",
              items: {
                type: "string",
              },
            },
            timezone: {
              type: "string",
            },
            username: {
              type: "string",
            },
          },
          required: ["countries", "categories", "timezone", "username"],
        },
      },
    },
    async function (request, reply) {},
  );
  fastify.put("/:id", {}, async (req, res) => {});
};
export default configurationRoutes;
