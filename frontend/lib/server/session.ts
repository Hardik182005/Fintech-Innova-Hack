import "server-only";

import { cookies, headers } from "next/headers";

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
 * Coalescing of the concurrent requests that make up one visitor's first load.
 *
 * A first page load fires several data requests at once, none of them yet
 * carrying the cookie. Minting a tenant per request would scatter one visitor's
 * data across throwaway organizations, so those requests share a single mint.
 *
 * Two properties keep the share from leaking one visitor's workspace — and its
 * bearer — to a different visitor:
 *
 *  - it is keyed by the client, not global, so two browsers never collide
 *    unless they share an address *and* an identical user-agent, and
 *  - it lasts only while the mint is actually in flight (a single backend
 *    round trip), not for a fixed wall-clock window afterwards.
 *
 * That is a narrow residual race, not a closed one: two identical clients
 * behind one NAT that both arrive cookieless inside the same round trip would
 * still share a sandbox. Closing it entirely means establishing the cookie on
 * the document request before any data request is issued.
 */
const mintsInFlight = new Map<string, Promise<string>>();

/**
 * A coarse per-visitor key. Only ever used to group one visitor's own
 * simultaneous first requests; it is not an identity and grants nothing.
 */
async function clientKey(): Promise<string> {
  const h = await headers();
  // Cloud Run appends the real client address as the last XFF entry.
  const forwarded = h.get("x-forwarded-for") ?? "";
  const address = forwarded.split(",").pop()?.trim() ?? "";
  return `${address}|${h.get("user-agent") ?? ""}`;
}

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

  const key = await clientKey();
  let inflight = mintsInFlight.get(key);
  if (inflight === undefined) {
    inflight = mintSandboxTenant();
    mintsInFlight.set(key, inflight);
    // Release the slot as soon as the round trip ends, however it ends: the
    // share exists to group one burst, and a failed mint must not be replayed
    // to the next visitor.
    void inflight.finally(() => {
      if (mintsInFlight.get(key) === inflight) mintsInFlight.delete(key);
    });
  }

  const token = await inflight;

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
}
