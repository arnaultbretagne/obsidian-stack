import { z } from "zod";

const envSchema = z.object({
  VAULT_PATH: z.string().default("/vault"),
  MCP_PORT: z.coerce.number().int().positive().default(4000),
  MCP_SERVER_URL: z.string().default("https://vault.bretagne.dev"),
  POCKET_ID_ISSUER: z.string().default("https://id.bretagne.dev"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export interface AppConfig {
  vaultPath: string;
  port: number;
  serverUrl: string;
  issuer: string;
  logLevel: string;
}

export function loadConfig(): AppConfig {
  const env = envSchema.parse(process.env);
  return {
    vaultPath: env.VAULT_PATH,
    port: env.MCP_PORT,
    serverUrl: env.MCP_SERVER_URL,
    issuer: env.POCKET_ID_ISSUER,
    logLevel: env.LOG_LEVEL,
  };
}

let _config: AppConfig | undefined;

export function getConfig(): AppConfig {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}
