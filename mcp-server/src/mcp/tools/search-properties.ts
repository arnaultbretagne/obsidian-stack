import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { searchProperties } from "../../vault/search.js";
import { log } from "../../logger.js";

export function registerSearchProperties(server: McpServer): void {
  server.registerTool(
    "search_properties",
    {
      description: [
        "Search note frontmatter (YAML properties) for a substring (case-insensitive).",
        "Only searches within the --- delimiters, not the note body.",
        "Use this to find notes by type, tag, author, domain, or any metadata field.",
        "",
        "Returns matching notes with their full frontmatter as excerpt.",
        "",
        "Example: search_properties({ query: 'architecture' }) — finds notes tagged/typed 'architecture'",
        "Example: search_properties({ query: 'paulgraham.com' }) — finds clippings from that domain",
      ].join("\n"),
      inputSchema: {
        query: z.string().min(1).describe("Substring to search in frontmatter"),
        folder: z
          .string()
          .optional()
          .describe("Restrict search to a subfolder"),
        limit: z
          .number()
          .int()
          .positive()
          .max(100)
          .optional()
          .describe("Max results (default 20)"),
      },
    },
    async ({ query, folder, limit }) => {
      log.debug("search_properties", { query, folder });
      const results = await searchProperties(query, folder, limit);
      log.debug("search_properties done", { query, hits: results.length });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(results, null, 2) },
        ],
      };
    },
  );
}
