// Negative + positive JWT tests for the resource-server auth gate (audit F-05).
// Uses jose to mint a local JWKS and sign tokens — no network, no real IdP.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SignJWT,
  generateKeyPair,
  exportJWK,
  createLocalJWKSet,
  type JWTVerifyGetKey,
  type JWK,
} from "jose";
import { authenticate, authorizeClaims, type AuthPolicy } from "./auth.js";

const ISS = "https://id.example.dev";
const RES = "https://vault.example.dev";
const KID = "test-key-1";

// One trusted signer (in the JWKS) and one rogue signer (not in the JWKS).
const trusted = await generateKeyPair("RS256");
const rogue = await generateKeyPair("RS256");

const trustedJwk: JWK = { ...(await exportJWK(trusted.publicKey)), kid: KID, alg: "RS256" };
const jwks: JWTVerifyGetKey = createLocalJWKSet({ keys: [trustedJwk] });

const basePolicy: AuthPolicy = {
  issuer: ISS,
  audiences: [RES],
  algorithms: ["RS256"],
};

const now = () => Math.floor(Date.now() / 1000);

interface TokenOpts {
  issuer?: string;
  audience?: string;
  claims?: Record<string, unknown>;
  exp?: number;
  iat?: number;
  alg?: string;
  kid?: string;
  key?: CryptoKey; // signing key (defaults to the trusted private key)
  secret?: Uint8Array; // for symmetric algs (HS256)
}

async function mint(opts: TokenOpts = {}): Promise<string> {
  const jwt = new SignJWT(opts.claims ?? {})
    .setProtectedHeader({ alg: opts.alg ?? "RS256", kid: opts.kid ?? KID })
    .setIssuedAt(opts.iat ?? now())
    .setIssuer(opts.issuer ?? ISS)
    .setAudience(opts.audience ?? RES)
    .setExpirationTime(opts.exp ?? now() + 300);
  return opts.secret
    ? jwt.sign(opts.secret)
    : jwt.sign(opts.key ?? trusted.privateKey);
}

// ── authentication (401) ────────────────────────────────────────────────

test("valid token (issuer + audience + RS256) is accepted", async () => {
  const res = await authenticate(await mint(), jwks, basePolicy);
  assert.equal(res.ok, true);
});

test("wrong issuer is rejected (401)", async () => {
  const res = await authenticate(
    await mint({ issuer: "https://evil.example.dev" }),
    jwks,
    basePolicy,
  );
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.status, 401);
});

test("wrong audience is rejected (401) — the cross-service confusion case", async () => {
  // A perfectly valid token from the SAME issuer, but minted for another resource.
  const res = await authenticate(
    await mint({ audience: "https://grafana.example.dev" }),
    jwks,
    basePolicy,
  );
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.status, 401);
});

test("expired token is rejected (401)", async () => {
  const res = await authenticate(
    await mint({ iat: now() - 600, exp: now() - 60 }),
    jwks,
    basePolicy,
  );
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.status, 401);
});

test("token signed by an unknown key is rejected (401)", async () => {
  const res = await authenticate(
    await mint({ key: rogue.privateKey }),
    jwks,
    basePolicy,
  );
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.status, 401);
});

test("unexpected algorithm (HS256) is rejected (401)", async () => {
  const res = await authenticate(
    await mint({ alg: "HS256", secret: new Uint8Array(32) }),
    jwks,
    basePolicy,
  );
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.status, 401);
});

// ── authorization (403) ─────────────────────────────────────────────────

test("client_id gate: disallowed client is rejected (403)", async () => {
  const policy: AuthPolicy = { ...basePolicy, allowedClientIds: ["mcp-vault"] };
  const res = await authenticate(
    await mint({ claims: { client_id: "some-other-app" } }),
    jwks,
    policy,
  );
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.status, 403);
});

test("client_id gate: allowed client (via azp fallback) is accepted", async () => {
  const policy: AuthPolicy = { ...basePolicy, allowedClientIds: ["mcp-vault"] };
  const res = await authenticate(
    await mint({ claims: { azp: "mcp-vault" } }),
    jwks,
    policy,
  );
  assert.equal(res.ok, true);
});

test("group gate: token without the required group is rejected (403)", async () => {
  const policy: AuthPolicy = { ...basePolicy, requiredGroups: ["admin"] };
  const res = await authenticate(
    await mint({ claims: { groups: ["editors"] } }),
    jwks,
    policy,
  );
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.status, 403);
});

test("group gate: token with the required group is accepted", async () => {
  const policy: AuthPolicy = { ...basePolicy, requiredGroups: ["admin"] };
  const res = await authenticate(
    await mint({ claims: { groups: ["admin", "editors"] } }),
    jwks,
    policy,
  );
  assert.equal(res.ok, true);
});

test("scope gate: missing a required scope is rejected (403)", async () => {
  const policy: AuthPolicy = {
    ...basePolicy,
    requiredScopes: ["openid", "vault.write"],
  };
  const res = await authenticate(
    await mint({ claims: { scope: "openid" } }),
    jwks,
    policy,
  );
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.status, 403);
});

test("scope gate: all required scopes present is accepted", async () => {
  const policy: AuthPolicy = {
    ...basePolicy,
    requiredScopes: ["openid", "vault.write"],
  };
  const res = await authenticate(
    await mint({ claims: { scope: "openid vault.write vault.read" } }),
    jwks,
    policy,
  );
  assert.equal(res.ok, true);
});

// ── client_id gate: Pocket-ID grant shapes (machine sub vs connector) ────
// Pocket-ID sets no client_id/azp on either grant's access token. A
// client_credentials token is identified by sub="client-<uuid>"; an
// authorization_code token has a user sub and is identified by its aud.
const MACHINE = "11111111-1111-1111-1111-111111111111";
const OTHER_MACHINE = "22222222-2222-2222-2222-222222222222";

test("client_id gate: client_credentials token (sub=client-<uuid>) is identified by sub and allowed when listed", async () => {
  const policy: AuthPolicy = { ...basePolicy, allowedClientIds: [MACHINE] };
  const res = await authenticate(
    await mint({ claims: { sub: `client-${MACHINE}` } }),
    jwks,
    policy,
  );
  assert.equal(res.ok, true);
  assert.equal(res.ok === true && res.auth.clientId, MACHINE);
});

test("client_id gate: a forged-audience machine token is rejected via its real sub (403)", async () => {
  // A rogue confidential client can echo any `resource` into `aud` (Pocket-ID,
  // client_credentials) — but its `sub` is its own client id, not the broker's.
  const policy: AuthPolicy = { ...basePolicy, allowedClientIds: [MACHINE] };
  const res = await authenticate(
    await mint({ audience: RES, claims: { sub: `client-${OTHER_MACHINE}` } }),
    jwks,
    policy,
  );
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.status, 403);
});

test("client_id gate: an authorization_code token (user sub, no azp/client_id) is not locked out", async () => {
  // Its identity is `aud` (governed by the audience gate); the client-id gate
  // must let it through so the Claude.ai / ChatGPT connectors keep working.
  const policy: AuthPolicy = { ...basePolicy, allowedClientIds: [MACHINE] };
  const res = await authenticate(
    await mint({ claims: { sub: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" } }),
    jwks,
    policy,
  );
  assert.equal(res.ok, true);
});

test("client_id gate: a non-uuid `client-…` sub is not treated as a client id (strict shape)", () => {
  const r = authorizeClaims(
    { sub: "client-not-a-uuid" } as never,
    { ...basePolicy, allowedClientIds: [MACHINE] },
  );
  assert.equal(r.ok, true); // clientIdOf → "" (no strict uuid match); gate is a no-op
});

// ── authorizeClaims unit (claim-shape handling) ─────────────────────────

test("authorizeClaims: groups accepted as a space-delimited string", () => {
  const r = authorizeClaims(
    { groups: "admin editors" } as never,
    { ...basePolicy, requiredGroups: ["admin"] },
  );
  assert.equal(r.ok, true);
});

test("authorizeClaims: no gates configured always passes", () => {
  const r = authorizeClaims({} as never, basePolicy);
  assert.equal(r.ok, true);
});

// ── absent claims (agent-broker plan P5.1) ──────────────────────────────
// Pocket-ID's token shapes differ per grant, so "the claim isn't there" is a normal case, not an
// exotic one. Each gate must have a defined answer for it rather than throwing or, worse, passing.

test("client_id gate: a token with NO sub at all presents no client identity — left to the audience gate", async () => {
  // jwtVerify does not require `sub`. Such a token asserts no client identity, so the client gate
  // has nothing to match: it must not be treated as "allowed" by accident, nor crash — the audience
  // gate (already passed) is what governs it.
  const policy: AuthPolicy = { ...basePolicy, allowedClientIds: ["a-client"] };
  const token = await mint({ claims: {} });
  const result = await authenticate(token, jwks, policy);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.auth.clientId, "");
  assert.equal(result.ok && result.auth.subject, undefined);
});

test("group gate: a token with NO groups claim is rejected (403), not passed through", async () => {
  const policy: AuthPolicy = { ...basePolicy, requiredGroups: ["vault-users"] };
  const result = await authenticate(await mint({ claims: {} }), jwks, policy);
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.status, 403);
  assert.equal(!result.ok && result.error, "missing required group");
});

test("scope gate: a token with NO scope claim is rejected (403), not passed through", async () => {
  const policy: AuthPolicy = { ...basePolicy, requiredScopes: ["vault:read"] };
  const result = await authenticate(await mint({ claims: {} }), jwks, policy);
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.status, 403);
  assert.equal(!result.ok && result.error, "missing required scope");
});

test("client_id gate: a machine token whose sub is a client NOT on the list is rejected (403)", () => {
  // The P5 shape, stated plainly: the broker's machine client is allow-listed; any OTHER Pocket-ID
  // machine client — even one that asks for the right `resource` and so gets the right `aud` — is
  // refused, because its `sub` is its own client id and the IdP will not let it lie about that.
  const broker = "11111111-2222-3333-4444-555555555555";
  const other = "99999999-8888-7777-6666-555555555555";
  const policy: AuthPolicy = { ...basePolicy, allowedClientIds: [broker] };
  assert.deepEqual(authorizeClaims({ sub: `client-${broker}`, aud: RES }, policy), { ok: true });
  assert.deepEqual(authorizeClaims({ sub: `client-${other}`, aud: RES }, policy), {
    ok: false,
    error: "client_id not allowed",
  });
});
