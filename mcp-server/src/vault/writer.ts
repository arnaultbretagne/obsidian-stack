import { writeFile, mkdir, unlink, rename, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { resolveSafePath } from "./paths.js";
import type { ObsidianFieldType } from "./types.js";
import { getConfig } from "../config.js";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/;

// ── Write gate ──────────────────────────────────────────────

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

function validateFieldType(
  key: string,
  value: unknown,
  expectedType: ObsidianFieldType,
): void {
  switch (expectedType) {
    case "text":
      if (typeof value !== "string") {
        throw new Error(
          `Property "${key}" must be text (string), got ${typeof value}`,
        );
      }
      break;
    case "multitext":
    case "tags":
    case "aliases":
      if (!Array.isArray(value)) {
        throw new Error(
          `Property "${key}" must be a list, got ${typeof value}`,
        );
      }
      for (const item of value) {
        if (typeof item !== "string") {
          throw new Error(
            `Property "${key}" list items must be strings, got ${typeof item}`,
          );
        }
      }
      break;
    case "number":
      if (typeof value !== "number") {
        throw new Error(
          `Property "${key}" must be a number, got ${typeof value}`,
        );
      }
      break;
    case "date":
    case "datetime":
      if (typeof value !== "string" || !DATE_RE.test(value)) {
        throw new Error(
          `Property "${key}" must be a date string (YYYY-MM-DD or ISO), got "${value}"`,
        );
      }
      break;
    case "checkbox":
      if (typeof value !== "boolean") {
        throw new Error(
          `Property "${key}" must be a boolean, got ${typeof value}`,
        );
      }
      break;
  }
}

async function validateContent(content: string): Promise<void> {
  // Size check
  const size = Buffer.byteLength(content, "utf-8");
  if (size > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${size} bytes (max ${MAX_FILE_SIZE})`);
  }

  // Frontmatter check
  const fmMatch = content.match(FRONTMATTER_RE);
  if (fmMatch) {
    let parsed: unknown;
    try {
      parsed = parseYaml(fmMatch[1]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Invalid YAML frontmatter: ${msg}`);
    }

    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("Frontmatter must be a YAML mapping");
    }

    // Validate property types against .obsidian/types.json
    const types = await loadTypesJson();
    const fm = parsed as Record<string, unknown>;
    for (const [key, value] of Object.entries(fm)) {
      if (value == null) continue;
      const expectedType = types[key];
      if (expectedType) {
        validateFieldType(key, value, expectedType);
      }
    }
  }
}

// ── CRUD ────────────────────────────────────────────────────

export async function createNote(
  relativePath: string,
  content: string,
): Promise<void> {
  const absPath = resolveSafePath(relativePath);

  // Must not already exist
  try {
    await stat(absPath);
    throw new Error(`File already exists: ${relativePath}`);
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      // Expected — file does not exist
    } else {
      throw err;
    }
  }

  await validateContent(content);
  await mkdir(path.dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf-8");
}

export async function updateNote(
  relativePath: string,
  oldString: string,
  newString: string,
): Promise<void> {
  const absPath = resolveSafePath(relativePath);
  const content = await readFile(absPath, "utf-8");

  const firstIdx = content.indexOf(oldString);
  if (firstIdx === -1) {
    throw new Error("old_string not found in file");
  }
  const secondIdx = content.indexOf(oldString, firstIdx + 1);
  if (secondIdx !== -1) {
    throw new Error(
      "old_string is not unique in file — provide more surrounding context",
    );
  }

  const updated = content.replace(oldString, newString);
  await validateContent(updated);
  await writeFile(absPath, updated, "utf-8");
}

export async function deleteNote(relativePath: string): Promise<void> {
  const absPath = resolveSafePath(relativePath);
  await unlink(absPath);
}

export async function moveNote(
  fromPath: string,
  toPath: string,
): Promise<void> {
  const absFrom = resolveSafePath(fromPath);
  const absTo = resolveSafePath(toPath);

  // Destination must not exist
  try {
    await stat(absTo);
    throw new Error(`Destination already exists: ${toPath}`);
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      // Expected
    } else {
      throw err;
    }
  }

  await mkdir(path.dirname(absTo), { recursive: true });
  await rename(absFrom, absTo);
}
