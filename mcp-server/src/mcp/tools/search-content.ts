import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { searchContent } from "../../vault/search.js";
import { log } from "../../logger.js";

export function registerSearchContent(server: McpServer): void {
  server.registerTool(
    "search_content",
    {
      description: [
        "Search note bodies for a substring (case-insensitive). Only searches content AFTER the frontmatter.",
        "Use this to find notes that discuss a topic. For searching metadata (tags, type, etc.), use search_properties instead.",
        "",
        "Returns matching notes with an excerpt showing surrounding context.",
        "",
        "Example: search_content({ query: 'distributed consensus' })",
        "Example: search_content({ query: 'React hooks', folder: 'Projects' })",
      ].join("\n"),
      inputSchema: {
        query: z.string().min(1).describe("Substring to search for"),
        folder: z
          .string()
          .optional()
          .describe("Restrict search to a subfolder (e.g. 'Clippings')"),
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
      log.debug("search_content", { query, folder });
      const results = await searchContent(query, folder, limit);
      log.debug("search_content done", { query, hits: results.length });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(results, null, 2) },
        ],
      };
    },
  );
}
