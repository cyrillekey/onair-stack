import { FastifyPluginAsync } from "fastify";

const configurationRoutes: FastifyPluginAsync = async (
  fastify,
  opts,
): Promise<void> => {
  fastify.get("", async function (request, reply) {
    return { root: true };
  });
  fastify.post(
    "",
    {
      schema: {
        response: {
          type: "object",
          properties: {
            success: {
              type: "bool",
            },
            manifest: {
              type: "string",
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
  fastify.put(":id", {}, async (req, res) => {});
};

export default configurationRoutes;
