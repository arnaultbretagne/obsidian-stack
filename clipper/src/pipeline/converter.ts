import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import type { ExtractedContent, ConvertedContent } from "../types.js";

let turndown: TurndownService | undefined;

function getTurndown(): TurndownService {
  if (!turndown) {
    turndown = new TurndownService({
      headingStyle: "atx",
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
      emDelimiter: "*",
    });
    turndown.use(gfm);
  }
  return turndown;
}

function resolveUrls(html: string, baseUrl: string): string {
  return html.replace(
    /(href|src|srcset)(=)(["'])([^"']*?)\3/gi,
    (match, attr, eq, quote, url) => {
      if (attr.toLowerCase() === "srcset") return match;
      try {
        const resolved = new URL(url, baseUrl).href;
        return `${attr}${eq}${quote}${resolved}${quote}`;
      } catch {
        return match;
      }
    },
  );
}

export function convert(
  extracted: ExtractedContent,
  baseUrl?: string,
): ConvertedContent {
  const td = getTurndown();
  const html = baseUrl
    ? resolveUrls(extracted.contentHtml, baseUrl)
    : extracted.contentHtml;
  const contentMarkdown = td.turndown(html);

  return {
    ...extracted,
    contentMarkdown,
  };
}
