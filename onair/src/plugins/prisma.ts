import fp from "fastify-plugin";
import { db } from "@/prisma/db";

declare module "fastify" {
  interface FastifyInstance {
    /** Process-wide, lazily-connected Postgres client. */
    db: typeof db;
  }
}

/**
 * Exposes the Prisma Postgres client as `fastify.db`.
 *
 * The client is a module-level singleton, so this plugin only publishes it on
 * the Fastify instance; no new pool is created per registration. The pool is
 * closed when the server shuts down.
 */
export default fp(
  async (fastify) => {
    fastify.decorate("db", db);

    fastify.addHook("onClose", async () => {
      await db.close();
    });
  },
  { name: "prisma" },
);
