import { getConfig } from "../config.js";
import { loadAllTemplates, loadDefaultTemplate } from "./loader.js";
import type { ClipTemplate } from "../types.js";

let templates: Map<string, ClipTemplate> | undefined;

async function getTemplates(): Promise<Map<string, ClipTemplate>> {
  if (!templates) {
    const config = getConfig();
    templates = await loadAllTemplates(config.vaultPath);
  }
  return templates;
}

export async function resolveTemplate(
  name?: string,
  url?: string,
): Promise<ClipTemplate> {
  const all = await getTemplates();

  // 1. Explicit name
  if (name) {
    const t = all.get(name);
    if (t) return t;
    console.warn(`Template "${name}" not found, falling back to default`);
  }

  // 2. Fallback to default
  return all.get("default") ?? await loadDefaultTemplate(getConfig().vaultPath);
}
