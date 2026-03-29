# Obsidian Headless Stack

Stack Docker pour synchroniser un vault Obsidian sur VPS et clipper des pages web en Markdown, avec une API HTTP pour l'intégration avec d'autres services (ex. container LLM).

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Docker (proxy-network)              │
│                                                     │
│  ┌──────────────┐    ┌────────────────────────────┐ │
│  │ obsidian-sync│    │ web-clipper (HTTP :3000)    │ │
│  │              │    │                            │ │
│  │  Obsidian    │    │  POST /clip                │ │
│  │  Sync ←──────┼────┼── Playwright → Defuddle    │ │
│  │              │    │   → Turndown → .md         │ │
│  └──────┬───────┘    │  GET  /health              │ │
│         │            │  GET  /templates            │ │
│         │            └──────────┬─────────────────┘ │
│         │                       │                   │
│         └───────────┬───────────┘                   │
│                     │                               │
│               ┌─────▼─────┐                         │
│               │   /vault  │ (volume partagé)        │
│               └───────────┘                         │
│                     ▲                               │
│         ┌───────────┴───────────┐                   │
│         │  Autre compose        │                   │
│         │  (ex. Claude Code)    │                   │
│         │  réseau: proxy-network│                   │
│         └───────────────────────┘                   │
└─────────────────────────────────────────────────────┘
```

Trois couches :
- **obsidian-sync** synchronise le vault vers tous les appareils via Obsidian Sync
- **web-clipper** expose un serveur HTTP pour clipper des pages web en `.md` dans le vault
- **LLM** (externe) peut déclencher des clips via HTTP et enrichir les `.md` via le volume partagé

Le fichier `.md` sert d'interface entre le clipper et le LLM : le clipper extrait le contenu, le LLM enrichit ensuite (résumé, tags, etc.) en éditant directement le fichier dans le vault.

## Setup

```bash
cp .env.example .env
# Remplir .env avec vos tokens
```

Variables :

| Variable | Requis | Description |
|----------|--------|-------------|
| `OBSIDIAN_AUTH_TOKEN` | oui | Token obtenu via `ob login` |
| `VAULT_NAME` | oui | Nom du vault dans Obsidian Sync |
| `VAULT_HOST_PATH` | non | Chemin hôte pour le bind mount (défaut: `./vault`) |
| `BROWSER_TIMEOUT_MS` | non | Timeout Playwright en ms (défaut: `30000`) |
| `LOG_LEVEL` | non | Niveau de log: `debug`, `info`, `warn`, `error` (défaut: `info`) |
| `PORT` | non | Port du serveur HTTP (défaut: `3000`) |
| `MODE` | non | `server` ou `cli` (défaut: `cli`) |

## Démarrage

```bash
# Démarrer le sync + clipper HTTP
docker compose up -d

# Vérifier que le serveur est prêt
curl http://localhost:3000/health
```

## Usage CLI

Le container peut toujours être utilisé en mode CLI one-shot :

```bash
# Clipper une page
docker compose run --rm -e MODE=cli clipper https://example.com/article

# Avec tags
docker compose run --rm -e MODE=cli clipper https://example.com --tags ai,research

# Dans un dossier spécifique
docker compose run --rm -e MODE=cli clipper https://example.com --folder "Veille/Tech"

# Preview sans écrire
docker compose run --rm -e MODE=cli clipper https://example.com --dry-run
```

### Options CLI

```
clip <url> [options]

  -t, --template <name>   Template (défaut: "default")
  --tags <tag1,tag2>       Tags supplémentaires
  --folder <path>          Sous-dossier vault (override template)
  --note <text>            Note à ajouter
  --dry-run                Affiche le Markdown sans écrire
  --verbose                Log détaillé
```

## Usage HTTP (API)

Le serveur expose 3 routes sur le réseau Docker interne :

### `GET /health`

```bash
curl http://web-clipper:3000/health
# {"status":"ok"}
```

### `GET /templates`

Retourne le template chargé depuis le vault.

```bash
curl http://web-clipper:3000/templates
# [{"name":"default","folder":"Clippings","triggers":[]}]
```

### `POST /clip`

Clippe une page web. Body JSON :

```bash
curl -X POST http://web-clipper:3000/clip \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://example.com/article",
    "tags": ["ai", "research"],
    "folder": "Clippings/Articles",
    "dryRun": false
  }'
```

Réponse :

```json
{
  "filePath": "Clippings/Articles/Example Article.md",
  "title": "Example Article",
  "wordCount": 1234,
  "processingTimeMs": 3200
}
```

En cas d'erreur :

```json
{ "error": "Navigation timeout" }
```

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `url` | string | oui | URL de la page à clipper |
| `template` | string | non | Nom du template |
| `tags` | string[] | non | Tags supplémentaires |
| `folder` | string | non | Sous-dossier vault (override template) |
| `note` | string | non | Note à ajouter |
| `dryRun` | boolean | non | `true` pour preview sans écrire |

## Template

Le clipper utilise un unique template Markdown lu depuis `vault/Templates/Clipping.md`. Ce fichier définit le frontmatter et le body des clippings générés.

Le template est un fichier `.md` standard avec un bloc YAML frontmatter :

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

Variables disponibles : `{{title}}`, `{{author}}`, `{{url}}`, `{{domain}}`, `{{date}}`, `{{datetime}}`, `{{published}}`, `{{content}}`, `{{description}}`, `{{tags}}`, `{{note}}`, `{{wordCount}}`.

## Enrichissement LLM

Le clipper et le LLM sont volontairement séparés :

1. **Le clipper extrait** : Playwright rend la page, Defuddle extrait le contenu, Turndown convertit en Markdown, le fichier `.md` est écrit dans le vault
2. **Le LLM enrichit** : il lit le `.md`, modifie le frontmatter (résumé, tags, catégorie...), et écrit directement dans le vault

Le fichier `.md` est l'interface entre les deux. Cette séparation permet :
- De clipper sans LLM (bookmarks, archivage)
- De changer de LLM sans toucher au clipper
- D'enrichir des fichiers existants à la demande

## Réseau Docker

Les Docker Compose (obsidian-stack et les containers externes) partagent le réseau `proxy-network`.

### Dans ce compose (obsidian-stack)

Le réseau est référencé comme externe :

```yaml
networks:
  shared:
    name: proxy-network
    external: true
```

### Dans l'autre compose (ex. Claude Code)

Le réseau est également référencé comme externe :

```yaml
networks:
  shared:
    name: proxy-network
    external: true

services:
  claude:
    networks: [shared]
    volumes:
      - /path/to/vault:/vault
    # ...
```

Le container LLM peut alors appeler `http://web-clipper:3000/clip` pour déclencher un clip.

## MCP Server (vault-mcp)

Serveur MCP remote qui expose le vault comme un ensemble d'outils composables, accessible depuis Claude.ai, Claude Desktop, et Claude Code via Streamable HTTP + OAuth 2.1.

### Architecture

```
Claude.ai / Code / Desktop
       │
       │ OAuth 2.1 (Authorization Code + PKCE)
       ▼
┌──────────────┐
│  vault-mcp   │  JWT validation + RFC 9728
│   :4000      │  (/.well-known/oauth-protected-resource)
└──────┬───────┘
       │ fs direct
  ┌────▼────┐
  │ /vault  │
  └─────────┘
```

### Outils (10)

| Outil | Description |
|-------|-------------|
| `create_note` | Créer un `.md` avec frontmatter |
| `read_note` | Lire le contenu brut + stats |
| `update_note` | Search-and-replace (old_string doit être unique) |
| `delete_note` | Supprimer une note |
| `move_note` | Déplacer/renommer |
| `search_content` | Grep dans le body (après frontmatter) |
| `search_properties` | Grep dans le frontmatter uniquement |
| `get_backlinks` | Trouver les notes qui linkent vers une note |
| `list_properties` | Taxonomie complète (propriétés + valeurs + counts) |
| `clip_url` | Clipper une URL via le web-clipper interne |

### Variables d'environnement

| Variable | Défaut | Description |
|----------|--------|-------------|
| `MCP_PORT` | `4000` | Port du serveur MCP |
| `MCP_SERVER_URL` | `https://vault.bretagne.dev` | URL publique (pour OAuth metadata) |
| `POCKET_ID_ISSUER` | `https://id.bretagne.dev` | Issuer OIDC (Pocket ID) |
| `LOG_LEVEL` | `info` | Niveau de log |

### Write gate

Le serveur valide les écritures sans les transformer :
- YAML frontmatter parsable avec délimiteurs `---`
- Types des propriétés conformes à `.obsidian/types.json`
- Path dans le vault, pas de dotfolders, extension `.md`
- Taille < 5 MB, UTF-8 valide

### ADRs

Les décisions architecturales sont documentées dans [`docs/adr/`](docs/adr/).

## Choix architecturaux

- **HTTP natif Node** plutôt que Express/Hono : 3 routes suffisent, zéro dépendance ajoutée
- **Séparation clipper/LLM** : le `.md` comme interface permet de changer chaque composant indépendamment
- **Template dans le vault** : le template `Clipping.md` vit dans le vault, ce qui permet de le modifier depuis Obsidian directement

## Développement

```bash
cd clipper
npm install

# Mode CLI
VAULT_PATH=../vault npx tsx src/cli.ts https://example.com --dry-run

# Mode serveur
VAULT_PATH=../vault npx tsx src/server.ts &
curl http://localhost:3000/health
curl http://localhost:3000/templates
curl -X POST http://localhost:3000/clip \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com","dryRun":true}'
kill %1

# Build
npm run build

# Type-check
npx tsc --noEmit
```
