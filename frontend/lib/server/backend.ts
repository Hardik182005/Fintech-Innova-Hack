import "server-only";

/**
 * Server-side edge of the CredenceAI API.
 *
 * Nothing here may be imported from a Client Component. This module holds the
 * sandbox demo token and knows the tenant bearer, and `server-only` turns any
 * such import into a build error instead of a silently shipped credential.
 */

const DEFAULT_BASE = "http://localhost:8001";

/**
 * Base URL of the FastAPI service. Deliberately not `NEXT_PUBLIC_` — the
 * browser never talks to the API directly, it talks to the proxy in
 * app/api/credence, so the API location is server configuration.
 */
export function backendBase(): string {
  return (process.env.CREDENCE_API_BASE ?? DEFAULT_BASE).replace(/\/+$/, "");
}

/**
 * Token for the backend's sandbox demo surface. Absent means the demo surface
 * stays closed, mirroring `Settings.demo_enabled`, which requires both the
 * sandbox environment and an operator-supplied token.
 */
export function demoToken(): string {
  return process.env.CREDENCE_DEMO_TOKEN ?? "";
}

export const REDACTED = "[redacted server-side]";

/**
 * Response keys that carry credential material.
 *
 * The backend mints a bearer token when an organization is created and echoes
 * it back once. That token *is* the session, so it belongs in an httpOnly
 * cookie and nowhere else — in particular not in a response body the browser
 * can read, log, or persist.
 */
const SECRET_KEYS = new Set([
  "owner_api_token",
  "api_token",
  "api_token_hash",
  "token",
  "access_token",
  "refresh_token",
  "bearer",
  "authorization",
  "private_key",
  "private_key_b64",
  "signing_key",
  "secret",
  "client_secret",
  "password",
  "passphrase",
]);

/**
 * Strip credential material from a proxied response.
 *
 * This runs over every response rather than over a list of endpoints known to
 * return secrets, so a field added to the backend later cannot leak just by
 * being forgotten here. The key is replaced rather than deleted so the
 * redaction is visible in the network tab: a reviewer can confirm the token
 * was withheld instead of inferring it from an absence.
 */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, inner]) =>
        SECRET_KEYS.has(key.toLowerCase())
          ? [key, inner === null || inner === undefined ? inner : REDACTED]
          : [key, redact(inner)],
      ),
    );
  }
  return value;
}
