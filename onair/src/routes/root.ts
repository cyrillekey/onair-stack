import { type FastifyPluginCallbackJsonSchemaToTs } from "@fastify/type-provider-json-schema-to-ts";

import { baseManifest } from "@/utils/helpers";

const root: FastifyPluginCallbackJsonSchemaToTs<{
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
        consumes: ["application/json"],
        produces: ["application/json"],
        tags: ["Stremio"],
        summary: "Get stremio manifest",
        description: "Get default stremio addon manifest",
      },
    },
    (_req, _reply) => {
      return baseManifest;
    },
  );
  fastify.get("/", { schema: { hide: true } }, async (_, reply) => {
    const html = await fastify.ejs.compile("/home/index", {});
    return reply
      .header("cache-control", "public, max-age=300")
      .type("text/html; charset=utf-8")
      .send(html);
  });
};

export default root;
