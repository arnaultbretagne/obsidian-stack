# 0004 — Write gate: validate writes without transforming data

## Status

Accepted

## Context

The MCP server writes to the Obsidian vault on behalf of an LLM. The LLM can make mistakes: invalid YAML frontmatter, wrong field types, path traversal, corrupted encoding. The server needs to prevent vault corruption without imposing structure on the LLM's output.

Obsidian itself validates property types (`.obsidian/types.json` declares that `created` is a date, `tags` is a tags list, etc.) and signals type mismatches in its UI. But it doesn't enforce mandatory fields or reject invalid writes.

## Options considered

### Option A — No validation (pure passthrough)

The server writes whatever the LLM sends. If the YAML is broken, Obsidian will show it as raw text.

- **Pros:** Simplest possible server. Zero opinions.
- **Cons:** A single bad write can corrupt a note's frontmatter, making it invisible to Obsidian's property system. The LLM won't know it made an error.

### Option B — Full schema enforcement

The server parses frontmatter, validates against a schema (required fields, allowed values, type checks), and rejects non-conforming writes.

- **Pros:** Vault stays perfectly clean.
- **Cons:** Requires maintaining a schema beyond what Obsidian provides. `types.json` only declares types, not required fields or allowed values. We'd need a parallel schema — maintenance burden, drift risk.

### Option C — Write gate (thin but not stupid)

The server validates structural integrity and type conformance (using `types.json` as source of truth) but doesn't impose required fields or allowed values. It rejects corruption, accepts imperfection.

- **Pros:** Catches real errors (broken YAML, wrong types, path traversal) without requiring a custom schema. Uses Obsidian's own `types.json` — no parallel maintenance. The LLM gets clear error messages and can self-correct.
- **Cons:** Won't catch semantic errors (wrong tag name, missing summary). But these are the LLM's responsibility.

## Decision

Option C — write gate. Validations on `create_note` and `update_note`:

| Check | Blocking | Source |
|-------|----------|--------|
| YAML frontmatter parsable | Yes | YAML parse |
| `---` delimiters correct | Yes | Regex |
| UTF-8 valid | Yes | Encoding check |
| Path within vault, no dotfolders/`.obsidian` | Yes | Path resolution |
| `.md` extension | Yes | Enforced by JSON schema pattern in tool definition — rejected before handler |
| File size < 5MB | Yes | Guard rail |
| Property types conform to `.obsidian/types.json` | Yes | Read types.json, validate |

No mandatory field enforcement — Obsidian doesn't do it, we don't either. No allowed-value validation — the taxonomy is emergent, not prescribed.

## Consequences

- The vault can have notes with missing fields (e.g., a note without `summary`). This is acceptable — Obsidian handles it the same way.
- The LLM can use `list_properties` to discover existing conventions and follow them voluntarily.
- `types.json` is read at validation time (not cached) so changes in Obsidian are picked up immediately.
- The `.md` extension is enforced at the schema level (JSON Schema `pattern: "\\.md$"`), which means the MCP SDK rejects non-`.md` paths before our code even runs.

## Links

- [Obsidian Properties documentation](https://help.obsidian.md/properties) — types.json behavior
- Sentinel pattern from [Rhizome (matzalazar)](https://github.com/matzalazar/rhizome) — inspiration for idempotent managed sections (not implemented in v1 but considered for future)
