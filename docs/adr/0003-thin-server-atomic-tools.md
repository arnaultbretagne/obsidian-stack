# 0003 — Thin server with atomic tools, intelligence on LLM side

## Status

Accepted

## Context

Designing the MCP tool surface for vault operations. The LLM (Claude) will compose these tools to accomplish complex tasks like enriching notes, managing taxonomy, or synthesizing content. The question is where to put the intelligence — in the server (rich tools with built-in workflows) or in the LLM (atomic tools that the LLM composes).

## Options considered

### Option A — Rich server with smart tools

Frontmatter parsed and exposed as structured JSON. `update_note` with merge/replace modes for frontmatter fields. `enrich_note` meta-tool that calls an LLM API server-side. `rename_tag` that batch-updates all files. Boolean search query language (AND/OR/NOT, field specifiers).

- **Pros:** Fewer tool calls per task. Server handles complexity. Consistent behavior regardless of LLM capability.
- **Cons:** More code to maintain. Server becomes opinionated about vault structure. Frontmatter merge logic is fragile. Batch operations like `rename_tag` are not atomic — a failure mid-way leaves the vault inconsistent. The LLM already knows how to reason about YAML, markdown, and file structure.

### Option B — Thin server, LLM composes

Files read and written as raw text (the LLM sees and manipulates the markdown directly, frontmatter included). `update_note` uses search-and-replace (same pattern as Claude Code's Edit tool). Search is simple substring matching. No batch operations — the LLM loops itself. No frontmatter parsing on write, only on read for discovery tools.

- **Pros:** Minimal server code. Each tool is atomic and reversible. The LLM is the intelligence layer — it already manipulates YAML and markdown natively. Search-and-replace is a pattern the LLM uses hundreds of times per session in Claude Code. No risk of batch operations corrupting the vault.
- **Cons:** More tool calls for complex operations (enrichment = read + reason + update). The LLM must understand vault conventions (frontmatter format, template structure) from tool descriptions. Substring search can produce false positives.

## Decision

Option B — thin server with atomic tools. The server is a filesystem-over-MCP with a write gate. Key design choices:

**Search-and-replace for updates** (like Claude Code's Edit tool): `old_string` must be unique in the file, `new_string` replaces it. The LLM doesn't need to send the full file content to change a tag.

**Two search spaces**: `search_content` (grep in body after frontmatter) and `search_properties` (grep in frontmatter only). This distinction matters because matching "architecture" in a tag vs in the body text has completely different semantics. Both are simple substring matches — no query language.

**`list_properties` for taxonomy discovery**: scans all frontmatters, aggregates property values with counts. Cached in memory with TTL. This is the one place where the server does "smart" work — but it's read-only aggregation, not write logic.

**Write gate** (thin but not stupid): the server validates writes (YAML syntax, `---` delimiters, UTF-8, path safety, type conformance with `.obsidian/types.json`) but never transforms data. It refuses invalid writes with clear error messages so the LLM can self-correct.

**No `rename_tag`**: the LLM does `list_properties` → `search_properties("old_tag")` → loops `update_note` on each file. Each step is atomic and reversible.

**No `list_notes`**: replaced by the two search tools. The LLM doesn't need a flat listing of 300 notes — it searches for what it needs.

**Enrichment via composition**: `read_note` → LLM reasons → `update_note`. No server-side LLM call.

## Consequences

- The server is ~500-800 lines of TypeScript, not thousands. Easy to audit, test, and maintain.
- Complex operations require more tool calls (but each call is fast and predictable).
- The LLM needs good tool descriptions with examples to use tools effectively.
- Path convention follows ecosystem standard: relative to vault root, `.md` extension included, enforced by JSON schema pattern.
- If a tool call fails, the vault is always in a consistent state (no partial batch updates).

## Links

- [Claude Code Edit tool](https://docs.anthropic.com/en/docs/claude-code) — search-and-replace pattern we adopted
- [Piotr1215/mcp-obsidian](https://github.com/Piotr1215/mcp-obsidian) — inspired the filesystem-direct search approach
- [dp-veritas/mcp-obsidian-tools](https://github.com/dp-veritas/mcp-obsidian-tools) — inspired backlinks and tag extraction
- Rhizome (basidiocarp) — cautionary example of tool proliferation (35 tools)
