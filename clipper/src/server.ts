import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { z } from "zod";
import { clip } from "./clip.js";
import { loadConfig } from "./config.js";
import { loadAllTemplates } from "./templates/loader.js";
import { closeBrowser } from "./pipeline/renderer.js";
import type { AppConfig } from "./types.js";

const clipBodySchema = z.object({
  url: z.string().url(),
  template: z.string().optional(),
  tags: z.array(z.string()).optional(),
  folder: z.string().optional(),
  note: z.string().optional(),
  dryRun: z.boolean().optional(),
});

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

async function handleClip(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const raw = await readBody(req);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    json(res, 400, { error: "Invalid JSON" });
    return;
  }

  const parsed = clipBodySchema.safeParse(body);
  if (!parsed.success) {
    json(res, 400, { error: "Validation failed", details: parsed.error.flatten() });
    return;
  }

  try {
    const result = await clip(parsed.data);
    json(res, 200, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    json(res, 500, { error: message });
  }
}

async function handleTemplates(config: AppConfig, res: ServerResponse): Promise<void> {
  const all = await loadAllTemplates(config.vaultPath);
  const list = Array.from(all.values()).map((t) => ({
    name: t.name,
    folder: t.folder,
    triggers: t.triggers ?? [],
  }));
  json(res, 200, list);
}

export function startServer(): void {
  const config = loadConfig();
  const { port } = config;

  const server = createServer(async (req, res) => {
    const url = req.url ?? "/";
    const method = req.method ?? "GET";

    try {
      if (url === "/health" && method === "GET") {
        json(res, 200, { status: "ok" });
      } else if (url === "/templates" && method === "GET") {
        await handleTemplates(config, res);
      } else if (url === "/clip" && method === "POST") {
        await handleClip(req, res);
      } else {
        json(res, 404, { error: "Not found" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal server error";
      json(res, 500, { error: message });
    }
  });

  server.listen(port, () => {
    console.log(`Clipper HTTP server listening on port ${port}`);
  });

  function shutdown() {
    console.log("Shutting down...");
    server.close(async () => {
      await closeBrowser();
      process.exit(0);
    });
    // Force exit after 5s if graceful shutdown hangs
    setTimeout(() => process.exit(1), 5000);
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

startServer();
