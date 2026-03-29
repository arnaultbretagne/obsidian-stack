import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listProperties } from "../../vault/taxonomy.js";

export function registerListProperties(server: McpServer): void {
  server.registerTool(
    "list_properties",
    {
      description: [
        "List the vault's complete taxonomy: every property defined in .obsidian/types.json,",
        "with all unique values found across notes and their occurrence count.",
        "Call this first to understand the vault structure before searching or creating notes.",
        "",
        "Returns an object where each key is a property name (e.g. 'type', 'tags', 'domain')",
        "and each value is an array of { value, count } sorted by frequency.",
        "",
        "Results are cached for 60 seconds.",
      ].join("\n"),
    },
    async () => {
      const properties = await listProperties();
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(properties, null, 2) },
        ],
      };
    },
  );
}
