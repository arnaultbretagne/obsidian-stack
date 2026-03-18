import { z } from "zod";
import type { AppConfig } from "./types.js";

const envSchema = z.object({
  VAULT_PATH: z.string().default("/vault"),
  BROWSER_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  JINA_FALLBACK: z.coerce.boolean().default(true),
  JINA_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  PORT: z.coerce.number().int().positive().default(3000),
});

export function loadConfig(): AppConfig {
  const env = envSchema.parse(process.env);
  return {
    vaultPath: env.VAULT_PATH,
    browserTimeoutMs: env.BROWSER_TIMEOUT_MS,
    jinaFallback: env.JINA_FALLBACK,
    jinaTimeoutMs: env.JINA_TIMEOUT_MS,
    logLevel: env.LOG_LEVEL,
    port: env.PORT,
  };
}

let _config: AppConfig | undefined;

export function getConfig(): AppConfig {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}
