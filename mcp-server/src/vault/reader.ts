import { readFile, stat } from "node:fs/promises";
import { resolveSafePath } from "./paths.js";
import type { NoteStats } from "./types.js";

export async function readNote(
  relativePath: string,
): Promise<{ content: string; stats: NoteStats }> {
  const absPath = resolveSafePath(relativePath);
  const [content, fileStat] = await Promise.all([
    readFile(absPath, "utf-8"),
    stat(absPath),
  ]);

  return {
    content,
    stats: {
      size: fileStat.size,
      created: fileStat.birthtime.toISOString(),
      modified: fileStat.mtime.toISOString(),
    },
  };
}
