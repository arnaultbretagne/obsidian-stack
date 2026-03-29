import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { getConfig } from "../config.js";
import { walkMdFiles } from "./paths.js";
import type { PropertyEntry, PropertyMap, ObsidianFieldType } from "./types.js";

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;
const CACHE_TTL_MS = 60_000; // 1 minute

let cache: { data: PropertyMap; timestamp: number } | undefined;

async function loadTypesJson(): Promise<Record<string, ObsidianFieldType>> {
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

async function scanProperties(): Promise<PropertyMap> {
  const { vaultPath } = getConfig();
  const types = await loadTypesJson();
  const propertyNames = Object.keys(types);
  const counters = new Map<string, Map<string, number>>();

  for (const name of propertyNames) {
    counters.set(name, new Map());
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

    for (const [key, value] of Object.entries(fm)) {
      const counter = counters.get(key);
      if (!counter) continue;

      if (Array.isArray(value)) {
        for (const item of value) {
          const str = String(item);
          counter.set(str, (counter.get(str) ?? 0) + 1);
        }
      } else if (value != null) {
        const str = String(value);
        counter.set(str, (counter.get(str) ?? 0) + 1);
      }
    }
  }

  const result: PropertyMap = {};
  for (const [name, counter] of counters) {
    result[name] = Array.from(counter.entries())
      .map(([value, count]): PropertyEntry => ({ value, count }))
      .sort((a, b) => b.count - a.count);
  }

  return result;
}

export async function listProperties(): Promise<PropertyMap> {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return cache.data;
  }

  const data = await scanProperties();
  cache = { data, timestamp: Date.now() };
  return data;
}
