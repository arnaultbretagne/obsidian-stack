import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCreateNote } from "./tools/create-note.js";
import { registerReadNote } from "./tools/read-note.js";
import { registerUpdateNote } from "./tools/update-note.js";
import { registerDeleteNote } from "./tools/delete-note.js";
import { registerMoveNote } from "./tools/move-note.js";
import { registerSearchContent } from "./tools/search-content.js";
import { registerSearchProperties } from "./tools/search-properties.js";
import { registerGetBacklinks } from "./tools/get-backlinks.js";
import { registerGetPropertyValues } from "./tools/get-property-values.js";
import { registerUpdateSchema } from "./tools/update-schema.js";
import { registerClipUrl } from "./tools/clip-url.js";
import { registerTemplateResources } from "./resources/templates.js";
import { registerSchemaResource } from "./resources/schema.js";

const favicon = readFileSync(
  new URL("../assets/favicon.svg", import.meta.url),
  "utf-8",
);

export function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "vault-mcp",
      version: "0.2.0",
      icons: [
        {
          src: `data:image/svg+xml,${encodeURIComponent(favicon)}`,
          mimeType: "image/svg+xml",
          sizes: ["any"],
        },
      ],
    },
    {
      capabilities: { tools: {}, resources: {} },
      instructions: [
        "This MCP server exposes an Obsidian vault via tools and resources.",
        "Start by reading vault://schema/properties to understand the vault's property schema.",
        "Use get_property_values to drill into specific properties (prefer those marked searchable).",
        "Use vault://template/{name} resources to see frontmatter templates for note creation.",
        "Use search_properties to find notes by metadata (type, tags, domain...).",
        "Use search_content to find notes discussing a topic.",
        "Always read_note before update_note to see current content.",
        "Use update_schema to document undeclared properties or add descriptions.",
        "The vault uses YAML frontmatter — respect types.json property types.",
      ].join(" "),
    },
  );

  // Resources
  registerSchemaResource(server);
  registerTemplateResources(server);

  // Tools
  registerCreateNote(server);
  registerReadNote(server);
  registerUpdateNote(server);
  registerDeleteNote(server);
  registerMoveNote(server);
  registerSearchContent(server);
  registerSearchProperties(server);
  registerGetBacklinks(server);
  registerGetPropertyValues(server);
  registerUpdateSchema(server);
  registerClipUrl(server);

  return server;
}
