import "temporal-polyfill/global";
import { join } from "node:path";
import AutoLoad, { type AutoloadPluginOptions } from "@fastify/autoload";
import type { FastifyPluginCallback, FastifyServerOptions } from "fastify";
import fastifySwagger from "@fastify/swagger";
import { type JsonSchemaToTsProvider } from "@fastify/type-provider-json-schema-to-ts";
import fastifyCors from "@fastify/cors";
import scalarDocumentation from "@scalar/fastify-api-reference";
export interface AppOptions
  extends FastifyServerOptions, Partial<AutoloadPluginOptions> {}
// Pass --options via CLI arguments in command to enable these options.
const options: AppOptions = {
  routeParams: true,
  dirNameRoutePrefix: true,
};

const app: FastifyPluginCallback<AppOptions> = (fastify, opts) => {
  // Place here your custom code!
  fastify.withTypeProvider<
    JsonSchemaToTsProvider<{
      SerializerSchemaOptions: {
        deserialize: [
          { pattern: { type: "string"; format: "date-time" }; output: Date },
        ];
      };
    }>
  >();
  void fastify.register(fastifySwagger, {
    openapi: {
      openapi: "3.0.0",
      info: {
        title: "Onair Stremio",
        version: "1.0.0",
        license: {
          name: "MIT",
          identifier: "MIT",
          url: "https://opensource.org/license/mit/",
        },
      },
      tags: [],
    },
  });
  fastify.register(scalarDocumentation, {
    routePrefix: "/api/documentation",
    configuration: {
      content: () => fastify.swagger(),
    },
  });
  fastify.register(fastifyCors, {
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  });
  // Do not touch the following lines

  // This loads all plugins defined in plugins
  // those should be support plugins that are reused
  // through your application

  void fastify.register(AutoLoad, {
    dir: join(__dirname, "plugins"),
    options: opts,
  });

  // This loads all plugins defined in routes
  // define your routes in one of these

  void fastify.register(AutoLoad, {
    dir: join(__dirname, "routes"),
    options: opts,
  });
};

export default app;
export { app, options };
