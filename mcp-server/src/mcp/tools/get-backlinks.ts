import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getBacklinks } from "../../vault/links.js";
import { log } from "../../logger.js";

export function registerGetBacklinks(server: McpServer): void {
  server.registerTool(
    "get_backlinks",
    {
      description: [
        "Find all notes that link to the given note, via wikilinks [[Note]] or Markdown links [text](path.md).",
        "Returns the linking note's path and the line containing the link for context.",
        "",
        "Example: get_backlinks({ path: 'Concepts/Raft.md' })",
      ].join("\n"),
      inputSchema: {
        path: z
          .string()
          .regex(/\.md$/, "Path must end in .md")
          .describe("Relative path of the target note"),
      },
    },
    async ({ path }) => {
      log.debug("get_backlinks", { path });
      const backlinks = await getBacklinks(path);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(backlinks, null, 2) },
        ],
      };
    },
  );
}
