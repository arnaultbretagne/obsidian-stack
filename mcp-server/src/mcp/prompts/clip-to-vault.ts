import { readFileSync } from "node:fs";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const template = readFileSync(
  new URL("./clip-to-vault.md", import.meta.url),
  "utf-8",
);

export function registerClipToVault(server: McpServer): void {
  server.registerPrompt(
    "clip-to-vault",
    {
      title: "Clip URL to vault",
      description:
        "Clip a web page into the vault: check for duplicates, clip, and enrich the frontmatter.",
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
            text: template.replaceAll("{{url}}", url),
          },
        },
      ],
    }),
  );
}
