import { readdir } from "node:fs/promises";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getConfig } from "../../config.js";
import { readNote } from "../../vault/reader.js";

export function registerTemplateResources(server: McpServer): void {
  server.registerResource(
    "vault_template",
    new ResourceTemplate("vault://template/{name}", {
      list: async () => {
        const dir = path.join(getConfig().vaultPath, "Templates");
        let files: string[];
        try {
          files = await readdir(dir);
        } catch {
          return { resources: [] };
        }
        return {
          resources: files
            .filter((f) => f.endsWith(".md"))
            .map((f) => ({
              uri: `vault://template/${f.replace(/\.md$/, "")}`,
              name: f.replace(/\.md$/, ""),
              mimeType: "text/markdown" as const,
            })),
        };
      },
    }),
    {
      description:
        "Vault note templates — frontmatter schemas defining expected fields and defaults for each note type.",
      mimeType: "text/markdown",
    },
    async (uri, { name }) => {
      const { content } = await readNote(`Templates/${name}.md`);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/markdown" as const,
            text: content,
          },
        ],
      };
    },
  );
}
