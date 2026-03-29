import { readFile } from "node:fs/promises";
import path from "node:path";
import { getConfig } from "../config.js";
import { walkMdFiles } from "./paths.js";
import type { BacklinkResult } from "./types.js";

const WIKILINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
const MDLINK_RE = /\[[^\]]*\]\(([^)]+\.md)\)/g;

export async function getBacklinks(
  targetPath: string,
): Promise<BacklinkResult[]> {
  const { vaultPath } = getConfig();
  const targetName = path.basename(targetPath, ".md");
  const targetWithoutExt = targetPath.replace(/\.md$/, "");
  const results: BacklinkResult[] = [];

  for await (const absPath of walkMdFiles(vaultPath)) {
    const relPath = path.relative(vaultPath, absPath);
    if (relPath === targetPath) continue;

    const content = await readFile(absPath, "utf-8");
    const lines = content.split("\n");

    for (const line of lines) {
      let matched = false;

      // Check wikilinks: [[Note Name]] or [[path/Note Name|alias]]
      for (const match of line.matchAll(WIKILINK_RE)) {
        const link = match[1];
        if (
          link === targetName ||
          link === targetPath ||
          link === targetWithoutExt
        ) {
          results.push({ path: relPath, context: line.trim() });
          matched = true;
          break;
        }
      }

      if (matched) continue;

      // Check markdown links: [text](path.md)
      for (const match of line.matchAll(MDLINK_RE)) {
        const linkPath = match[1];
        if (
          linkPath === targetPath ||
          linkPath === `./${targetPath}` ||
          linkPath.endsWith(`/${targetPath}`)
        ) {
          results.push({ path: relPath, context: line.trim() });
          break;
        }
      }
    }
  }

  return results;
}
