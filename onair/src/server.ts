import "dotenv/config";
import "temporal-polyfill/global";
import Sentry from "@/utils/instrument";
import Fastify from "fastify";
import closeWithGrace from "close-with-grace";
import app, { options } from "@/app";
import appConfig from "@/config";

function closeGraceDelay(): number {
  const value = process.env.FASTIFY_CLOSE_GRACE_DELAY;
  if (!value) return 10_000;

  const raw = Number(value);
  return Number.isFinite(raw) && raw >= 0 ? raw : 10_000;
}

const fastify = Fastify({
  logger:
    process.env.NODE_ENV !== "production"
      ? {
          level: process.env.LOG_LEVEL || "info",
        }
      : {
          level: "info",
          enabled: true,
          transport: {
            target: "@axiomhq/pino",
            options: {
              dataset: process.env.AXIOM_DATASET,
              token: process.env.AXIOM_TOKEN,
              edge: process.env.AXIOM_REGION || "us-east-1.aws.edge.axiom.co",
            },
          },
        },
});

void fastify.register(app, options);

/**
 * Finish in-flight requests and release resources on SIGINT/SIGTERM (or on a
 * fatal error) instead of letting the process die mid-request.
 *
 * `close-with-grace` also handles `uncaughtException`/`unhandledRejection` and
 * forces an exit if shutdown takes longer than the delay.
 */
const shutdown = closeWithGrace(
  {
    delay: closeGraceDelay(),
    logger: fastify.log,
  },
  async ({ signal, err, manual }) => {
    if (err) {
      fastify.log.error({ err }, "shutting down after a fatal error");
    } else {
      fastify.log.info(
        { signal, manual },
        "shutting down gracefully, draining connections",
      );
    }

    // Runs the `onClose` hooks registered by plugins (database pool, etc.).
    await fastify.close();
  },
);

fastify.addHook("onClose", async () => {
  shutdown.uninstall();
  await Sentry.close(2_000);
});

async function start(): Promise<void> {
  try {
    await fastify.listen({
      port: Number(appConfig.port),
      host: process.env.HOST || "0.0.0.0",
    });
  } catch (err) {
    fastify.log.error(err, "failed to start server");
    process.exit(1);
  }
}

void start();
