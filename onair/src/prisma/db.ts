import "temporal-polyfill/full/global";
import "dotenv/config";
import postgres from "@prisma/orm-postgres/runtime";
import { contractFromJson } from "@prisma/orm-postgres/static";
import type { Contract } from "./contract.js";
import contractJson from "./contract.json";

const contract = contractFromJson<Contract>(contractJson);

/**
 * Lazily-connected Postgres client. The connection pool opens on the first
 * query, so importing this module does not require a reachable database.
 *
 * The module itself is the singleton boundary: Node caches it, so every
 * importer shares one client and one pool per process.
 */
export const db = postgres<Contract>({
  contract,
  url: process.env["DATABASE_URL"]!,
  poolOptions: {
    connectionTimeoutMillis: 20_000,
    idleTimeoutMillis: 30_000,
  },
});
