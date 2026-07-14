import { z } from "zod";

const envSchema = z.object({
  VAULT_PATH: z.string().default("/vault"),
  MCP_PORT: z.coerce.number().int().positive().default(4000),
  // No defaults: these are deployment-specific (OAuth resource metadata +
  // JWT issuer) — failing fast beats silently pointing at someone else's IdP.
  MCP_SERVER_URL: z.string().url(),
  POCKET_ID_ISSUER: z.string().url(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  // ── Token authorization (audit F-05) ─────────────────────────────────
  // Validating the issuer + signature is not enough: any token minted by the
  // same IdP for a different client would otherwise be accepted (cross-service
  // token confusion). These bind the token to THIS resource.
  //
  // Audience: defaults to MCP_SERVER_URL — which is exactly the RFC 8707
  // `resource` identifier this server advertises in its protected-resource
  // metadata, and the value Pocket-ID binds into `aud` (obsidian-stack ADR
  // 0002). Override (CSV) only if the IdP mints a different audience.
  MCP_ALLOWED_AUDIENCE: z.string().optional(),
  // Optional extra authorization gates — enforced only when set (leave unset to
  // avoid locking out a token shape you haven't confirmed against a real token):
  MCP_ALLOWED_CLIENT_IDS: z.string().optional(), // CSV; the token's client id (client_id/azp, or the client_credentials sub "client-<uuid>") must be one of these. Tokens with no client id (authorization_code) are left to the audience gate.
  MCP_REQUIRED_GROUPS: z.string().optional(), // CSV; token `groups` must include at least one
  MCP_REQUIRED_SCOPES: z.string().optional(), // CSV; token `scope` must include all of these
  // Signature algorithms to accept. Pinned so a token can't downgrade to an
  // unexpected alg. Pocket-ID signs with RS256; override (CSV) if that changes.
  MCP_JWT_ALGS: z.string().default("RS256"),
});

function csv(value: string | undefined): string[] | undefined {
  const parts = value
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts && parts.length > 0 ? parts : undefined;
}

export interface AppConfig {
  vaultPath: string;
  port: number;
  serverUrl: string;
  issuer: string;
  logLevel: string;
  // token authorization policy
  allowedAudiences: string[];
  allowedClientIds?: string[];
  requiredGroups?: string[];
  requiredScopes?: string[];
  jwtAlgorithms: string[];
}

export function loadConfig(): AppConfig {
  const env = envSchema.parse(process.env);
  return {
    vaultPath: env.VAULT_PATH,
    port: env.MCP_PORT,
    serverUrl: env.MCP_SERVER_URL,
    issuer: env.POCKET_ID_ISSUER,
    logLevel: env.LOG_LEVEL,
    allowedAudiences: csv(env.MCP_ALLOWED_AUDIENCE) ?? [env.MCP_SERVER_URL],
    allowedClientIds: csv(env.MCP_ALLOWED_CLIENT_IDS),
    requiredGroups: csv(env.MCP_REQUIRED_GROUPS),
    requiredScopes: csv(env.MCP_REQUIRED_SCOPES),
    jwtAlgorithms: csv(env.MCP_JWT_ALGS) ?? ["RS256"],
  };
}

let _config: AppConfig | undefined;

export function getConfig(): AppConfig {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}
