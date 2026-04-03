import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createDatabase } from "@sentinel/shared";
import { createApi } from "./api/index";

const DB_PATH = process.env.DATABASE_PATH ?? "./sentinel.db";
const PORT = parseInt(process.env.PORT ?? "3001", 10);

// Resolve dist directory — env override, then relative to this file, then CWD-relative
function findDist(): string {
  if (process.env.DIST_DIR) return resolve(process.env.DIST_DIR);

  const thisDir = resolve(fileURLToPath(import.meta.url), "..");
  const candidates = [
    resolve(thisDir, "..", "dist"), // relative to src/ → ../dist
    resolve("apps/dashboard/dist"), // CWD = monorepo root
    resolve("dist"), // CWD = apps/dashboard
  ];

  for (const dir of candidates) {
    if (existsSync(resolve(dir, "index.html"))) return dir;
  }
  return resolve("dist");
}

const DIST_DIR = findDist();
console.log(`Dist directory: ${DIST_DIR}`);

const db = createDatabase(DB_PATH);
const app = createApi(db);

// Serve built static assets — serveStatic needs a CWD-relative root
const distRelative = DIST_DIR.startsWith(process.cwd())
  ? "./" + DIST_DIR.slice(process.cwd().length + 1)
  : DIST_DIR;

app.use(
  "/assets/*",
  serveStatic({
    root: distRelative,
    rewriteRequestPath: (path: string) => path,
  }),
);

// SPA fallback — serve index.html for all non-API routes
app.get("*", (c) => {
  const indexPath = resolve(DIST_DIR, "index.html");
  try {
    const html = readFileSync(indexPath, "utf-8");
    return c.html(html);
  } catch {
    return c.text("Dashboard not built. Run: vp build", 404);
  }
});

console.log(`Sentinel Dashboard listening on http://localhost:${PORT}`);
serve({ fetch: app.fetch, port: PORT });
