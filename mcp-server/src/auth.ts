// Bearer-token auth for the MCP resource server (audit F-05).
//
// The vault MCP is its own OAuth resource server: MCP clients present a JWT
// access token minted by Pocket-ID (obsidian-stack ADR 0002). Verifying the
// issuer + signature alone is NOT enough — a token the same IdP issued for a
// different client/resource would be accepted (cross-service token confusion,
// dangerous for a server that reads/writes a vault). We additionally bind the
// token to THIS resource (audience), pin the signature algorithm, and expose
// optional client/group/scope gates.
//
// The verification/authorization logic here is framework-agnostic and unit
// tested (auth.test.ts); createRequireAuth adapts it to Express.
import type { JWTPayload, JWTVerifyGetKey } from "jose";
import { jwtVerify } from "jose";
import type { Request, Response, NextFunction } from "express";
import type { AppConfig } from "./config.js";

export interface AuthPolicy {
  issuer: string;
  audiences: string[];
  algorithms: string[];
  allowedClientIds?: string[];
  requiredGroups?: string[];
  requiredScopes?: string[];
}

export function policyFromConfig(config: AppConfig): AuthPolicy {
  return {
    issuer: config.issuer,
    audiences: config.allowedAudiences,
    algorithms: config.jwtAlgorithms,
    allowedClientIds: config.allowedClientIds,
    requiredGroups: config.requiredGroups,
    requiredScopes: config.requiredScopes,
  };
}

export interface AuthContext {
  token: string;
  clientId: string;
  scopes: string[];
  groups: string[];
  subject?: string;
  expiresAt?: number;
}

export type AuthResult =
  | { ok: true; auth: AuthContext }
  | { ok: false; status: 401 | 403; error: string };

/** OAuth claims carry lists as either an array or a space-delimited string. */
function claimList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  if (typeof value === "string") {
    return value.split(" ").filter(Boolean);
  }
  return [];
}

// Derive the calling client's identity from IdP-asserted claims ONLY — never
// from `aud`. Pocket-ID echoes the RFC 8707 `resource` verbatim into `aud` for
// the client_credentials grant (verified at source, v2.5.0), so any confidential
// client can mint a token with `aud=<anything>`; `aud` therefore proves intent,
// not identity. The identity-bearing claims differ by grant:
//   - authorization_code: Pocket-ID sets neither `client_id` nor `azp` on the
//     access token, so this returns "" and the token is left to the audience
//     gate (its `aud` is its own client_id, unforgeable in that grant).
//   - client_credentials: no `client_id`/`azp` either; the client is only in
//     `sub = "client-<uuid>"`. Matching that exact shape lets a machine client be
//     gated by MCP_ALLOWED_CLIENT_IDS, and makes an aud-forged token fail — its
//     `sub` is the real minting client, not the broker.
const CLIENT_CREDENTIALS_SUB =
  /^client-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

function clientIdOf(payload: JWTPayload): string {
  const explicit =
    (payload.client_id as string | undefined) ??
    (payload.azp as string | undefined);
  if (explicit) return explicit;
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  const match = CLIENT_CREDENTIALS_SUB.exec(sub);
  return match ? match[1] : "";
}

/**
 * Authorization gate on an already-authenticated payload (signature, issuer,
 * audience, alg and expiry already checked by jwtVerify). Returns the first
 * failing reason. Each gate is a no-op unless the policy configures it.
 */
export function authorizeClaims(
  payload: JWTPayload,
  policy: AuthPolicy,
): { ok: true } | { ok: false; error: string } {
  if (policy.allowedClientIds?.length) {
    const clientId = clientIdOf(payload);
    // Reject only a token that PRESENTS a client identity not on the allow-list.
    // A token with no IdP-asserted client identity (an authorization_code access
    // token — Pocket-ID sets no azp/client_id there, v2.5.0) has clientId === ""
    // and is governed by the audience gate instead. Rejecting "" here would lock
    // out the Claude.ai / ChatGPT connectors (audit F-05 Update 2026-07-08).
    if (clientId && !policy.allowedClientIds.includes(clientId)) {
      return { ok: false, error: "client_id not allowed" };
    }
  }

  if (policy.requiredGroups?.length) {
    const groups = claimList((payload as Record<string, unknown>).groups);
    const member = policy.requiredGroups.some((g) => groups.includes(g));
    if (!member) {
      return { ok: false, error: "missing required group" };
    }
  }

  if (policy.requiredScopes?.length) {
    const scopes = claimList(
      payload.scope ?? (payload as Record<string, unknown>).scp,
    );
    const hasAll = policy.requiredScopes.every((s) => scopes.includes(s));
    if (!hasAll) {
      return { ok: false, error: "missing required scope" };
    }
  }

  return { ok: true };
}

/**
 * Verify a bearer token and authorize it. `getKey` is the JWKS resolver
 * (createRemoteJWKSet in prod; a local key set in tests). A bad
 * signature/issuer/audience/alg/expiry is 401 (authentication); a well-formed
 * token that fails a client/group/scope gate is 403 (authorization).
 */
export async function authenticate(
  token: string,
  getKey: JWTVerifyGetKey,
  policy: AuthPolicy,
): Promise<AuthResult> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, getKey, {
      issuer: policy.issuer,
      audience: policy.audiences,
      algorithms: policy.algorithms,
    }));
  } catch {
    return { ok: false, status: 401, error: "Invalid or expired token" };
  }

  const authz = authorizeClaims(payload, policy);
  if (!authz.ok) {
    return { ok: false, status: 403, error: authz.error };
  }

  return {
    ok: true,
    auth: {
      token,
      clientId: clientIdOf(payload),
      scopes: claimList(payload.scope ?? (payload as Record<string, unknown>).scp),
      groups: claimList((payload as Record<string, unknown>).groups),
      subject: payload.sub,
      expiresAt: payload.exp,
    },
  };
}

/**
 * Express middleware. On failure it sets a spec-shaped WWW-Authenticate header
 * (RFC 9728 §5.1) pointing MCP clients at the protected-resource metadata.
 */
export function createRequireAuth(
  getKey: JWTVerifyGetKey,
  policy: AuthPolicy,
  resourceMetadataUrl: string,
) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      res.setHeader(
        "WWW-Authenticate",
        `Bearer resource_metadata="${resourceMetadataUrl}"`,
      );
      res.status(401).json({ error: "Missing Bearer token" });
      return;
    }

    const result = await authenticate(header.slice(7), getKey, policy);
    if (!result.ok) {
      if (result.status === 401) {
        res.setHeader(
          "WWW-Authenticate",
          `Bearer resource_metadata="${resourceMetadataUrl}", error="invalid_token"`,
        );
      } else {
        res.setHeader(
          "WWW-Authenticate",
          `Bearer error="insufficient_scope", error_description="${result.error}"`,
        );
      }
      res.status(result.status).json({ error: result.error });
      return;
    }

    (req as Request & { auth?: unknown }).auth = result.auth;
    next();
  };
}
