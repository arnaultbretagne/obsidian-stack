# 0001 — Filesystem direct over Obsidian REST API

## Status

Accepted

## Context

The MCP server needs to access the Obsidian vault (read/write notes, search content). The vault is already synchronized by obsidian-sync in a shared Docker volume (`/vault`). The server runs headless on a VPS — there is no Obsidian desktop app running.

Two approaches exist in the ecosystem for vault access.

## Options considered

### Option A — Obsidian Local REST API plugin

Most existing MCP servers (cyanheads, MarkusPfundstein, fazer-ai, labeveryday, ToKiDoO — 6 out of 10 analyzed) use the Obsidian Local REST API community plugin as their backend. This plugin exposes HTTP endpoints for CRUD operations, search (including Dataview DQL and JsonLogic), and Obsidian commands.

- **Pros:** Source of truth is Obsidian itself, access to Dataview queries, can trigger UI commands, well-tested by multiple MCP server implementations.
- **Cons:** Requires the Obsidian desktop app to be running with the plugin installed. This is a community plugin maintained by a single person — a fragile dependency. Incompatible with our headless VPS setup (no Obsidian app, just obsidian-sync). Adds HTTP latency between the MCP server and the vault.

### Option B — Direct filesystem access

Some servers (Piotr1215, dp-veritas, tcsavage) read and write `.md` files directly. The vault is just a folder of markdown files.

- **Pros:** Zero external dependencies, works without Obsidian running, fastest possible access (no HTTP hop), simple to implement and debug. Matches our existing architecture where the web-clipper already writes directly to the vault volume.
- **Cons:** No access to Obsidian-specific features (Dataview, commands, UI). Risk of write conflicts with obsidian-sync writing to the same volume — mitigated by the fact that `.md` files are independent (no shared database) and `writeFile` is effectively atomic for small files.

### Option C — CouchDB via Obsidian Livesync

yamos is the only MCP server using CouchDB + Livesync as backend, replacing Obsidian Sync entirely.

- **Pros:** Remote-native, chunk-aware sync, distributed architecture.
- **Cons:** Requires replacing our entire sync infrastructure (obsidian-sync) with CouchDB + Livesync. Massive overhead for a single additional access path.

## Decision

Option B — direct filesystem access. The vault is already mounted as a shared Docker volume. The web-clipper already uses this pattern successfully. There is no Obsidian desktop app to provide a REST API, and adding one would be contradictory to the headless architecture. The MCP server joins the compose as a peer service with the same volume mount.

## Consequences

- The MCP server cannot use Dataview queries, Obsidian commands, or any plugin-specific features. All querying is done by scanning files directly.
- Write conflicts with obsidian-sync are theoretically possible but negligible in practice for a single-user vault with independent `.md` files.
- The server is simpler and has fewer dependencies than REST API-based alternatives.
- If Obsidian adds server-side API capabilities in the future, this decision can be revisited.

## Links

- [Piotr1215/mcp-obsidian](https://github.com/Piotr1215/mcp-obsidian) — filesystem-direct reference implementation with excellent search
- [dp-veritas/mcp-obsidian-tools](https://github.com/dp-veritas/mcp-obsidian-tools) — filesystem-direct with backlinks and tag extraction
- [cyanheads/obsidian-mcp-server](https://github.com/cyanheads/obsidian-mcp-server) — REST API-based reference (not chosen)
- Existing clipper `clipper/src/pipeline/writer.ts` — proves the direct write pattern works in this stack
