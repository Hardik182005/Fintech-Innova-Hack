import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NarrationScript, VOICE_UNAVAILABLE_MESSAGE } from "./narration-script";

/**
 * The rule these pin: the script block shows exactly the text the backend
 * composed — never a client-side paraphrase — and voice failure is one muted
 * sentence, never a broken or empty-looking section.
 */

const SCRIPT =
  "This credit application was approved. The approved limit is 1,000 rupees in test credits. " +
  "The AI recommends. Deterministic systems decide. Financial controls enforce.";

describe("NarrationScript", () => {
  it("renders nothing when there is no script and no error", () => {
    const { container } = render(<NarrationScript text={null} error={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the backend's script verbatim", () => {
    render(<NarrationScript text={SCRIPT} error={null} />);
    expect(screen.getByText(SCRIPT)).toBeInTheDocument();
  });

  it("shows the fallback sentence when narration is unavailable", () => {
    render(<NarrationScript text={null} error={VOICE_UNAVAILABLE_MESSAGE} />);
    expect(screen.getByRole("status")).toHaveTextContent(VOICE_UNAVAILABLE_MESSAGE);
  });

  it("keeps the script visible when only the audio failed", () => {
    render(<NarrationScript text={SCRIPT} error={VOICE_UNAVAILABLE_MESSAGE} />);
    expect(screen.getByText(SCRIPT)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(VOICE_UNAVAILABLE_MESSAGE);
  });
});
