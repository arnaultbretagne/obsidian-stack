---
description: Study a GitHub repo for the agent orchestration research
allowed-tools: Bash(gh api:*), Bash(gh repo:*), Read, Write, Edit, Agent
---

GitHub repo URL or owner/name: $ARGUMENTS

## Step 1 — Fetch metadata

Use `gh api` to collect:
- Repo metadata: `gh api repos/{owner}/{repo}` → stars, license, language, description, created_at, pushed_at
- Commit count: use pagination header from `gh api repos/{owner}/{repo}/commits?per_page=1` → parse `Link` header for last page number
- Last commit date: `gh api repos/{owner}/{repo}/commits?per_page=1` → first item's date
- Top contributors: `gh api repos/{owner}/{repo}/contributors?per_page=5` → logins

## Step 2 — Analyze architecture

Use an Explore agent to study the repo's architecture via `gh api` (do NOT clone). The agent should:
1. Get the file tree (top 2-3 levels)
2. Read key files: README, main entry point, package.json or equivalent
3. Identify: how it communicates with LLM/agent CLIs (SDK? subprocess? PTY?), session management approach, IPC pattern, isolation model
4. Look for notable patterns worth documenting

## Step 3 — Determine continuum position

Based on the architecture analysis, assign ONE position from the study's continuum:
- **SDK Port** — SDK reimplemented in another language
- **SDK Bridge** — SDK adapted to another ecosystem
- **SDK Proxy** — SDK exposed over network (REST, WebSocket, SSE)
- **SDK Plugin** — SDK + one smart capability (memory, security, etc.)
- **GUI** — Desktop/mobile interface to agent CLIs
- **Session Manager** — N CLI sessions on one screen
- **Multi-Agent Coding** — N agents coordinated on one repo
- **Full Orchestrator** — Channels + isolation + sessions + routing
- **Platform** — Complete ecosystem with marketplace/plugins

Reference: read `/home/coder/projects/CLAUDE-AGENT-SDK-ECOSYSTEM.md` for the full continuum and existing analyses to maintain consistency in depth and style.

## Step 4 — Write the note

Create the note at `/home/coder/vault/Agent/{Project Name}.md` matching the template at `/home/coder/vault/Templates/agent orchestration.md`.

The frontmatter must include all fields from the template:
- `source`: GitHub URL
- `type`: continuum position in lowercase
- `domain`: agent-orchestration
- `continuum_position`: one of the positions from Step 3
- `author`: top contributors as quoted strings in array
- `repo_created_at`: repo creation date from GitHub (YYYY-MM-DD)
- `stars`: number
- `license`: SPDX ID
- `language`: primary language
- `last_commit`: date (YYYY-MM-DD)
- `commits`: number
- `tags`: [agent-orchestration]
- `note_created_at`: today's date (YYYY-MM-DD)
- `schema_version`: 1

Body sections:
- **## Summary** — 2-3 sentences. What problem does it solve? For whom? Include continuum context (how it compares to similar projects in the same layer).
- **## Architecture** — ASCII diagram + 3-5 key architectural decisions. Focus on patterns, not implementation details.
- **## Standout patterns** — 4-8 bullets worth remembering: clever patterns, trade-offs, strengths, weaknesses, gotchas. Each bullet = bold label + explanation.

Rules:
- Write EVERYTHING in English
- Be concise and factual — no marketing language
- Focus on architecture and patterns, not features lists
- Compare to projects from the existing study where relevant
- If the repo is not relevant to agent orchestration, say so and do not create the note
