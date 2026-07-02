import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { deleteNote } from "../../vault/writer.js";
import { log } from "../../logger.js";

export function registerDeleteNote(server: McpServer): void {
  server.registerTool(
    "delete_note",
    {
      description:
        "Delete a Markdown note from the vault. This is irreversible — the file is removed from disk.",
      inputSchema: {
        path: z
          .string()
          .regex(/.+\.md$/, "Path must end in .md")
          .describe("Relative path to the note to delete"),
      },
      annotations: {
        destructiveHint: true,
      },
    },
    async ({ path }) => {
      log.warn("delete_note", { path });
      await deleteNote(path);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ path, deleted: true }) },
        ],
      };
    },
  );
}
