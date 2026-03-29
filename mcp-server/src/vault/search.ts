import { readFile } from "node:fs/promises";
import path from "node:path";
import { getConfig } from "../config.js";
import { walkMdFiles } from "./paths.js";
import type { SearchResult } from "./types.js";

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

function splitNote(content: string): { frontmatter: string; body: string } {
  const match = content.match(FRONTMATTER_RE);
  if (match) {
    return { frontmatter: match[1], body: match[2] };
  }
  return { frontmatter: "", body: content };
}

export async function searchContent(
  query: string,
  folder?: string,
  limit = 20,
): Promise<SearchResult[]> {
  const { vaultPath } = getConfig();
  const searchDir = folder ? path.join(vaultPath, folder) : vaultPath;
  const results: SearchResult[] = [];
  const queryLower = query.toLowerCase();

  for await (const absPath of walkMdFiles(searchDir)) {
    if (results.length >= limit) break;

    const content = await readFile(absPath, "utf-8");
    const { body } = splitNote(content);
    const bodyLower = body.toLowerCase();
    const idx = bodyLower.indexOf(queryLower);

    if (idx !== -1) {
      const start = Math.max(0, idx - 100);
      const end = Math.min(body.length, idx + query.length + 100);
      results.push({
        path: path.relative(vaultPath, absPath),
        excerpt: body.slice(start, end).trim(),
      });
    }
  }

  return results;
}

export async function searchProperties(
  query: string,
  folder?: string,
  limit = 20,
): Promise<SearchResult[]> {
  const { vaultPath } = getConfig();
  const searchDir = folder ? path.join(vaultPath, folder) : vaultPath;
  const results: SearchResult[] = [];
  const queryLower = query.toLowerCase();

  for await (const absPath of walkMdFiles(searchDir)) {
    if (results.length >= limit) break;

    const content = await readFile(absPath, "utf-8");
    const { frontmatter } = splitNote(content);
    if (!frontmatter) continue;

    if (frontmatter.toLowerCase().includes(queryLower)) {
      results.push({
        path: path.relative(vaultPath, absPath),
        excerpt: frontmatter.trim(),
      });
    }
  }

  return results;
}
