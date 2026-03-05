import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import dayjs from "dayjs";
import { getConfig } from "../config.js";
import type {
  ClipOptions,
  ConvertedContent,
  ClipTemplate,
} from "../types.js";

function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function interpolate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

function buildVariables(
  content: ConvertedContent,
  options: ClipOptions,
): Record<string, string> {
  return {
    title: content.title,
    author: content.author,
    url: options.url,
    domain: content.domain,
    published: content.published,
    date: dayjs().format("YYYY-MM-DD"),
    datetime: dayjs().format("YYYY-MM-DDTHH:mm:ss"),
    content: content.contentMarkdown,
    description: content.description,
    tags: (options.tags ?? []).map((t) => `"${t}"`).join(", "),
    note: options.note ?? "",
    wordCount: String(content.wordCount),
  };
}

function buildFrontmatter(
  template: ClipTemplate,
  vars: Record<string, string>,
  extraTags?: string[],
): string {
  const lines: string[] = ["---"];

  for (const [key, rawValue] of Object.entries(template.frontmatter)) {
    const value =
      typeof rawValue === "string" ? interpolate(rawValue, vars) : rawValue;
    if (key === "tags" && extraTags?.length) {
      const baseTags = Array.isArray(value) ? value : [];
      const allTags = [...baseTags, ...extraTags];
      lines.push(`tags: [${allTags.map((t) => `"${t}"`).join(", ")}]`);
    } else if (typeof value === "string") {
      lines.push(`${key}: "${value}"`);
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }

  // Add tags if not already in template frontmatter
  if (extraTags?.length && !("tags" in template.frontmatter)) {
    lines.push(`tags: [${extraTags.map((t) => `"${t}"`).join(", ")}]`);
  }

  lines.push("---");
  return lines.join("\n");
}

export async function write(
  content: ConvertedContent,
  template: ClipTemplate,
  options: ClipOptions,
): Promise<string> {
  const config = getConfig();
  const vars = buildVariables(content, options);

  // Resolve folder
  const folder = options.folder ?? template.folder ?? "Clippings";

  // Resolve filename
  const rawName = interpolate(template.fileNameFormat, vars) || content.title;
  const fileName = sanitizeFilename(rawName) + ".md";

  // Build full path
  const dirPath = path.join(config.vaultPath, folder);
  const filePath = path.join(dirPath, fileName);

  // Build content
  const frontmatter = buildFrontmatter(
    template,
    vars,
    options.tags,
  );
  const body = interpolate(template.noteContent, vars);
  const fullContent = `${frontmatter}\n${body}\n`;

  if (options.dryRun) {
    console.log(fullContent);
    return path.join(folder, fileName);
  }

  await mkdir(dirPath, { recursive: true });
  await writeFile(filePath, fullContent, "utf-8");

  return path.join(folder, fileName);
}
