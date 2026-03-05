# Obsidian Headless Stack

Stack Docker pour synchroniser un vault Obsidian sur VPS et clipper des pages web en Markdown, avec une API HTTP pour l'intégration avec d'autres services (ex. container LLM).

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Docker (obsidian-net)               │
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
│         │  réseau: obsidian-net │                   │
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

# Avec un template spécifique
docker compose run --rm -e MODE=cli clipper https://example.com/article -t article

# Bookmark rapide
docker compose run --rm -e MODE=cli clipper https://example.com -t bookmark

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

  -t, --template <name>   Template (default, article, bookmark, recipe)
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

Liste les templates disponibles.

```bash
curl http://web-clipper:3000/templates
# [{"name":"default","folder":"Clippings","triggers":[],"llmFields":["title","description","tags","author"]},...]
```

### `POST /clip`

Clippe une page web. Body JSON :

```bash
curl -X POST http://web-clipper:3000/clip \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://example.com/article",
    "template": "article",
    "tags": ["ai", "research"],
    "folder": "Clippings/Articles",
    "dryRun": false
  }'
```

Réponse :

```json
{
  "filePath": "/vault/Clippings/Articles/Example Article.md",
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

## Templates

Les templates YAML dans `clipper/templates/` définissent le format de sortie :

| Template | Dossier | Description |
|----------|---------|-------------|
| `default` | `Clippings/` | Clipping brut |
| `article` | `Clippings/Articles/` | Article avec métadonnées |
| `bookmark` | `Clippings/Bookmarks/` | Lien rapide |
| `recipe` | `Clippings/Recipes/` | Recette structurée |

### Structure d'un template

```yaml
name: article
triggers:
  - medium.com
  - blog
folder: Clippings/Articles
fileNameFormat: "{{title}}"
frontmatter:
  source: "{{url}}"
  title: "{{title}}"
  author: "{{author}}"
  type: article
  created: "{{date}}"
  tags: [clippings, articles]
noteContent: "{{content}}"
llmFields:
  - title
  - description
  - tags
  - author
```

- **triggers** : patterns d'URL pour l'auto-détection du template
- **fileNameFormat** : template pour le nom de fichier
- **frontmatter** : métadonnées YAML en en-tête du `.md`
- **noteContent** : contenu du body avec variables `{{title}}`, `{{author}}`, `{{url}}`, `{{date}}`, `{{content}}`, etc.
- **llmFields** : champs destinés à être enrichis par un LLM après le clipping

### Ajouter un template

Créer un fichier `.yml` dans `clipper/templates/`. Le template sera automatiquement chargé au démarrage.

## Enrichissement LLM

Le clipper et le LLM sont volontairement séparés :

1. **Le clipper extrait** : Playwright rend la page, Defuddle extrait le contenu, Turndown convertit en Markdown, le fichier `.md` est écrit dans le vault
2. **Le LLM enrichit** : il lit le `.md`, remplit les champs `llmFields` (résumé, tags, catégorie...), et écrit directement dans le vault

Le fichier `.md` est l'interface entre les deux. Cette séparation permet :
- De clipper sans LLM (bookmarks, archivage)
- De changer de LLM sans toucher au clipper
- D'enrichir des fichiers existants à la demande

## Réseau Docker

Les deux Docker Compose (obsidian-stack et le container LLM) partagent un réseau nommé `obsidian-net`.

### Dans ce compose (obsidian-stack)

Le réseau est déclaré et créé automatiquement :

```yaml
networks:
  shared:
    name: obsidian-net
```

### Dans l'autre compose (ex. Claude Code)

Le réseau est référencé comme externe :

```yaml
networks:
  shared:
    name: obsidian-net
    external: true

services:
  claude:
    networks: [shared]
    volumes:
      - /path/to/vault:/vault
    # ...
```

Le container LLM peut alors appeler `http://web-clipper:3000/clip` pour déclencher un clip.

## Choix architecturaux

- **HTTP natif Node** plutôt que Express/Hono : 3 routes suffisent, zéro dépendance ajoutée
- **Séparation clipper/LLM** : le `.md` comme interface permet de changer chaque composant indépendamment
- **Réseau Docker externe nommé** : seul moyen propre de faire communiquer deux Docker Compose

## Développement

```bash
cd clipper
npm install

# Mode CLI
VAULT_PATH=../vault TEMPLATES_DIR=./templates npx tsx src/cli.ts https://example.com --dry-run

# Mode serveur
VAULT_PATH=../vault TEMPLATES_DIR=./templates npx tsx src/server.ts &
curl http://localhost:3000/health
curl http://localhost:3000/templates
curl -X POST http://localhost:3000/clip \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com","template":"bookmark","dryRun":true}'
kill %1

# Build
npm run build

# Type-check
npx tsc --noEmit
```
