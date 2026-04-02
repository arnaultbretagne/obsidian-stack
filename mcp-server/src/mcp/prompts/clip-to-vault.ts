import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerClipToVault(server: McpServer): void {
  server.registerPrompt(
    "clip-to-vault",
    {
      title: "Clip URL to vault",
      description:
        "Clip a web page into the vault: check for duplicates, clip, choose the right template, and enrich the frontmatter.",
      argsSchema: {
        url: z.string().url().describe("URL of the page to clip"),
      },
    },
    async ({ url }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Clip this URL into the vault: ${url}`,
              "",
              "Follow these steps in order:",
              "",
              "## 1. Duplicate check",
              `Search for an existing note with this source URL: call search_properties({ query: "${url}" }).`,
              "If a note already exists with this URL in its source field, stop and tell the user.",
              "Show the existing note path and ask whether to update it or skip.",
              "",
              "## 2. Clip",
              `If no duplicate, clip the page: call clip_url({ url: "${url}" }).`,
              "Note the resulting file path.",
              "",
              "## 3. Read the clipped note",
              "Read the newly created note with read_note to see its current frontmatter and content.",
              "",
              "## 4. Choose the right template",
              "Call list_properties to understand the vault taxonomy.",
              "Read the available templates in Templates/ (e.g. read_note for Clipping.md, Github.md, agent_orchestration.md, Note.md).",
              "Based on the clipped content, decide which template's frontmatter schema best fits.",
              "Consider the URL domain, content type, and existing vault conventions.",
              "",
              "## 5. Enrich the frontmatter",
              "Update the note's frontmatter to match the chosen template's schema:",
              "- Fill in all fields from the template with values extracted from the content",
              "- Write a concise description summarizing the content",
              "- Choose appropriate tags based on existing vault tags (use get_property_values({ property: 'tags' }) to see what exists)",
              "- Choose the right type (use get_property_values({ property: 'type' }) to see conventions)",
              "- Fill domain, author, entities, questions if relevant",
              "- Use update_note with search-and-replace to apply the changes",
              "",
              "## 6. Report",
              "Tell the user what you did: note path, template chosen, and a brief summary of the enriched metadata.",
            ].join("\n"),
          },
        },
      ],
    }),
  );
}
