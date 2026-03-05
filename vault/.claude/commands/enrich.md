Read the markdown file at $ARGUMENTS.
Parse its YAML front-matter and body content.

Step 1 — Load taxonomy:
Read `_taxonomy.yml` at the vault root.
Flatten the taxonomy tree into valid tag paths (e.g. `ai/llm/rag`).
Skip `_description` keys. Note existing `proposed` entries.

Step 2 — Classify:
If `type` is "clipping", classify into one of:
article, reference, opinion, tutorial, bookmark, note, spec, log.
Update `type`.

Step 3 — Fill empty fields:
For each front-matter field that is empty, missing, or placeholder:

- **title**: Clear, descriptive title. Not the raw HTML <title>.
- **summary**: 1-2 discriminating sentences. What makes THIS document
  unique? Include specific claims, numbers, conclusions.
  NOT a generic topic description.
- **description**: Brief neutral description of the content (1 sentence).
- **questions**: 3-5 questions this document answers. Phrase as someone
  would search. Include non-obvious questions.
- **author**: Extract author names. Format as [[Name]] wikilinks.
- **entities**: Key people, projects, technologies, organizations.
  Proper nouns only.
- **tags**: 3-8 tags from the taxonomy. Use most specific match.
  If no tag fits, use `proposed/path/to/tag`.

Step 4 — Update taxonomy proposals:
If any `proposed/` tags were used, append to `_taxonomy.yml`
proposed section with first_seen (today), used_in (this file path),
count (1). If already proposed, increment count and append to used_in.

Step 5 — Write:
Edit the front-matter in place. Do NOT modify body content.
Do NOT change fields that already have values.
