import { readdir } from "node:fs/promises";
import path from "node:path";
import { getConfig } from "../config.js";

export function resolveSafePath(relativePath: string): string {
  const { vaultPath } = getConfig();
  const resolved = path.resolve(vaultPath, relativePath);

  // Must stay inside vault
  if (!resolved.startsWith(vaultPath + path.sep) && resolved !== vaultPath) {
    throw new Error(`Path escapes vault: ${relativePath}`);
  }

  // No dotfolders (e.g. .obsidian, .trash, .git)
  for (const segment of relativePath.split(path.sep)) {
    if (segment.startsWith(".")) {
      throw new Error(`Dotfolder not allowed: ${segment}`);
    }
  }

  // Must be .md
  if (!resolved.endsWith(".md")) {
    throw new Error("Only .md files are allowed");
  }

  return resolved;
}

export async function* walkMdFiles(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkMdFiles(full);
    } else if (entry.name.endsWith(".md")) {
      yield full;
    }
  }
}
