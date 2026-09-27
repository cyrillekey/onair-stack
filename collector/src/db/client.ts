import "dotenv/config";
import postgres from "@prisma/orm-postgres/runtime";
import type { Contract } from "@/prisma/contract.js";
import contractJson from "@/prisma/contract.json" with { type: "json" };

// Prisma 8 contract-driven client (same pattern as `huddle` service).
// 1. Define tables in `src/prisma/contract.prisma`
// 2. Run `prisma contract emit` to generate `contract.json` + `contract.d.ts`
// 3. Import the generated contract here.
//
// Until the contract is generated, the client is typed as `any`
// so the worker compiles and collectors can be developed against
// the repository interfaces in `src/db/repositories/`.

let cached: ReturnType<typeof postgres<Contract>> | null = null;

export function getDb(): ReturnType<typeof postgres<Contract>> {
  if (cached) return cached;
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is required");

  cached = postgres<Contract>({ contractJson, url });
  return cached;
}

export type DbClient = ReturnType<typeof getDb>;
