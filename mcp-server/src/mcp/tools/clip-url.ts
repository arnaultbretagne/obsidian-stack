import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { log } from "../../logger.js";

const CLIPPER_URL = "http://web-clipper:3000/clip";

export function registerClipUrl(server: McpServer): void {
  server.registerTool(
    "clip_url",
    {
      description: [
        "Clip a web page into the vault as a Markdown note via the web-clipper service.",
        "The clipper renders the page (Playwright), extracts content, converts to Markdown,",
        "and writes a .md file with frontmatter in the vault.",
        "",
        "Example: clip_url({ url: 'https://example.com/article', tags: ['research'] })",
      ].join("\n"),
      inputSchema: {
        url: z.string().url().describe("URL of the page to clip"),
        tags: z
          .array(z.string())
          .optional()
          .describe("Additional tags to add to the clipping"),
        folder: z
          .string()
          .optional()
          .describe("Vault subfolder (default: from template, usually 'Clippings')"),
      },
    },
    async ({ url, tags, folder }) => {
      log.info("clip_url", { url, folder });
      const body: Record<string, unknown> = { url };
      if (tags) body.tags = tags;
      if (folder) body.folder = folder;

      const res = await fetch(CLIPPER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        log.error("clip_url failed", { url, status: res.status });
        throw new Error(`Clipper returned ${res.status}: ${err}`);
      }

      const result = (await res.json()) as {
        filePath: string;
        title: string;
        wordCount: number;
      };

      log.info("clip_url done", { url, path: result.filePath, wordCount: result.wordCount });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                path: result.filePath,
                title: result.title,
                wordCount: result.wordCount,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
