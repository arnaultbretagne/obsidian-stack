import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { updateNote } from "../../vault/writer.js";

export function registerUpdateNote(server: McpServer): void {
  server.registerTool(
    "update_note",
    {
      description: [
        "Update a note using search-and-replace. Finds old_string in the file and replaces it with new_string.",
        "old_string MUST be unique in the file — if it appears more than once, provide more surrounding context.",
        "Always read_note first to see the current content before updating.",
        "",
        "Example — update a frontmatter field:",
        '  old_string: \'summary: ""\'',
        "  new_string: 'summary: \"A guide to distributed systems\"'",
        "",
        "Example — replace a paragraph:",
        "  old_string: 'Old paragraph text here'",
        "  new_string: 'New improved paragraph text'",
      ].join("\n"),
      inputSchema: {
        path: z
          .string()
          .regex(/\.md$/, "Path must end in .md")
          .describe("Relative path to the note"),
        old_string: z
          .string()
          .min(1)
          .describe("Exact text to find (must be unique in the file)"),
        new_string: z
          .string()
          .describe("Replacement text"),
      },
    },
    async ({ path, old_string, new_string }) => {
      await updateNote(path, old_string, new_string);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ path, updated: true }) },
        ],
      };
    },
  );
}
