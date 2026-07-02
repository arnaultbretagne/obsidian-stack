# obsidian-stack

Headless Obsidian vault automation: a sync service, a web clipper, and a remote
MCP server — three containers sharing one vault directory, so LLM clients
(Claude.ai, Claude Desktop, Claude Code) can read, write, search, and clip web
pages into an Obsidian vault that stays synchronized with every device.

```
Claude.ai / Claude Desktop / Claude Code
        │
        │  OAuth 2.1 (Authorization Code + PKCE)
        ▼
┌───────────────┐   POST /clip   ┌──────────────────────────┐
│  mcp-server   ├───────────────►│  web-clipper (:3000)     │
│    :4000      │                │  Playwright → Defuddle   │
│  12 tools     │                │  → Turndown → .md        │
└───────┬───────┘                └────────────┬─────────────┘
        │  direct fs                          │  writes .md
   ┌────▼──────────────────────────────────── ▼───┐
   │                 /vault                       │
   └────▲─────────────────────────────────────────┘
        │  continuous two-way sync
┌───────┴───────┐
│ obsidian-sync │ ◄──► Obsidian Sync servers ◄──► your devices
└───────────────┘
```

| Component | What it does | Image |
|---|---|---|
| [`sync/`](sync/) | Headless Obsidian running the official Sync plugin — keeps `/vault` in continuous two-way sync with all enrolled devices | `ghcr.io/arnaultbretagne/obsidian-sync` |
| [`clipper/`](clipper/) | HTTP service (and CLI) that renders a web page with Playwright, extracts the content, and writes it into the vault as Markdown | `ghcr.io/arnaultbretagne/obsidian-clipper` |
| [`mcp-server/`](mcp-server/) | Remote MCP server (Streamable HTTP + OAuth 2.1) exposing the vault as composable tools | `ghcr.io/arnaultbretagne/obsidian-mcp` |

The `.md` file is the interface between components: the clipper extracts,
the LLM enriches (summary, tags, taxonomy) by editing the file through MCP
tools, and sync propagates the result everywhere. Architectural decisions are
documented in [`docs/adr/`](docs/adr/).

## MCP server

Remote MCP server accessible over Streamable HTTP. Authentication is
OAuth 2.1 (Authorization Code + PKCE) against any OIDC provider: the server
is a pure resource server — it advertises RFC 9728 protected-resource
metadata (`/.well-known/oauth-protected-resource`) and validates JWTs against
the issuer's JWKS. No client secret, no session state.

### Tools (12)

| Tool | Description |
|---|---|
| `create_note` | Create a `.md` note with YAML frontmatter |
| `read_note` | Read raw content + stats |
| `update_note` | Search-and-replace edit (`old_string` must be unique) |
| `delete_note` | Delete a note |
| `move_note` | Move/rename a note |
| `search_content` | Grep note bodies (frontmatter excluded) |
| `search_properties` | Grep frontmatter only |
| `get_backlinks` | Find notes linking to a note |
| `list_properties` | Full taxonomy: properties + values + counts |
| `get_property_values` | All unique values of one property, with counts |
| `update_schema` | Curator annotations overlay (`.obsidian/mcp-schema.json`) — never touches Obsidian's own `types.json` |
| `clip_url` | Clip a URL via the internal web-clipper service |

One MCP prompt ships with the server: [`clip-to-vault`](mcp-server/src/mcp/prompts/clip-to-vault.md)
(duplicate check → clip → enrich workflow).

### Write gate

The server validates writes without transforming them:

- YAML frontmatter must parse, with `---` delimiters
- Property types must conform to `.obsidian/types.json`
- Path must stay inside the vault: no dotfolders, `.md` extension required
- Size < 5 MB, valid UTF-8

### Service contract

`clip_url` calls the clipper at the **hardcoded** URL `http://web-clipper:3000/clip`
([`clip-url.ts`](mcp-server/src/mcp/tools/clip-url.ts)) — whatever runs these
containers must make the clipper resolvable under the DNS name `web-clipper`
(the compose service and the Kubernetes Service are both named accordingly).

## Web clipper

Pipeline: Playwright (Chromium, `--no-sandbox`) renders the page → Defuddle
extracts the main content → Turndown converts to Markdown → the note is
written into the vault using the template.

### HTTP API

| Route | Description |
|---|---|
| `GET /health` | `{"status":"ok"}` |
| `GET /templates` | The template loaded from the vault |
| `POST /clip` | Clip a page |

```bash
curl -X POST http://web-clipper:3000/clip \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://example.com/article",
    "tags": ["ai", "research"],
    "folder": "Clippings/Articles",
    "dryRun": false
  }'
# → {"filePath":"Clippings/Articles/Example Article.md","title":"Example Article","wordCount":1234,"processingTimeMs":3200}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `url` | string | yes | Page to clip |
| `template` | string | no | Template name (default `default`) |
| `tags` | string[] | no | Extra tags |
| `folder` | string | no | Vault subfolder (overrides template) |
| `note` | string | no | Note to attach |
| `dryRun` | boolean | no | Preview without writing |

### CLI mode

The same container runs one-shot clips with `MODE=cli`:

```bash
docker compose run --rm -e MODE=cli web-clipper https://example.com/article
docker compose run --rm -e MODE=cli web-clipper https://example.com --tags ai,research
docker compose run --rm -e MODE=cli web-clipper https://example.com --folder "Articles" --dry-run
```

```
clip <url> [options]
  -t, --template <name>   Template (default: "default")
  --tags <tag1,tag2>      Extra tags
  --folder <path>         Vault subfolder (overrides template)
  --note <text>           Note to attach
  --dry-run               Print the Markdown without writing
  --verbose               Detailed logging
```

### Template

Clippings are shaped by a single Markdown template read from
`vault/Templates/Clipping.md` — it lives **in the vault**, so it can be edited
from Obsidian on any device:

```markdown
---
source: "{{url}}"
title: "{{title}}"
author: "{{author}}"
created: "{{date}}"
tags: [clippings]
---
{{content}}
```

Available variables: `{{title}}`, `{{author}}`, `{{url}}`, `{{domain}}`,
`{{date}}`, `{{datetime}}`, `{{published}}`, `{{content}}`, `{{description}}`,
`{{tags}}`, `{{note}}`, `{{wordCount}}`.

## Sync

`obsidian-sync` wraps [obsidian-headless](https://www.npmjs.com/package/obsidian-headless)
(`ob`) to run the official Obsidian Sync plugin without a desktop app. Session
state (auth token + device identity) lives in the `obsidian-headless` config
directory — persist it, or the container waits idle until you configure it:

```bash
# one-time bootstrap, inside the container
ob sync-setup --vault "$VAULT_NAME" --path /vault
```

After that, the entrypoint runs `ob sync --path /vault --continuous` with a
retry loop.

## Configuration

| Variable | Component | Default | Description |
|---|---|---|---|
| `OBSIDIAN_AUTH_TOKEN` | sync | — | Token from `ob login` (only needed for first-time setup; the session persists in the config dir) |
| `VAULT_NAME` | sync | — | Vault name in Obsidian Sync (first-time setup) |
| `BROWSER_TIMEOUT_MS` | clipper | `30000` | Playwright timeout |
| `PORT` | clipper | `3000` | HTTP port |
| `MODE` | clipper | `cli` | `server` or `cli` |
| `VAULT_PATH` | clipper, mcp | `/vault` | Vault mount point |
| `MCP_PORT` | mcp | `4000` | HTTP port |
| `MCP_SERVER_URL` | mcp | — | Public URL of the MCP server (OAuth resource metadata) |
| `POCKET_ID_ISSUER` | mcp | — | OIDC issuer used for JWT validation |
| `LOG_LEVEL` | all | `info` | `debug`, `info`, `warn`, `error` |

## Images & CI

Every push to `main` and every `v*` tag builds the three images via GitHub
Actions ([`build.yml`](.github/workflows/build.yml)) and publishes them to
GHCR (public):

```
ghcr.io/arnaultbretagne/obsidian-sync:{semver|sha-<commit>|latest}
ghcr.io/arnaultbretagne/obsidian-clipper:{semver|sha-<commit>|latest}
ghcr.io/arnaultbretagne/obsidian-mcp:{semver|sha-<commit>|latest}
```

## Local development

`docker-compose.yml` is a **local development harness** — it builds the three
images from source and wires them to a local `./vault` directory:

```bash
cp .env.example .env      # fill in what you need
docker compose up -d --build
curl http://localhost:3000/health
```

Per-component, without containers:

```bash
cd clipper && npm install
VAULT_PATH=../vault npx tsx src/cli.ts https://example.com --dry-run   # CLI
VAULT_PATH=../vault npx tsx src/server.ts                              # server
npx tsc --noEmit                                                       # type-check

cd mcp-server && npm install
VAULT_PATH=../vault MCP_SERVER_URL=http://localhost:4000 \
  POCKET_ID_ISSUER=https://id.example.com npx tsx src/index.ts
```

## Deployment

This repo owns the **code and the images — nothing else**. Production runs on
a Kubernetes cluster whose manifests live in the separate GitOps repo
([infra-k8s](https://github.com/arnaultbretagne/infra-k8s), `apps/obsidian/`).
What any deployment needs to provide:

1. a shared read-write volume mounted at `/vault` in all three containers
2. a persistent volume for the sync session state
   (`/home/node/.config/obsidian-headless`)
3. the clipper resolvable as `web-clipper` (service contract above)
4. a public HTTPS endpoint for the MCP server + an OIDC issuer for its auth

## Repository layout

```
sync/         Dockerfile + entrypoint for headless Obsidian Sync
clipper/      TypeScript source of the clipper (server + CLI)
mcp-server/   TypeScript source of the MCP server
vault/        Seed scaffolding for a new vault (templates, Claude commands,
              .obsidian type/schema files) — NOT the live vault
docs/adr/     Architecture Decision Records
```
