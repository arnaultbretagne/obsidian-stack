import { getConfig } from "./config.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function emit(
  level: LogLevel,
  msg: string,
  data?: Record<string, unknown>,
): void {
  const threshold = getConfig().logLevel as LogLevel;
  if (LEVELS[level] < LEVELS[threshold]) return;

  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...data,
  };

  const out = level === "error" ? console.error : console.log;
  out(JSON.stringify(entry));
}

export const log = {
  debug: (msg: string, data?: Record<string, unknown>) =>
    emit("debug", msg, data),
  info: (msg: string, data?: Record<string, unknown>) =>
    emit("info", msg, data),
  warn: (msg: string, data?: Record<string, unknown>) =>
    emit("warn", msg, data),
  error: (msg: string, data?: Record<string, unknown>) =>
    emit("error", msg, data),
};
