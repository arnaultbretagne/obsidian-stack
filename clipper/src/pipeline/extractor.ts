import { Defuddle } from "defuddle/node";
import type { ExtractedContent } from "../types.js";

export async function extract(html: string, url: string): Promise<ExtractedContent> {
  const result = await Defuddle(html, url, { markdown: false });

  const parsedUrl = new URL(url);

  return {
    title: result.title || parsedUrl.hostname,
    author: result.author || "",
    description: result.description || "",
    domain: parsedUrl.hostname,
    published: result.published || "",
    wordCount: result.wordCount || 0,
    contentHtml: result.content || "",
  };
}
