import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { getConfig } from "../config.js";
import { walkMdFiles } from "./paths.js";
import type { PropertyEntry, ObsidianFieldType } from "./types.js";

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;
const CACHE_TTL_MS = 60_000; // 1 minute

// ── types.json ──────────────────────────────────────────────

export async function loadTypesJson(): Promise<
  Record<string, ObsidianFieldType>
> {
  const { vaultPath } = getConfig();
  try {
    const raw = await readFile(
      path.join(vaultPath, ".obsidian/types.json"),
      "utf-8",
    );
    const parsed = JSON.parse(raw);
    return (parsed.types ?? {}) as Record<string, ObsidianFieldType>;
  } catch {
    return {};
  }
}

// ── mcp-schema.json ─────────────────────────────────────────

export interface McpSchemaEntry {
  description?: string;
  searchable?: boolean;
}

export async function loadMcpSchema(): Promise<
  Record<string, McpSchemaEntry>
> {
  const { vaultPath } = getConfig();
  try {
    const raw = await readFile(
      path.join(vaultPath, ".obsidian/mcp-schema.json"),
      "utf-8",
    );
    const parsed = JSON.parse(raw);
    return (parsed.properties ?? {}) as Record<string, McpSchemaEntry>;
  } catch {
    return {};
  }
}

// ── Vault scan ──────────────────────────────────────────────

/** Per-property: how many notes use it, and per-value counts */
interface ScanResult {
  /** Number of notes that have this property at all */
  noteCount: number;
  /** Value → count mapping for drill-down */
  values: Map<string, number>;
}

let scanCache:
  | { data: Map<string, ScanResult>; timestamp: number }
  | undefined;

async function scanVault(): Promise<Map<string, ScanResult>> {
  if (scanCache && Date.now() - scanCache.timestamp < CACHE_TTL_MS) {
    return scanCache.data;
  }

  const { vaultPath } = getConfig();
  const results = new Map<string, ScanResult>();

  function getOrCreate(key: string): ScanResult {
    let entry = results.get(key);
    if (!entry) {
      entry = { noteCount: 0, values: new Map() };
      results.set(key, entry);
    }
    return entry;
  }

  for await (const absPath of walkMdFiles(vaultPath)) {
    const content = await readFile(absPath, "utf-8");
    const match = content.match(FRONTMATTER_RE);
    if (!match) continue;

    let fm: Record<string, unknown>;
    try {
      fm = parseYaml(match[1]) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (!fm || typeof fm !== "object") continue;

    // Track which properties this note has (for noteCount)
    for (const [key, value] of Object.entries(fm)) {
      const entry = getOrCreate(key);
      entry.noteCount++;

      if (Array.isArray(value)) {
        for (const item of value) {
          const str = String(item);
          entry.values.set(str, (entry.values.get(str) ?? 0) + 1);
        }
      } else if (value != null) {
        const str = String(value);
        entry.values.set(str, (entry.values.get(str) ?? 0) + 1);
      }
    }
  }

  scanCache = { data: results, timestamp: Date.now() };
  return results;
}

// ── Merged schema (for the Resource) ────────────────────────

export interface MergedProperty {
  obsidian_type: ObsidianFieldType | null;
  description: string | null;
  searchable: boolean | null;
  count: number;
}

export async function getMergedSchema(): Promise<
  Record<string, MergedProperty>
> {
  const [types, schema, scan] = await Promise.all([
    loadTypesJson(),
    loadMcpSchema(),
    scanVault(),
  ]);

  // Collect all known property names from all three sources
  const allNames = new Set([
    ...Object.keys(types),
    ...Object.keys(schema),
    ...scan.keys(),
  ]);

  const result: Record<string, MergedProperty> = {};
  for (const name of allNames) {
    result[name] = {
      obsidian_type: types[name] ?? null,
      description: schema[name]?.description ?? null,
      searchable: schema[name]?.searchable ?? null,
      count: scan.get(name)?.noteCount ?? 0,
    };
  }

  return result;
}

// ── Property values (for the drill-down tool) ───────────────

export async function getPropertyValues(
  property: string,
): Promise<PropertyEntry[]> {
  const scan = await scanVault();
  const entry = scan.get(property);
  if (!entry) return [];

  return Array.from(entry.values.entries())
    .map(([value, count]): PropertyEntry => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}
