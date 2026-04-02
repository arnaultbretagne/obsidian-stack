# 0007 — MCP schema overlay: enriching types.json without modifying it

## Status

Accepted

## Context

The vault's property schema comes from `.obsidian/types.json`, managed by Obsidian. It maps property names to types (`text`, `multitext`, `tags`, `date`, `number`). This file is the source of truth for what constitutes a "declared" property.

However, `types.json` has significant limitations for an LLM curator:

1. **No descriptions** — `"type": "text"` tells you nothing about what "type" means or what values are expected.
2. **No usage hints** — the LLM cannot know that `get_property_values("type")` is useful but `get_property_values("source")` returns 200 unique URLs.
3. **No custom metadata** — Obsidian's format is strictly `{ "types": { "field": "type" } }`. The community has [requested extensions](https://forum.obsidian.md/t/expand-types-json-with-display-name-and-suggestion-options/101456) (display names, suggestions, hidden flag) but they are not implemented.
4. **Incomplete inventory** — `types.json` only contains properties where the user manually selected the type. Properties with auto-inferred types (or properties Obsidian has never seen) are absent. For example, `brand` and `rating` exist in candle note frontmatters but are missing from `types.json`.

We need to enrich the schema without touching Obsidian's file.

## Options considered

### Option A — Extend types.json directly

Add custom keys (`description`, `searchable`) alongside Obsidian's type declarations.

- **Pros:** Single file, no sync issue.
- **Cons:** `types.json` belongs to Obsidian. Unknown keys may be silently stripped on updates, or cause errors in future versions. No documentation from Obsidian guarantees forward-compatibility of custom keys. Modifying another application's config file is poor practice.

### Option B — Separate config file in the MCP server

A `vault-schema.json` inside `mcp-server/src/` or the server's config directory.

- **Pros:** Fully controlled, no risk to Obsidian.
- **Cons:** The vault is no longer self-contained ("autoporteur"). The schema that describes the vault lives outside the vault. If you move or clone the vault, the annotations are lost. Breaks the principle that the vault is a portable folder of markdown + config.

### Option C — Overlay file in `.obsidian/`

A sibling file `.obsidian/mcp-schema.json` that contains only curator annotations (descriptions, hints). The MCP server merges it with `types.json` at read time.

- **Pros:** The vault stays self-contained — both files travel with it. Clear ownership: `types.json` is Obsidian's, `mcp-schema.json` is the curator's. No risk of Obsidian modifying or breaking our file (Obsidian does not delete unknown files in `.obsidian/`). The overlay only contains annotations, never type declarations — no duplication, no drift on types. The LLM can write to `mcp-schema.json` to enrich the schema as part of its curator role.
- **Cons:** `.obsidian/` is conventionally Obsidian's space. A second file to maintain. The path requires a dedicated tool since `paths.ts` blocks dotfolder access for note operations.

### Option D — Markdown note in the vault (e.g., `Agent/vault-schema.md`)

Store the schema as a regular note with YAML frontmatter or a code block.

- **Pros:** Accessible via existing `read_note`/`update_note` tools.
- **Cons:** JSON-in-markdown is fragile. Obsidian indexes the note and pollutes search results. Not a natural format for machine-read config.

## Decision

Option C — overlay file at `.obsidian/mcp-schema.json`. The file contains only annotations:

```json
{
  "properties": {
    "type": {
      "description": "Category of the note (tool, article, clipping...)",
      "searchable": true
    },
    "source": {
      "description": "Original URL of the clipped content",
      "searchable": true
    },
    "author": {
      "description": "Author(s) of the original content",
      "searchable": false
    }
  }
}
```

The MCP server merges three sources into the `vault://schema/properties` Resource:

| Source | Provides | Managed by |
|--------|----------|------------|
| `.obsidian/types.json` | `obsidian_type` | Obsidian (auto + manual) |
| `.obsidian/mcp-schema.json` | `description`, `searchable` | LLM curator via `update_schema` tool |
| Live vault scan | `count` (notes using this property) | Computed at read time |

The merge produces three categories of properties, distinguishable by the LLM:

- **Complete** — has `obsidian_type` + `description` + `count`: fully declared and annotated
- **Enriched** — no `obsidian_type`, but has `description`: curator documented it, but it's not yet declared in Obsidian
- **Undeclared** — only `count`: exists in frontmatters but neither Obsidian nor the curator know about it

A new `update_schema` tool allows the LLM to write annotations to `mcp-schema.json`. This tool bypasses `paths.ts` dotfolder restriction since it writes to a specific known file, not arbitrary paths. It validates that the property exists (in `types.json` or observed in the vault) before accepting an annotation.

## Consequences

- `types.json` is never modified by the MCP server. Obsidian retains full ownership.
- The LLM can progressively enrich the schema: first scan reveals undeclared properties, then the curator adds descriptions and searchability hints.
- The overlay file travels with the vault (git, obsidian-sync), maintaining the self-contained principle.
- ADR 0004 (write gate) is unaffected — it still validates against `types.json` for type conformance. `mcp-schema.json` adds context, not constraints.
- Future: the overlay could be extended with additional annotations (e.g., `deprecated`, `see_also`, `allowed_values`) without touching `types.json`.

## Links

- [Obsidian types.json behavior](https://forum.obsidian.md/t/not-all-properties-present-in-types-json/96646) — only contains manually typed properties, not a complete inventory
- [Feature request: expand types.json](https://forum.obsidian.md/t/expand-types-json-with-display-name-and-suggestion-options/101456) — community wants display names and suggestions; not yet implemented
- ADR 0004 — write gate validates against types.json; mcp-schema.json is complementary, not competing
- ADR 0006 — the merged schema is served as the `vault://schema/properties` Resource
