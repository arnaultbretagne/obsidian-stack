# 0009 — Tools over Resources: consistent LLM access across all clients

## Status

Accepted — supersedes [ADR 0006](0006-mcp-resources-for-vault-context.md)

## Context

ADR 0006 introduced MCP Resources for vault context: `vault://schema/properties` for the merged property schema and `vault://template/{name}` for note templates. The design was semantically clean — Resources for read-only context, Tools for actions.

Testing revealed a fundamental problem: **MCP Resources are not autonomously accessible by the LLM on all clients**.

The MCP specification defines Resources as "application-driven" — the host application determines how to incorporate context. In practice:

| Client | LLM can read Resources autonomously? | How Resources are accessed |
|--------|--------------------------------------|---------------------------|
| Claude Code | Yes | Auto-generated list/read tools |
| claude.ai (web) | **No** | User must manually attach via `+` menu |
| Claude mobile | **No** | User must manually attach |

On claude.ai, if the LLM is asked "create a note about X", it cannot discover the vault schema or templates without the user first clicking `+` and manually attaching the schema Resource. The LLM has no way to request a Resource — it can only use what the user injects.

This defeats the purpose. The LLM should behave identically regardless of client. A curator workflow should not require the user to manually attach context every conversation.

## Decision

Drop MCP Resources. Serve all vault context through Tools exclusively.

The merged schema (types.json + mcp-schema.json + live scan) returns as the `list_properties` tool — same data that was in the `vault://schema/properties` Resource, now accessible via a tool call the LLM can make on any client.

Templates remain accessible via `read_note("Templates/X.md")` — no dedicated tool needed.

| Before (ADR 0006) | After |
|-------------------|-------|
| Resource `vault://schema/properties` | Tool `list_properties` (merged schema) |
| Resource `vault://template/{name}` | Tool `read_note("Templates/X.md")` (already existed) |
| Tool `get_property_values` | Tool `get_property_values` (unchanged) |
| Tool `update_schema` | Tool `update_schema` (unchanged) |

The server declares only the `tools` capability.

## Consequences

- The LLM can autonomously discover vault structure on **every** MCP client — claude.ai, Claude Code, Claude mobile, third-party clients.
- No `@` mention or `+` attachment UX for templates/schema. Minor UX loss on Claude Code (where Resources worked well), major consistency gain everywhere else.
- The `resources` directory and capability are removed from the server.
- ADR 0007 (mcp-schema.json overlay) and ADR 0008 (drill-down over dump) are unaffected — only the delivery mechanism changes from Resource to Tool.
- If MCP clients converge on autonomous Resource access in the future, Resources can be re-added alongside the existing Tools with no breaking changes.

## Links

- [MCP Resources specification](https://modelcontextprotocol.io/specification/2025-06-18/server/resources) — "application-driven" means inconsistent across clients
- [Claude Code MCP docs](https://code.claude.com/docs/en/mcp) — Resources work autonomously here, but only here
- [Claude Help Center — custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) — manual `+` attachment required on claude.ai
- ADR 0006 — the superseded decision, preserved for historical context
