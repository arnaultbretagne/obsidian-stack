// Config-parsing tests, with one thing to prove above all (agent-broker plan P5.1): a security gate
// must never end up OFF because its variable rendered blank. `MCP_ALLOWED_CLIENT_IDS=""` used to
// parse as "unset" — the allow-list silently stopped being enforced while every config dump still
// showed the variable as set. That is the failure mode this file exists to pin down.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "./config.js";

const BASE = {
  MCP_SERVER_URL: "https://vault.example.dev",
  POCKET_ID_ISSUER: "https://id.example.dev",
};

/** loadConfig reads process.env — swap it for the call, restore after. */
function withEnv<T>(env: Record<string, string | undefined>, fn: () => T): T {
  const saved = process.env;
  process.env = { ...BASE, ...env } as NodeJS.ProcessEnv;
  try {
    return fn();
  } finally {
    process.env = saved;
  }
}

// ── the fail-open we refuse ─────────────────────────────────────────────

test("a gate variable that is set but BLANK is fatal, never a silent no-op", () => {
  for (const name of [
    "MCP_ALLOWED_CLIENT_IDS",
    "MCP_ALLOWED_AUDIENCE",
    "MCP_REQUIRED_GROUPS",
    "MCP_REQUIRED_SCOPES",
  ]) {
    for (const blank of ["", "   ", ",", " , , "]) {
      assert.throws(
        () => withEnv({ [name]: blank }, loadConfig),
        new RegExp(`${name} is set but empty`),
        `${name}=${JSON.stringify(blank)} must refuse to start`,
      );
    }
  }
});

test("an ABSENT gate variable is still the documented way to leave the gate off", () => {
  const config = withEnv({}, loadConfig);
  assert.equal(config.allowedClientIds, undefined);
  assert.equal(config.requiredGroups, undefined);
  assert.equal(config.requiredScopes, undefined);
});

// ── parsing ─────────────────────────────────────────────────────────────

test("MCP_ALLOWED_CLIENT_IDS parses as CSV and tolerates whitespace", () => {
  const config = withEnv(
    { MCP_ALLOWED_CLIENT_IDS: " a8bcf978-1111-2222-3333-444444444444 , 7db41a0c-5555-6666-7777-888888888888 " },
    loadConfig,
  );
  assert.deepEqual(config.allowedClientIds, [
    "a8bcf978-1111-2222-3333-444444444444",
    "7db41a0c-5555-6666-7777-888888888888",
  ]);
});

test("the audience defaults to the server's own URL — the resource identifier it advertises", () => {
  const config = withEnv({}, loadConfig);
  assert.deepEqual(config.allowedAudiences, ["https://vault.example.dev"]);
});

test("the signature algorithm is pinned to RS256 unless overridden", () => {
  assert.deepEqual(withEnv({}, loadConfig).jwtAlgorithms, ["RS256"]);
  assert.deepEqual(withEnv({ MCP_JWT_ALGS: "RS256,ES256" }, loadConfig).jwtAlgorithms, ["RS256", "ES256"]);
});

// ── invalid configuration ───────────────────────────────────────────────

test("a missing or malformed deployment URL is fatal — never a silent default to someone else's IdP", () => {
  assert.throws(() => withEnv({ MCP_SERVER_URL: undefined }, loadConfig));
  assert.throws(() => withEnv({ POCKET_ID_ISSUER: undefined }, loadConfig));
  assert.throws(() => withEnv({ POCKET_ID_ISSUER: "not-a-url" }, loadConfig));
  assert.throws(() => withEnv({ MCP_PORT: "-1" }, loadConfig));
});
