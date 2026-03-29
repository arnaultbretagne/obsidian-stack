# 0005 — Two search spaces: content vs properties

## Status

Accepted

## Context

The LLM needs to search the vault. A markdown note has two distinct zones: the YAML frontmatter (structured metadata between `---` delimiters) and the body (free-form markdown content). Matching "architecture" in a tag is fundamentally different from matching "architecture" in a paragraph.

## Options considered

### Option A — Single grep across entire file

One `search_notes` tool that does substring match on the whole file (frontmatter + body).

- **Pros:** Simplest implementation. One tool to learn.
- **Cons:** Cannot distinguish metadata matches from content matches. Searching for a tag value also matches body text. A search for "architecture" returns notes tagged "architecture" AND notes that merely mention the word — no way to tell which is which. The LLM loses semantic context about what matched.

### Option B — Query language with field specifiers

One search tool with operators: `tag:architecture`, `title:foo`, `AND`, `OR`, `NOT`. Inspired by Piotr1215's boolean search.

- **Pros:** Expressive. Single tool handles all cases.
- **Cons:** Requires parsing a mini query language server-side (operator precedence, quoting, escaping). More code to maintain. The LLM can achieve the same by making two targeted calls. Adding intelligence to the server contradicts our thin-server principle.

### Option C — Two search tools partitioned by zone

`search_content(query)` greps in the body only (after second `---`). `search_properties(query)` greps in the frontmatter only (between `---` delimiters). Both are simple substring match.

- **Pros:** The LLM explicitly chooses which space to search — "what it is" (properties) vs "what it talks about" (content). Server stays thin — just cuts the file at `---` and greps the right half. No query language. Handles the tag problem: `search_properties("architecture")` matches tags, type, domain fields containing "architecture" without body noise. Even cross-property matches (domain: "architecture" + tags: "architecture") are relevant.
- **Cons:** Two tools instead of one. Cannot do a combined query in a single call (but the LLM can call both in parallel).

## Decision

Option C — two search tools. The server splits each file at the second `---` delimiter and searches in the appropriate zone. Both return matching file paths with excerpts around the match.

This also eliminated the need for `list_notes` (flat vault listing) and `list_tags` (narrow taxonomy view). The LLM discovers the vault through targeted searches in the appropriate zone, plus `list_properties` for the aggregated taxonomy overview.

## Consequences

- The LLM makes two calls when it wants to search both zones. This is fast (both can run in parallel) and more precise than a single mixed-result search.
- Substring matching in frontmatter can match property names as well as values (e.g., searching "tags" matches the key itself). This is acceptable — the excerpts provide context for the LLM to interpret.
- No false positives from body text when searching metadata, and vice versa.
- `list_notes` is dropped — the LLM uses search to navigate rather than listing everything.
- `list_tags` is dropped — replaced by the more general `list_properties` for taxonomy discovery.

## Links

- [Piotr1215/mcp-obsidian](https://github.com/Piotr1215/mcp-obsidian) — boolean search inspiration (not adopted, too complex for thin server)
- [dp-veritas/mcp-obsidian-tools](https://github.com/dp-veritas/mcp-obsidian-tools) — separate tag search and content search tools
