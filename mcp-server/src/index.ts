import express from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Request, Response, NextFunction } from "express";
import { loadConfig } from "./config.js";
import { createMcpServer } from "./mcp/server.js";

async function main() {
  const config = loadConfig();
  const app = express();
  app.use(express.json());

  // ── Health (no auth) ────────────────────────────────────

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // ── RFC 9728: Protected Resource Metadata ───────────────

  app.get("/.well-known/oauth-protected-resource", (_req, res) => {
    res.json({
      resource: config.serverUrl,
      authorization_servers: [config.issuer],
      scopes_supported: [],
      bearer_methods_supported: ["header"],
    });
  });

  // ── JWT auth middleware ─────────────────────────────────

  // Discover JWKS URI from OIDC configuration
  const oidcRes = await fetch(
    `${config.issuer}/.well-known/openid-configuration`,
  );
  if (!oidcRes.ok) {
    throw new Error(
      `Failed to fetch OIDC discovery from ${config.issuer}: ${oidcRes.status}`,
    );
  }
  const oidcConfig = (await oidcRes.json()) as { jwks_uri: string };
  if (!oidcConfig.jwks_uri) {
    throw new Error("No jwks_uri in OIDC discovery document");
  }
  const jwks = createRemoteJWKSet(new URL(oidcConfig.jwks_uri));
  console.log(`JWKS loaded from ${oidcConfig.jwks_uri}`);

  const requireAuth = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing Bearer token" });
      return;
    }

    const token = header.slice(7);
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: config.issuer,
      });
      // Attach auth info for the MCP transport
      (req as Request & { auth?: unknown }).auth = {
        token,
        clientId:
          (payload.client_id as string) ??
          (payload.azp as string) ??
          "",
        scopes: ((payload.scope as string) ?? "")
          .split(" ")
          .filter(Boolean),
        expiresAt: payload.exp,
      };
      next();
    } catch {
      res.status(401).json({ error: "Invalid or expired token" });
    }
  };

  // ── Session store ──────────────────────────────────────

  const sessions = new Map<string, StreamableHTTPServerTransport>();

  function createSession(): StreamableHTTPServerTransport {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId: string) => {
        sessions.set(sessionId, transport);
      },
      onsessionclosed: (sessionId: string) => {
        sessions.delete(sessionId);
      },
    });
    return transport;
  }

  // ── MCP endpoint ───────────────────────────────────────

  app.post("/mcp", requireAuth, async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId) {
      const transport = sessions.get(sessionId);
      if (!transport) {
        res.status(404).json({ error: "Session not found" });
        return;
      }
      await transport.handleRequest(req, res, req.body);
    } else {
      // New session — create transport + MCP server
      const transport = createSession();
      const server = createMcpServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    }
  });

  app.get("/mcp", requireAuth, async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const transport = sessionId ? sessions.get(sessionId) : undefined;
    if (!transport) {
      res.status(400).json({ error: "Invalid or missing session" });
      return;
    }
    await transport.handleRequest(req, res);
  });

  app.delete("/mcp", requireAuth, async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const transport = sessionId ? sessions.get(sessionId) : undefined;
    if (!transport) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    await transport.handleRequest(req, res);
  });

  // ── Start ──────────────────────────────────────────────

  const server = app.listen(config.port, () => {
    console.log(`vault-mcp listening on port ${config.port}`);
  });

  function shutdown() {
    console.log("Shutting down...");
    for (const [id, transport] of sessions) {
      transport.close?.();
      sessions.delete(id);
    }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000);
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
