import "server-only";

import { cookies } from "next/headers";

import { backendBase } from "./backend";

/**
 * Sandbox session handling.
 *
 * CredenceAI's backend authenticates with a per-organization bearer token. A
 * judge should not have to create an account to look at the product, so the
 * first request from an unknown visitor provisions a sandbox workspace and
 * parks its bearer in an httpOnly cookie. The browser can present the session
 * on later requests but can never read it, so no credential exists in any
 * script, bundle, or response body.
 *
 * OIDC owner login replaces this in a real deployment; the cookie contract does
 * not change, only where the token comes from.
 */

const COOKIE_NAME = "credence_session";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 12;

/**
 * How long one freshly minted workspace is shared across concurrent requests.
 *
 * A first page load fires several data requests at once. Minting a tenant per
 * request would scatter one visitor's data across throwaway organizations
 * before the cookie is committed, so the first mint is shared briefly. The
 * share expires so a genuinely new visitor still gets their own sandbox.
 */
const MINT_SHARE_WINDOW_MS = 30_000;

let pendingMint: { promise: Promise<string>; startedAt: number } | null = null;

export type Session = {
  token: string;
  /** True when this request created the workspace, i.e. a first-time visitor. */
  minted: boolean;
};

export class SessionError extends Error {}

async function mintSandboxTenant(): Promise<string> {
  // Distinct per workspace: the owner email is the human-facing handle for the
  // tenant and two sandboxes minted in the same second must not collide.
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const response = await fetch(`${backendBase()}/v1/organizations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Sandbox Workspace",
      owner_email: `sandbox.${suffix}@credence.local`,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new SessionError(`sandbox workspace could not be created (${response.status})`);
  }

  const body = (await response.json()) as { owner_api_token?: unknown };
  if (typeof body.owner_api_token !== "string" || body.owner_api_token.length === 0) {
    throw new SessionError("sandbox workspace response carried no bearer token");
  }
  return body.owner_api_token;
}

/**
 * Return the caller's bearer, provisioning a sandbox workspace on first sight.
 *
 * Must be called from a Route Handler or Server Function: setting the cookie
 * requires an outgoing response that has not started streaming.
 */
export async function resolveSession(): Promise<Session> {
  const jar = await cookies();
  const existing = jar.get(COOKIE_NAME)?.value;
  if (existing) return { token: existing, minted: false };

  const now = Date.now();
  if (pendingMint === null || now - pendingMint.startedAt > MINT_SHARE_WINDOW_MS) {
    pendingMint = { promise: mintSandboxTenant(), startedAt: now };
  }

  const inflight = pendingMint.promise;
  let token: string;
  try {
    token = await inflight;
  } catch (error) {
    // Do not let one failed mint poison the share window: the backend may have
    // been starting up, and the next request deserves a fresh attempt.
    if (pendingMint?.promise === inflight) pendingMint = null;
    throw error;
  }

  jar.set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true, // the browser returns it but cannot read it
    sameSite: "lax", // a cross-site POST never carries the session
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });

  return { token, minted: true };
}

/** Drop the session so the next request provisions a clean workspace. */
export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.set({ name: COOKIE_NAME, value: "", path: "/", maxAge: 0 });
  pendingMint = null;
}
