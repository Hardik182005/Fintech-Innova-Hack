import { describe, expect, it } from "vitest";

import { REDACTED, backendBase, redact } from "./backend";

/**
 * The proxy's redaction is the last thing standing between a backend response
 * and the browser. These tests pin the cases that would otherwise ship a
 * credential: the shape the backend actually returns when it mints a tenant,
 * and the shapes a future endpoint might return it in.
 */

describe("redact", () => {
  it("strips the bearer the backend echoes when creating an organization", () => {
    const upstream = {
      organization_id: "org_abc",
      owner_user_id: "usr_abc",
      owner_api_token: "cred_sk_realSecretValue",
      note: "sandbox tenant — test credits only",
    };

    expect(redact(upstream)).toEqual({
      organization_id: "org_abc",
      owner_user_id: "usr_abc",
      owner_api_token: REDACTED,
      note: "sandbox tenant — test credits only",
    });
  });

  it("reaches secrets nested inside a scenario result", () => {
    const upstream = {
      scenario: "happy-path",
      seed: { agent_id: "agt_1", owner_api_token: "cred_sk_nested" },
    };

    const out = redact(upstream) as { seed: { agent_id: string; owner_api_token: string } };
    expect(out.seed.owner_api_token).toBe(REDACTED);
    expect(out.seed.agent_id).toBe("agt_1");
  });

  it("reaches secrets inside arrays", () => {
    const out = redact({ items: [{ id: "a", api_token: "cred_sk_x" }] }) as {
      items: { id: string; api_token: string }[];
    };
    expect(out.items[0]).toEqual({ id: "a", api_token: REDACTED });
  });

  it("matches key names case-insensitively", () => {
    const out = redact({ Owner_API_Token: "cred_sk_y" }) as Record<string, string>;
    expect(out.Owner_API_Token).toBe(REDACTED);
  });

  it("leaves an absent secret absent rather than inventing a redaction", () => {
    // Seeding into an existing tenant returns null here: no token was minted,
    // so there is nothing to withhold. Rendering "[redacted]" would claim a
    // secret exists where none does.
    const out = redact({ seed: { owner_api_token: null } }) as {
      seed: { owner_api_token: null };
    };
    expect(out.seed.owner_api_token).toBeNull();
  });

  it("passes through the financial payload untouched", () => {
    // Redaction must never alter a figure. Money is integer minor units and a
    // coerced value here would be a wrong number on screen.
    const upstream = {
      vault_id: "vlt_1",
      total_limit_minor: 5_000_000,
      remaining_minor: 0,
      frozen_reason: null,
      allocations: [{ step: "PRINCIPAL", amount_minor: 4_200_000 }],
      integrity: { ledger_balanced: true, first_broken_seq: null },
    };
    expect(redact(upstream)).toEqual(upstream);
  });

  it("does not confuse a hash or an identifier for a secret", () => {
    // Content hashes and chain hashes are meant to be shown: they are how a
    // reviewer verifies the audit trail.
    const upstream = {
      event_hash: "9f2c...",
      prev_hash: "aa10...",
      receipt_hash: "bb42...",
      content_hash: "cc99...",
      passport_nonce: "abc",
      model_version_hash: "sha256:1234",
    };
    expect(redact(upstream)).toEqual(upstream);
  });

  it("handles primitives and null without throwing", () => {
    expect(redact(null)).toBeNull();
    expect(redact(42)).toBe(42);
    expect(redact("plain")).toBe("plain");
    expect(redact([])).toEqual([]);
  });
});

describe("backendBase", () => {
  it("has no NEXT_PUBLIC_ variable behind it", () => {
    // A NEXT_PUBLIC_ name is inlined into the browser bundle. The API location
    // and every credential beside it must stay server configuration.
    expect(Object.keys(process.env).filter((k) => k.startsWith("NEXT_PUBLIC_CREDENCE"))).toEqual(
      [],
    );
  });

  it("trims a trailing slash so joined paths never double up", () => {
    const original = process.env.CREDENCE_API_BASE;
    process.env.CREDENCE_API_BASE = "http://example.test:8001/";
    expect(backendBase()).toBe("http://example.test:8001");
    process.env.CREDENCE_API_BASE = original;
  });
});
