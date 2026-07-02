import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createNote } from "../../vault/writer.js";
import { log } from "../../logger.js";

export function registerCreateNote(server: McpServer): void {
  server.registerTool(
    "create_note",
    {
      description: [
        "Create a new Markdown note in the vault.",
        "The content MUST include YAML frontmatter delimited by --- on its own lines.",
        "The path must end in .md and use forward slashes for folders.",
        "",
        "Example:",
        '  path: "Projects/My Project.md"',
        "  content: |",
        "    ---",
        "    title: My Project",
        "    type: project",
        "    tags:",
        "      - engineering",
        "    created: 2025-03-29",
        "    ---",
        "    # My Project",
        "    Content here...",
      ].join("\n"),
      inputSchema: {
        path: z
          .string()
          .regex(/.+\.md$/, "Path must end in .md")
          .describe("Relative path in the vault, e.g. 'Clippings/My Note.md'"),
        content: z
          .string()
          .describe(
            "Full file content including YAML frontmatter between --- delimiters",
          ),
      },
    },
    async ({ path, content }) => {
      log.info("create_note", { path, size: content.length });
      await createNote(path, content);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ path, created: true }) },
        ],
      };
    },
  );
}
