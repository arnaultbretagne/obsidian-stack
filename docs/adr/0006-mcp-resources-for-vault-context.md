# 0006 — MCP Resources for vault context (templates and schema)

## Status

Accepted

## Context

The LLM interacts with the vault exclusively through Tools — every piece of context requires a tool call. To understand the vault structure, the LLM must call `list_properties` (153k characters, 51k tokens). To discover templates, it must guess that a `Templates/` folder exists, then `search_properties({ folder: "Templates" })`, then `read_note` each template. This is functional but wasteful: the LLM "detours" action-oriented tools to perform reference lookups.

MCP defines three primitives with distinct semantics:

| Primitive | Controlled by | Semantics |
|-----------|--------------|-----------|
| **Resource** | Client/LLM | Read-only reference data — "here is context" |
| **Tool** | LLM | Side-effect actions — "do something" |
| **Prompt** | User | Workflow templates — "start this flow" |

The server currently uses only Tools. Templates and vault schema are reference data — they fit the Resource primitive. Claude Code automatically provides tools to list and read MCP Resources, so the LLM can fetch them autonomously without user intervention. Users can also inject them via `@` mentions.

## Options considered

### Option A — Keep everything as Tools

Status quo. `list_properties` returns the full taxonomy. `read_note("Templates/Clipping.md")` reads templates.

- **Pros:** Already works. No new primitives to implement.
- **Cons:** `list_properties` returns 153k of mostly useless data (every unique URL, title, description). The LLM must discover templates through search — fragile and not self-documenting. No semantic distinction between "read reference data" and "perform action on vault". The tool surface conflates exploration with mutation.

### Option B — Resources for reference data, Tools for actions

Expose templates and vault schema as MCP Resources. Keep mutation and search operations as Tools.

- **Pros:** Clean separation — Resources are the "what exists" layer, Tools are the "what to do" layer. Templates appear in Claude Code's `@` autocomplete menu. The schema Resource can merge multiple sources (types.json, MCP annotations, live scan) into one coherent view. Resources are read-only by definition — no confusion about side effects.
- **Cons:** Adds a new primitive to the server. Requires clients that support Resources (Claude Code, Claude Desktop, and Claude mobile all do).

## Decision

Option B — Resources for reference data. Two Resources:

**`vault://template/{name}`** — a Resource Template (parameterized URI) that dynamically lists all `.md` files in the vault's `Templates/` folder. Each template is a frontmatter schema that defines expected fields and defaults for a note type. The LLM reads a template to understand what frontmatter to produce when creating a note of that type.

**`vault://schema/properties`** — a static-URI Resource with dynamic content. On each read, the server merges three sources into a single property inventory:

1. `.obsidian/types.json` — Obsidian's type declarations (the `obsidian_type` field)
2. `.obsidian/mcp-schema.json` — curator annotations: descriptions and searchability hints (see ADR 0007)
3. Live vault scan — counts of notes using each property, plus discovery of undeclared properties

The merged result gives the LLM a complete picture of the vault's property landscape in a single read, replacing the old `list_properties` tool.

## Consequences

- `list_properties` is removed as a tool — its role is fully absorbed by the schema Resource. The scan logic moves from tool handler to Resource read callback.
- Templates are discoverable without search — they appear in `resources/list` and in `@` autocomplete.
- The schema Resource is dynamic (re-computed on each read) but the URI is stable. Clients can cache or re-fetch as needed.
- The `resources` capability is added to the server alongside `tools`.
- Future Resources (e.g., vault statistics, MOC indexes) follow the same pattern.

## Links

- [MCP Resources specification (2025-06-18)](https://modelcontextprotocol.io/specification/2025-06-18/server/resources) — Resources are "application-driven", clients determine how to incorporate context
- [Claude Code MCP docs](https://code.claude.com/docs/en/mcp) — "Claude Code automatically provides tools to list and read MCP resources when servers support them"
- ADR 0003 — thin server principle still holds: Resources are read-only aggregation, not intelligence
