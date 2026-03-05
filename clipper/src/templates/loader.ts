import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { ClipTemplate } from "../types.js";

const TEMPLATE_FILENAME = "Clipping.md";
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

function parseFrontmatter(raw: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) {
    return { frontmatter: {}, body: raw };
  }

  const [, yamlBlock, body] = match;
  const frontmatter = (parseYaml(yamlBlock) as Record<string, unknown>) ?? {};

  return { frontmatter, body: body.trim() };
}

let cachedTemplate: ClipTemplate | undefined;

export async function loadDefaultTemplate(vaultPath: string): Promise<ClipTemplate> {
  if (cachedTemplate) return cachedTemplate;

  const templatePath = path.join(vaultPath, "Templates", TEMPLATE_FILENAME);
  const raw = await readFile(templatePath, "utf-8");
  const { frontmatter, body } = parseFrontmatter(raw);

  cachedTemplate = {
    name: "default",
    folder: "Clippings",
    fileNameFormat: "{{title}}",
    frontmatter,
    noteContent: body || "{{content}}",
  };

  return cachedTemplate;
}

export async function loadAllTemplates(
  vaultPath: string,
): Promise<Map<string, ClipTemplate>> {
  const templates = new Map<string, ClipTemplate>();
  const defaultTemplate = await loadDefaultTemplate(vaultPath);
  templates.set("default", defaultTemplate);
  return templates;
}
