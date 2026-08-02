import { NextResponse, type NextRequest } from "next/server";

import { backendBase, demoToken, redact } from "@/lib/server/backend";
import { clearSession, resolveSession, SessionError } from "@/lib/server/session";

/**
 * Backend-for-frontend proxy.
 *
 * Every call the browser makes goes to this same-origin route, which attaches
 * credentials server-side and forwards to FastAPI. Two things follow from that:
 * the demo token and the tenant bearer never appear in a bundle, a script tag,
 * or a network request the browser can inspect; and the browser cannot reach
 * the API on its own terms, so the surface it can touch is exactly what is
 * allowed below.
 *
 * This layer adds no business logic. It authenticates, redacts, and forwards —
 * every number the UI renders is computed by the backend.
 */

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Demo subpaths this proxy is willing to attach the demo token to.
 *
 * The token is a privileged credential: it is what makes `/v1/demo/*` callable
 * at all. Attaching it to whatever the browser asks for hands that privilege to
 * any visitor. `/v1/demo/reset` drops and recreates every table in the shared
 * sandbox database with no tenant scoping, so a single same-origin fetch from a
 * product page destroyed every workspace on the deployment — observed live,
 * HTTP 200 in 213s. Only the scenario runner is seeding, per-tenant, and safe
 * to expose; everything else under /v1/demo is refused here.
 */
export function isAllowedDemoPath(segments: string[]): boolean {
  return segments[2] === "scenarios" && segments.length === 4;
}

/** Upstream headers worth returning. Everything else is dropped rather than
 *  relayed, so upstream server banners and cookies stay server-side. */
const PASSTHROUGH_RESPONSE_HEADERS = ["content-type"];

function problem(code: string, detail: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, detail } }, { status });
}

/**
 * Reject a mutating request whose Origin is not our own.
 *
 * The session cookie is `SameSite=Lax`, so a cross-site POST already arrives
 * without it and would fail anyway. This is the second lock: it refuses the
 * request outright rather than letting it through unauthenticated.
 */
function isCrossSite(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return false; // non-browser clients omit it entirely
  try {
    return new URL(origin).host !== request.headers.get("host");
  } catch {
    return true;
  }
}

async function proxy(
  request: NextRequest,
  context: RouteContext<"/api/credence/[...path]">,
): Promise<NextResponse> {
  const { path } = await context.params;
  const segments = path ?? [];

  if (segments.some((s) => s === "." || s === ".." || s.includes("/") || s.includes("\\"))) {
    return problem("BAD_PATH", "That request path is not valid.", 400);
  }
  if (segments[0] !== "v1") {
    // Only the versioned API is reachable. The OpenAPI document, internals, and
    // anything added to the backend outside /v1 must be exposed deliberately.
    return problem("NOT_PROXIED", "That resource is not available here.", 404);
  }
  if (MUTATING_METHODS.has(request.method) && isCrossSite(request)) {
    return problem("CROSS_SITE_BLOCKED", "That request was blocked.", 403);
  }
  if (segments[1] === "demo" && !isAllowedDemoPath(segments)) {
    // Not a 403: from the browser's side this surface simply does not exist.
    return problem("NOT_PROXIED", "That resource is not available here.", 404);
  }

  const target = `${backendBase()}/${segments.join("/")}${request.nextUrl.search}`;
  const body = MUTATING_METHODS.has(request.method) ? await request.text() : undefined;

  async function send(token: string): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      // Present on every request, demo routes included: with a bearer attached,
      // a judge scenario seeds into this visitor's own workspace and shows up
      // on their agents, vaults, and audit pages instead of a throwaway tenant.
      Authorization: `Bearer ${token}`,
    };
    const contentType = request.headers.get("content-type");
    if (contentType !== null) headers["Content-Type"] = contentType;
    if (segments[1] === "demo") headers["X-Demo-Token"] = demoToken();
    return fetch(target, {
      method: request.method,
      headers,
      body: body === "" ? undefined : body,
      cache: "no-store",
      redirect: "manual",
    });
  }

  if (segments[1] === "demo" && demoToken() === "") {
    return problem(
      "DEMO_DISABLED",
      "The demonstration surface is switched off in this deployment.",
      503,
    );
  }

  let session;
  try {
    session = await resolveSession();
  } catch (error) {
    if (error instanceof SessionError) {
      return problem(
        "WORKSPACE_UNAVAILABLE",
        "Your sandbox workspace could not be prepared. The CredenceAI service may still be starting.",
        503,
      );
    }
    return problem("SERVICE_UNAVAILABLE", "The CredenceAI service is not reachable.", 503);
  }

  let upstream: Response;
  try {
    upstream = await send(session.token);
    if (upstream.status === 401 && !session.minted) {
      // The cookie's bearer no longer exists upstream — the sandbox database
      // was reset since it was minted. A browser should not stay locked out of
      // an anonymous sandbox for the cookie's lifetime, so drop the dead
      // session and mint a fresh workspace once. `!minted` bounds the retry:
      // a token minted in this very request failing 401 is a real fault.
      await clearSession();
      session = await resolveSession();
      upstream = await send(session.token);
    }
  } catch (error) {
    if (error instanceof SessionError) {
      return problem(
        "WORKSPACE_UNAVAILABLE",
        "Your sandbox workspace could not be prepared. The CredenceAI service may still be starting.",
        503,
      );
    }
    return problem("SERVICE_UNAVAILABLE", "The CredenceAI service is not reachable.", 503);
  }

  // Audio (voice narration) is relayed as bytes: there is no JSON to parse or
  // redact, and running it through the JSON path would destroy it. Everything
  // else continues through parse-and-redact below.
  const upstreamType = upstream.headers.get("content-type") ?? "";
  if (upstreamType.startsWith("audio/")) {
    const audio = new NextResponse(upstream.body, { status: upstream.status });
    audio.headers.set("Content-Type", upstreamType);
    audio.headers.set("Cache-Control", "no-store, private");
    return audio;
  }

  const text = await upstream.text();
  if (text === "") {
    return new NextResponse(null, { status: upstream.status });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    // Upstream returned something that is not JSON — a gateway error page, a
    // stack trace. Forward the failure but not the body: unparsed upstream
    // output is exactly where internal detail leaks to a browser.
    return problem("UPSTREAM_UNREADABLE", "The CredenceAI service returned an unreadable response.", 502);
  }

  const response = NextResponse.json(redact(payload), { status: upstream.status });
  for (const name of PASSTHROUGH_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) response.headers.set(name, value);
  }
  // Tenant data is per-session and changes as scenarios run. Nothing here may
  // be held by a shared cache.
  response.headers.set("Cache-Control", "no-store, private");
  return response;
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
