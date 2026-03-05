Review proposed tags in the taxonomy.

Step 1 — Read `_taxonomy.yml`, extract `proposed` section.
If empty, report "No proposed tags to review" and stop.

Step 2 — For each proposed tag, show:
- Tag path, count, files using it, first_seen date

Step 3 — For each tag, decide:
- **Accept**: Add to main taxonomy tree. Remove `proposed/` prefix
  from all files in used_in.
- **Merge**: Map to existing tag. Update files to use existing tag.
- **Reject**: Remove `proposed/` tag from files. Don't add to taxonomy.

Step 4 — Clean up proposed section. Set last_reviewed to today.

Step 5 — Report: accepted, merged, rejected counts and details.
