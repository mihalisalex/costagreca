// Postgres connection (Neon). Vercel's Neon integration sets DATABASE_URL.
import pg from "pg";
import { SCHEMA } from "./schema.js";

let pool = null;
let schemaReady = null;

function connect() {
  // Tests inject an in-memory database here.
  if (globalThis.__CG_TEST_DB) return globalThis.__CG_TEST_DB;
  if (!pool) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    pool = new pg.Pool({ connectionString: url, max: 3, idleTimeoutMillis: 10000 });
  }
  return pool;
}

// Returns a database with the schema applied (once per server instance).
export async function getDb() {
  const db = connect();
  if (!schemaReady) {
    schemaReady = db.query(SCHEMA).catch(async () => {
      // Two cold starts can race on "create if not exists"; the retry then finds everything in place.
      await db.query(SCHEMA);
    });
    schemaReady.catch(() => { schemaReady = null; });
  }
  await schemaReady;
  return db;
}
