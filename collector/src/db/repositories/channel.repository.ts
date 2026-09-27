// Repository boundary between collectors and the database.
// Collectors depend on these interfaces, never on Prisma types directly,
// so the persistence layer can evolve without touching scrape logic.

export interface ChannelRecord {
  /** Stable natural key, e.g. source slug or upstream id. */
  externalId: string;
  source: string;
  name: string;
  streamUrl?: string | null;
  logoUrl?: string | null;
  group?: string | null;
  country?: string | null;
  scrapedAt: Date;
  raw?: unknown;
}

export interface ChannelRepository {
  upsertMany(channels: ChannelRecord[]): Promise<{ upserted: number }>;
}

export class LoggingChannelRepository implements ChannelRepository {
  upsertMany(channels: ChannelRecord[]): Promise<{ upserted: number }> {
    // Placeholder until `prisma contract emit` wires the real tables.
    // Replace with db.channel.upsert() batch calls.
    void channels;
    return Promise.resolve({ upserted: 0 });
  }
}
