import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getPropertyValues } from "../../vault/taxonomy.js";

export function registerGetPropertyValues(server: McpServer): void {
  server.registerTool(
    "get_property_values",
    {
      description: [
        "List all unique values for a specific frontmatter property, with occurrence counts.",
        "Use this to explore the taxonomy of a field — e.g. what note types exist, what tags are used.",
        "",
        "Start by reading the vault://schema/properties resource to see available properties.",
        "Properties marked searchable=true are good candidates for drill-down.",
        "High-cardinality properties (source, title, description) will return large result sets",
        "that are rarely useful for taxonomy understanding.",
        "",
        "Example: get_property_values({ property: 'type' })",
        "Example: get_property_values({ property: 'tags' })",
      ].join("\n"),
      inputSchema: {
        property: z
          .string()
          .min(1)
          .describe("Name of the frontmatter property to inspect"),
      },
    },
    async ({ property }) => {
      const values = await getPropertyValues(property);
      if (values.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                property,
                error: "No values found — property may not exist in any note",
              }),
            },
          ],
        };
      }
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(values, null, 2) },
        ],
      };
    },
  );
}
