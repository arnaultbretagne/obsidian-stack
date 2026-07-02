import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { moveNote } from "../../vault/writer.js";
import { log } from "../../logger.js";

export function registerMoveNote(server: McpServer): void {
  server.registerTool(
    "move_note",
    {
      description: [
        "Move or rename a note within the vault.",
        "Creates destination folders automatically if they don't exist.",
        "Does NOT update internal links — the LLM should handle link updates separately if needed.",
        "",
        "Example: move_note({ from_path: 'Inbox/Draft.md', to_path: 'Projects/Final.md' })",
      ].join("\n"),
      inputSchema: {
        from_path: z
          .string()
          .regex(/.+\.md$/, "Path must end in .md")
          .describe("Current path of the note"),
        to_path: z
          .string()
          .regex(/.+\.md$/, "Path must end in .md")
          .describe("New path for the note"),
      },
    },
    async ({ from_path, to_path }) => {
      log.info("move_note", { from_path, to_path });
      await moveNote(from_path, to_path);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ from_path, to_path, moved: true }),
          },
        ],
      };
    },
  );
}
