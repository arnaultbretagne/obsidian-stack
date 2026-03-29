import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readNote } from "../../vault/reader.js";

export function registerReadNote(server: McpServer): void {
  server.registerTool(
    "read_note",
    {
      description: [
        "Read a Markdown note from the vault. Returns raw file content and file stats.",
        "Use this to inspect a note's frontmatter and body before making changes.",
        "",
        "Example: read_note({ path: 'Clippings/My Article.md' })",
      ].join("\n"),
      inputSchema: {
        path: z
          .string()
          .regex(/\.md$/, "Path must end in .md")
          .describe("Relative path in the vault"),
      },
    },
    async ({ path }) => {
      const { content, stats } = await readNote(path);
      return {
        content: [
          { type: "text" as const, text: content },
          { type: "text" as const, text: JSON.stringify({ stats }) },
        ],
      };
    },
  );
}
