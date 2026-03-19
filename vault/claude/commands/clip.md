Clip a web page and enrich its front-matter.

URL to clip: $ARGUMENTS

Step 1 — Clip:
Call `POST http://web-clipper:3000/clip` with the URL:

```bash
curl -s -X POST http://web-clipper:3000/clip \
  -H 'Content-Type: application/json' \
  -d '{"url":"<URL>"}'
```

Display the result (title, file path, word count).

Step 2 — Enrich:
If the clip succeeded, enrich the clipped file. Use the file path returned by the clipper as $ARGUMENTS for the instructions below:

!`cat .claude/commands/enrich.md`!
