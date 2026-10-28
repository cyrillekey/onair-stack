import fp from "fastify-plugin";
import { LRUCache } from "lru-cache";
import type { CatalogType } from "@/utils/helpers";

/** The configuration fields needed to render manifests, catalogs, and the editor. */
export type CachedConfiguration = {
  id: string;
  userId: string;
  countries: string[];
  categories: CatalogType[];
  timezone: string;
  showInHome: boolean;
  username: string;
};

type CacheEntry = { config: CachedConfiguration | null };

const CONFIGURATION_CACHE_MAX = 1_000;
// Writes invalidate the local process immediately; the TTL bounds staleness
// when several instances share the database.
const CONFIGURATION_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
// Unknown ids get a short TTL: repeat requests stay off Postgres, but a config
// created shortly after the first request is still picked up quickly.
const MISSING_CONFIGURATION_TTL_MS = 30 * 1_000;

declare module "fastify" {
  interface FastifyInstance {
    /**
     * Per-process LRU cache for user configurations.
     *
     * Reads should go through `get` instead of querying the database directly;
     * writes must call `invalidate` so the next read sees the new values.
     */
    configCache: {
      get: (userId: string) => Promise<CachedConfiguration | null>;
      invalidate: (userId: string) => void;
    };
  }
}

export default fp(
  (fastify) => {
    const cache = new LRUCache<string, CacheEntry>({
      max: CONFIGURATION_CACHE_MAX,
      ttl: CONFIGURATION_CACHE_TTL_MS,
    });

    fastify.decorate("configCache", {
      async get(userId: string): Promise<CachedConfiguration | null> {
        const cached = cache.get(userId);
        if (cached) return cached.config;

        const config = await fastify.db.orm.public.Configuration.whereUnique({
          userId,
        })
          .include("user")
          .first();

        if (!config) {
          cache.set(
            userId,
            { config: null },
            { ttl: MISSING_CONFIGURATION_TTL_MS },
          );
          return null;
        }

        const entry: CacheEntry = {
          config: {
            id: config.id,
            userId: config.userId,
            countries: [...config.countries],
            categories: [...config.categories] as CatalogType[],
            timezone: config.timezone,
            showInHome: config.showInHome,
            username: config.user.name ?? "",
          },
        };
        cache.set(userId, entry);
        return entry.config;
      },
      invalidate(userId: string): void {
        cache.delete(userId);
      },
    });

    fastify.addHook("onClose", () => {
      cache.clear();
    });
  },
  { name: "config-cache" },
);
