import { describe, expect, it } from "vitest";

import { isAllowedDemoPath } from "./route";

/**
 * Regression for a live incident. The proxy attaches the privileged demo token
 * to `/v1/demo/*` requests on the browser's behalf, which made
 * `/v1/demo/reset` — an unscoped `drop_all()` over the shared sandbox database
 * — reachable with one same-origin fetch from a product page. Every workspace
 * on the deployment was destroyed (observed live: HTTP 200 in 213s).
 *
 * The scenario runner is the only demo path a visitor has any business
 * reaching. Everything else under /v1/demo stays closed, including paths that
 * do not exist yet: a new destructive endpoint must not become browser-callable
 * merely by being added to the backend.
 */

const seg = (path: string) => path.split("/").filter(Boolean);

describe("isAllowedDemoPath", () => {
  it("refuses the reset that dropped the database", () => {
    expect(isAllowedDemoPath(seg("v1/demo/reset"))).toBe(false);
  });

  it("allows running one named judge scenario", () => {
    expect(isAllowedDemoPath(seg("v1/demo/scenarios/happy-path"))).toBe(true);
    expect(isAllowedDemoPath(seg("v1/demo/scenarios/task-failure"))).toBe(true);
  });

  it("refuses demo paths the backend has not grown yet", () => {
    expect(isAllowedDemoPath(seg("v1/demo/seed"))).toBe(false);
    expect(isAllowedDemoPath(seg("v1/demo/wipe"))).toBe(false);
    expect(isAllowedDemoPath(seg("v1/demo"))).toBe(false);
  });

  it("refuses anything deeper or shallower than one named scenario", () => {
    expect(isAllowedDemoPath(seg("v1/demo/scenarios"))).toBe(false);
    expect(isAllowedDemoPath(seg("v1/demo/scenarios/happy-path/reset"))).toBe(false);
  });
});
