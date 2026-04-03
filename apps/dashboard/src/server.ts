import { serve } from "@hono/node-server";
import { createDatabase } from "@sentinel/shared";
import { createApi } from "./api/index";

const DB_PATH = process.env.DATABASE_PATH ?? "./sentinel.db";
const PORT = parseInt(process.env.PORT ?? "3001", 10);

const db = createDatabase(DB_PATH);
const app = createApi(db);

console.log(`Sentinel Dashboard API listening on http://localhost:${PORT}`);
serve({ fetch: app.fetch, port: PORT });
