import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getMergedSchema } from "../../vault/taxonomy.js";

export function registerSchemaResource(server: McpServer): void {
  server.registerResource(
    "vault_schema",
    "vault://schema/properties",
    {
      description: [
        "Vault property schema — merged view of Obsidian types, curator annotations, and live usage counts.",
        "",
        "Each property has:",
        "- obsidian_type: the type declared in .obsidian/types.json (null if undeclared)",
        "- description: curator annotation explaining the field's purpose (null if not yet documented)",
        "- searchable: whether get_property_values is recommended for this field (null if not annotated)",
        "- count: number of notes using this property",
        "",
        "Properties with obsidian_type=null exist in note frontmatters but are not declared in Obsidian.",
        "Properties with description=null have not been documented by the curator yet.",
        "Use update_schema to add descriptions and searchability hints.",
      ].join("\n"),
      mimeType: "application/json",
    },
    async () => {
      const schema = await getMergedSchema();
      return {
        contents: [
          {
            uri: "vault://schema/properties",
            mimeType: "application/json" as const,
            text: JSON.stringify(schema, null, 2),
          },
        ],
      };
    },
  );
}
