# 0008 — Taxonomy drill-down over full dump

## Status

Accepted — supersedes `list_properties` tool from ADR 0003

## Context

The `list_properties` tool was designed as the LLM's entry point to understand the vault's taxonomy. It scans every note's frontmatter, aggregates all property values with counts, and returns the full result. In practice, the response is 153k characters (51k tokens) because it enumerates every unique value for every property — including 204 unique URLs in `source`, 166 unique authors, 155 unique descriptions, and 124 unique titles. Most of this data is noise: knowing every URL ever clipped does not help the LLM create the next note.

The useful taxonomy signal is concentrated in low-cardinality properties: `type` (28 values), `domain` (6), `tags` (273), `entities` (26). High-cardinality properties like `source`, `title`, `description` are essentially unique per note — listing their values is listing the vault's content, not its structure.

Furthermore, `list_properties` mixes two concerns:
1. **Property inventory** — what fields exist, what are they for (now served by the `vault://schema/properties` Resource per ADR 0006/0007)
2. **Value enumeration** — what values does a specific field take (the drill-down)

## Options considered

### Option A — Filter high-cardinality properties from list_properties

Add a threshold: if a property has more than N unique values relative to note count, skip it.

- **Pros:** Simple heuristic, reduces output.
- **Cons:** Arbitrary threshold. What about `tags` at 273 values — is that high cardinality? The LLM might need it. Silently omitting data is surprising. Doesn't solve the dual-concern problem.

### Option B — Add a `property` parameter to list_properties

`list_properties()` returns all values for all properties (current behavior). `list_properties({ property: "type" })` returns values for one property.

- **Pros:** Backward-compatible, flexible.
- **Cons:** One tool with two behaviors depending on whether an argument is passed. Ambiguous contract — the LLM may call it without arguments out of habit and still get 153k. The "list everything" mode has no valid use case once the schema Resource exists.

### Option C — Replace with a dedicated drill-down tool

Remove `list_properties` as a tool. The property inventory is now served by the `vault://schema/properties` Resource. Add `get_property_values({ property })` as a focused tool that returns values and counts for a single property.

The Resource tells the LLM what properties exist and whether they're worth drilling into (`searchable` hint). The tool lets it explore specific properties when needed.

- **Pros:** Clean separation: Resource for overview, Tool for drill-down. No more 153k dumps. Each tool call returns focused, useful data. The `searchable` hint in the schema guides the LLM away from high-cardinality properties without hard-blocking them. Two distinct contracts instead of one overloaded tool.
- **Cons:** Two primitives instead of one (but they serve different purposes). The LLM must read the Resource first to know which properties exist — this is the intended flow.

## Decision

Option C — drill-down tool. The `list_properties` tool is removed. Its scan logic is reused internally by the schema Resource (for counts and undeclared property discovery). A new `get_property_values` tool is added:

```
get_property_values({ property: "type" })
→ [{ value: "tool", count: 15 }, { value: "article", count: 7 }, ...]

get_property_values({ property: "tags" })
→ [{ value: "agent-orchestration", count: 53 }, { value: "clippings", count: 29 }, ...]
```

The tool description advises the LLM that high-cardinality properties (like `source`, `title`) will return large result sets that are rarely useful for taxonomy understanding. The `searchable` flag in the schema Resource reinforces this guidance. But the LLM is not prevented from drilling into any property — it might have a valid reason (e.g., checking for duplicate sources before clipping).

## Consequences

- The 153k full-dump response is eliminated. A `get_property_values("type")` call returns ~1k.
- The LLM's typical flow becomes: read `vault://schema/properties` → understand fields → drill into relevant ones with `get_property_values`.
- `searchable: true` in the schema is advisory — the tool accepts any property name. The LLM uses its judgment.
- The scan-all-frontmatters logic in `taxonomy.ts` is retained and reused by both the schema Resource (for counts) and the drill-down tool (for values). Caching still applies.
- ADR 0005 is unaffected — `search_properties` and `search_content` remain for finding specific notes. `get_property_values` is for understanding what values exist, not for finding notes.

## Links

- ADR 0003 — thin server principle: `list_properties` was the one "smart" aggregation. It now splits into a Resource (read-only aggregation) and a focused tool (targeted query) — still thin, more precise.
- ADR 0006 — the schema Resource replaces the inventory role of `list_properties`
- ADR 0007 — the overlay provides `searchable` hints that guide drill-down usage
