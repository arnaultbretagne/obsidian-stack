import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { updateMcpSchema } from "../../vault/writer.js";
import { getMergedSchema } from "../../vault/taxonomy.js";

export function registerUpdateSchema(server: McpServer): void {
  server.registerTool(
    "update_schema",
    {
      description: [
        "Add or update curator annotations for a vault property in .obsidian/mcp-schema.json.",
        "This does NOT modify Obsidian's types.json — it writes to a separate overlay file.",
        "",
        "Use this to document undeclared properties, add descriptions, or mark properties as searchable.",
        "The property must exist in either types.json or in at least one note's frontmatter.",
        "",
        "Example: update_schema({ property: 'brand', description: 'Brand name for product notes', searchable: false })",
      ].join("\n"),
      inputSchema: {
        property: z
          .string()
          .min(1)
          .describe("Name of the frontmatter property to annotate"),
        description: z
          .string()
          .optional()
          .describe("Human-readable description of the property's purpose"),
        searchable: z
          .boolean()
          .optional()
          .describe(
            "Whether get_property_values is recommended for this property",
          ),
      },
    },
    async ({ property, description, searchable }) => {
      // Verify the property exists somewhere
      const schema = await getMergedSchema();
      if (!schema[property]) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                property,
                error:
                  "Property not found in types.json or any note frontmatter",
              }),
            },
          ],
        };
      }

      if (description === undefined && searchable === undefined) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                property,
                error:
                  "Nothing to update — provide at least one of: description, searchable",
              }),
            },
          ],
        };
      }

      await updateMcpSchema(property, { description, searchable });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ property, updated: true }),
          },
        ],
      };
    },
  );
}
