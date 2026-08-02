import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What these pin is the one place in the product where a person moves an
 * amount.
 *
 * The form sent every approval as `{action: "APPROVE", approved_limit_minor}`.
 * The API declares no `approved_limit_minor`, so Pydantic dropped it,
 * `amount_minor` defaulted to 0, and APPROVE means "grant the engine's cap".
 * A reviewer who typed a REDUCED limit therefore granted the full cap, and
 * the form showed "Decision recorded and anchored in the audit chain".
 *
 * So: an untouched figure is an APPROVE, and any other figure travels as the
 * number the reviewer actually typed.
 */

const mutate = vi.fn();

vi.mock("@/lib/queries", () => ({
  useReviewApplication: () => ({
    mutate,
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
  }),
}));

const { ReviewControls } = await import("./review-controls");

const ENGINE_LIMIT = 100_000; // ₹1,000.00

function setup() {
  render(
    <ReviewControls
      applicationId="app_test"
      requestedMinor={150_000}
      engineLimitMinor={ENGINE_LIMIT}
    />,
  );
  return {
    amount: screen.getByLabelText(/approved limit/i),
    approve: screen.getByRole("button", { name: /approve/i }),
    reject: screen.getByRole("button", { name: /reject/i }),
  };
}

describe("ReviewControls", () => {
  beforeEach(() => mutate.mockClear());

  it("sends a plain APPROVE when the engine's figure is left alone", () => {
    const { approve } = setup();
    fireEvent.click(approve);
    expect(mutate).toHaveBeenCalledWith({ action: "APPROVE" });
  });

  it("sends a lowered figure as a REDUCE carrying that amount", () => {
    const { amount, approve } = setup();
    fireEvent.change(amount, { target: { value: "400" } }); // ₹400.00
    fireEvent.click(approve);

    expect(mutate).toHaveBeenCalledWith({ action: "REDUCE", amount_minor: 40_000 });
    // The old field name is what made the reduction vanish server-side.
    expect(mutate.mock.calls[0][0]).not.toHaveProperty("approved_limit_minor");
  });

  it("does not quietly round a raised figure down to the cap", () => {
    // Above the cap the API refuses with POLICY_DENIED and the error shows.
    // Sending this as APPROVE would instead grant the cap and report success.
    const { amount, approve } = setup();
    fireEvent.change(amount, { target: { value: "5000" } });
    fireEvent.click(approve);

    expect(mutate).toHaveBeenCalledWith({ action: "REDUCE", amount_minor: 500_000 });
  });

  it("carries notes, and never an amount, on a rejection", () => {
    const { amount, reject } = setup();
    fireEvent.change(amount, { target: { value: "400" } });
    fireEvent.change(screen.getByLabelText(/notes/i), { target: { value: "not viable" } });
    fireEvent.click(reject);

    expect(mutate).toHaveBeenCalledWith({ action: "REJECT", notes: "not viable" });
  });
});
