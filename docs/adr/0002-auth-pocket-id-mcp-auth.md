# 0002 — Auth via Pocket ID + mcp-auth (no proxy, no better-auth)

## Status

Accepted

## Context

The MCP server must be accessible from Claude.ai (web), Claude Code (CLI), and Claude Desktop. Claude.ai requires OAuth 2.1 for custom connectors — no Bearer token shortcut. The VPS already runs Pocket ID as a passkey-first OIDC provider behind Caddy.

The MCP spec (2025-06-18) mandates: RFC 9728 (Protected Resource Metadata), RFC 8414 (Authorization Server Metadata), PKCE, and RFC 8707 (resource parameter). Dynamic Client Registration (DCR, RFC 7591) is SHOULD, not MUST.

## Options considered

### Option A — better-auth embedded in MCP server

better-auth framework with its MCP plugin, embedded in the Node.js process. Acts as a full OAuth 2.1 Authorization Server, delegates login to Pocket ID as a social/OIDC provider. SQLite for session/client persistence.

- **Pros:** Full spec compliance including DCR. Single container. Pocket ID handles passkey login.
- **Cons:** Young library (MCP plugin not fully OAuth 2.1 compliant — issue #5459). Adds SQLite, session management, token issuance logic to an otherwise thin server. Overkill for single-user.

### Option B — OAuth proxy in front of MCP server

A dedicated proxy (sigbit/mcp-auth-proxy, obot/mcp-oauth-proxy, HyprMCP) that handles all OAuth and forwards authenticated requests to the MCP server. The MCP server has zero auth code.

- **Pros:** Complete separation of concerns. MCP server stays auth-free. Battle-tested proxies.
- **Cons:** Extra service in the compose. Neither sigbit nor obot support DCR. HyprMCP requires a separate Dex instance. atrawog is GitHub-only. Adds operational complexity for a single-user setup.

### Option C — Pocket ID direct + mcp-auth library

Pocket ID serves as the Authorization Server directly. The mcp-auth library (resource server toolkit) handles JWT validation and RFC 9728 on the MCP server side. Analysis of Pocket ID's source code revealed it already supports PKCE (S256) and the `resource` parameter (RFC 8707) in its token endpoint. The only gap is `/.well-known/oauth-authorization-server` (RFC 8414) — Pocket ID only exposes `/.well-known/openid-configuration`.

- **Pros:** Minimal — no new service, no framework, no database. mcp-auth is just a validation library. The RFC 8414 gap is ~20 lines (serve the same JSON at a different URL). No DCR needed because Claude.ai supports manual client_id/secret entry via "Advanced settings".
- **Cons:** No DCR means manual one-shot client registration in Pocket ID's admin UI. Claude.ai users must enter client_id/secret manually (one time). If Pocket ID's OIDC metadata diverges from RFC 8414 requirements in the future, the alias could break.

### Option D — Contribute DCR + RFC 8414 to Pocket ID upstream

Fork Pocket ID, implement the missing features, submit a PR.

- **Pros:** Clean, benefits the community, removes the shim entirely.
- **Cons:** Depends on upstream merge. DCR is a non-trivial feature (new controller, client storage, registration flow). Timeline uncertain.

## Decision

Option C — Pocket ID direct + mcp-auth library. The analysis showed that Pocket ID is closer to MCP compliance than initially thought (resource parameter already works, PKCE already works). The only gap is a metadata endpoint alias. DCR is not needed because Claude.ai's "Advanced settings" panel supports manual credential entry, and Claude Code supports `--client-id`/`--client-secret` flags since v2.1.30.

The setup is:
1. mcp-auth on the MCP server: validates Bearer tokens (JWT via JWKS), exposes `/.well-known/oauth-protected-resource`
2. Pocket ID as Authorization Server: handles authorize, token, PKCE, passkey login
3. ~20 lines added to Pocket ID (or a Caddy route) for `/.well-known/oauth-authorization-server`
4. One-time manual client registration in Pocket ID admin UI

## Consequences

- No DCR: each new MCP client (Claude.ai, Claude Code, Claude Desktop) needs the client_id/secret entered once. Acceptable for single-user.
- No new service or database for auth. The MCP server stays thin.
- If Pocket ID adds RFC 8414 + DCR natively in the future, the shim can be removed.
- The mcp-auth library is a dependency but it's lightweight (JWT validation + metadata endpoint).

## Update (2026-07-04) — resource-server validation hardened (audit F-05)

The first cut validated only the issuer + signature (`jwtVerify(token, jwks, { issuer })`).
That accepts *any* token the same Pocket-ID mints — including one issued to another
client for another resource (cross-service token confusion), which is unacceptable for
a server that reads/writes the vault. The resource server now enforces, in `src/auth.ts`:

- **Audience** — the token `aud` must contain this resource. Defaults to `MCP_SERVER_URL`
  (the RFC 8707 `resource` value advertised in the protected-resource metadata; Pocket ID
  binds it via the resource parameter — **⚠️ only for the `client_credentials` grant; the
  `authorization_code` connector flow ignores `resource` and sets `aud=client_id`, see Update
  2026-07-08**). Overridable with `MCP_ALLOWED_AUDIENCE`.
- **Algorithm pinning** — only `MCP_JWT_ALGS` (default `RS256`) accepted; no downgrade.
- **Optional authz gates** (enforced only when set): `MCP_ALLOWED_CLIENT_IDS` (client_id/azp
  allow-list), `MCP_REQUIRED_GROUPS`, `MCP_REQUIRED_SCOPES`. Left unset by default so a claim
  shape the IdP may not emit can't lock the operator out; enable after checking a real token.

A 401 means authentication failed (signature/issuer/audience/alg/expiry); a 403 means the
token authenticated but failed a client/group/scope gate. Both carry an RFC 9728
`WWW-Authenticate` header pointing at the protected-resource metadata. Negative + positive
cases are covered in `mcp-server/src/auth.test.ts` (`npm test`).

Note: the MCP client must be registered in Pocket ID (ADR decision step 4). It is **not** in
the `pocket-id/oidc-reconciler` bijective `spec.json` today, so the reconciler would prune a
hand-registered client — track adding it there.

## Update (2026-07-08) — Pocket-ID `aud` binding is grant-type-dependent (why the Claude.ai connector broke)

The F-05 Update above (and the Option-C analysis) assumed Pocket-ID binds the RFC 8707 `resource`
into the token `aud` regardless of grant. Verified at source (`pocket-id/pocket-id`
`backend/internal/service/oidc_service.go`, v2.5.0), that holds **only for the `client_credentials`
grant**:

```go
// createTokenFromClientCredentials
audClaim := client.ID
if input.Resource != "" { audClaim = input.Resource }   // resource → aud, client_credentials only
```

For the **`authorization_code`** grant — the one the Claude.ai / Claude Code / Claude Desktop
connectors use — Pocket-ID **ignores** `resource` and sets `aud = client_id`. (Its *internal session*
token uses `aud = AppURL`; neither path yields `aud = MCP_SERVER_URL`.)

**Consequence, observed in production:** once F-05 made `aud` mandatory (defaulting to
`MCP_SERVER_URL = https://vault.bretagne.dev`), the Claude.ai connector's token — carrying
`aud = <its client_id>` — failed the audience gate and the connector flipped to *"Needs
authentication"*. Re-authenticating does **not** fix it: the fresh token has the same
`aud = client_id`. This is structural, not a stale token.

| Client | Grant | Token `aud` | Passes F-05 `aud=vault`? |
|---|---|---|---|
| A machine client | `client_credentials` + `resource=<this server>` | the `resource` value | **yes** |
| Claude.ai / ChatGPT / Desktop connector | `authorization_code` (ignores `resource`) | `<client_id>` | **no** |

**The fix (applied — infra-k8s `apps/obsidian/mcp-server.yaml`).** The audience gate cannot be
satisfied via `resource` for the connectors, so accept their `client_id`s explicitly:
`MCP_ALLOWED_AUDIENCE = https://vault.bretagne.dev,<claude_auth id>,<openai_auth id>`. This restores the
connectors while keeping the cross-service protection — only tokens whose `aud` is the vault or one of
*our* two connectors pass. After deploy, each connector must be re-authenticated once. Caveat: those are
Pocket-ID-generated client_ids — if a connector client is recreated in the reconciler, its UUID changes
and the list must be updated.

**Group gate left off, on purpose.** `MCP_REQUIRED_GROUPS` stays unset: `claude_auth` / `openai_auth`
are already `admin`-group-restricted at Pocket-ID (a non-admin never gets a token), so a vault-side
group check is redundant defense-in-depth, needs a live token to confirm the `groups` claim actually
flows (else it locks the operator out), and is deferred. This settles and replaces the former
`infra-k8s/TODO - auth mcp.md`, now removed.

**Note on `client_credentials` tokens:** they carry no `scope` and no user `groups` (Pocket-ID sets
neither for that grant), so a machine client can only be authorized on `iss` + `aud` + `client_id`
(`MCP_ALLOWED_CLIENT_IDS`), never on scope or group.

## Links

- [mcp-auth.dev](https://mcp-auth.dev/docs) — MCP resource server auth toolkit
- [MCP Authorization Specification (2025-06-18)](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
- [Claude.ai custom connectors — Advanced settings](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) — manual credential entry
- [Claude Code DCR issue #26675](https://github.com/anthropics/claude-code/issues/26675) — `--client-id`/`--client-secret` flags
- [Pocket ID source: oidc_service.go](https://github.com/pocket-id/pocket-id) — resource parameter already in token endpoint
- [better-auth MCP plugin compliance issue #5459](https://github.com/better-auth/better-auth/issues/5459) — why we didn't choose better-auth
