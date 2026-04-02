import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getMergedSchema } from "../../vault/taxonomy.js";

export function registerListProperties(server: McpServer): void {
  server.registerTool(
    "list_properties",
    {
      description: [
        "List all frontmatter properties in the vault with their schema status.",
        "",
        "Returns a merged view from three sources:",
        "- .obsidian/types.json (Obsidian type declarations)",
        "- .obsidian/mcp-schema.json (curator annotations: descriptions, searchability hints)",
        "- Live vault scan (usage counts, undeclared property discovery)",
        "",
        "Each property has:",
        "- obsidian_type: type from types.json (null = not declared in Obsidian)",
        "- description: curator annotation (null = not yet documented)",
        "- searchable: whether get_property_values is useful for this field (null = not annotated)",
        "- count: number of notes using this property",
        "",
        "Call this first to understand the vault structure, then use get_property_values",
        "to drill into specific properties (prefer those marked searchable).",
      ].join("\n"),
    },
    async () => {
      const schema = await getMergedSchema();
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(schema, null, 2) },
        ],
      };
    },
  );
}
