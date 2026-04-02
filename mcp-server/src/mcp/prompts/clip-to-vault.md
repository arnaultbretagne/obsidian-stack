Clip this URL into the vault: {{url}}

Follow these steps in order:

## 1. Duplicate check

Search for an existing note with this source URL: call search_properties({ query: "{{url}}" }).
If a note already exists with this URL in its source field, stop and tell the user.
Show the existing note path and ask whether to update it or skip.

## 2. Clip

If no duplicate, clip the page: call clip_url({ url: "{{url}}" }).
Note the resulting file path. The clipper applies the Clipping template automatically —
the note already has a frontmatter with source, title, type, domain, tags, and created fields.

## 3. Read and understand the clipped note

Read the newly created note with read_note to see its current frontmatter and content.
Understand what the page is about.

## 4. Enrich the frontmatter

The clipped note has a basic frontmatter from the Clipping template. Your job is to
enrich it based on the actual content:

- Call list_properties to understand the vault schema and existing conventions
- Use get_property_values({ property: "type" }) to see what types exist — change type if
  the content warrants it (e.g. a GitHub repo may be better typed as "tool" or "sdk port")
- Use get_property_values({ property: "tags" }) to see existing tags — choose relevant ones
  and add new ones if needed. Prefer existing tags for consistency.
- Fill in the description field with a concise summary of the content
- Fill in entities if notable people, organizations, or tools are mentioned
- Fill in questions if the content raises open questions worth exploring later
- Use update_note with search-and-replace to apply each change

Do NOT replace the entire frontmatter — update fields individually with update_note.

## 5. Report

Tell the user what you did: note path, type chosen, tags applied, and a one-line summary.
