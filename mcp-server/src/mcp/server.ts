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
import { registerListProperties } from "./tools/list-properties.js";
import { registerClipUrl } from "./tools/clip-url.js";

const favicon = readFileSync(
  new URL("../assets/favicon.svg", import.meta.url),
  "utf-8",
);

export function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "vault-mcp",
      version: "0.1.0",
      icons: [
        {
          src: `data:image/svg+xml,${encodeURIComponent(favicon)}`,
          mimeType: "image/svg+xml",
          sizes: ["any"],
        },
      ],
    },
    {
      capabilities: { tools: {} },
      instructions: [
        "This MCP server exposes an Obsidian vault as composable tools.",
        "Start with list_properties to understand the vault taxonomy.",
        "Use search_properties to find notes by metadata (type, tags, domain...).",
        "Use search_content to find notes discussing a topic.",
        "Always read_note before update_note to see current content.",
        "The vault uses YAML frontmatter — respect types.json property types.",
      ].join(" "),
    },
  );

  registerCreateNote(server);
  registerReadNote(server);
  registerUpdateNote(server);
  registerDeleteNote(server);
  registerMoveNote(server);
  registerSearchContent(server);
  registerSearchProperties(server);
  registerGetBacklinks(server);
  registerListProperties(server);
  registerClipUrl(server);

  return server;
}
