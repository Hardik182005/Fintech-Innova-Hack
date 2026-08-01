import * as React from "react";

/**
 * The spoken-script block under the "Listen to this decision" control.
 *
 * Purely presentational. It shows exactly the text the backend composes and
 * speaks — nothing is rephrased client-side, so what the user reads is what
 * the voice says — plus, when narration fails, one calm fallback sentence.
 * Voice is optional by design, so an error here is muted information, never
 * a broken screen.
 */

export const VOICE_UNAVAILABLE_MESSAGE = "Voice narration is not available right now";

export function NarrationScript({ text, error }: { text: string | null; error: string | null }) {
  if (text === null && error === null) return null;
  return (
    <div className="space-y-1.5">
      {text !== null && (
        <p className="max-w-2xl rounded-lg border border-line-soft bg-surface-muted px-3 py-2 text-xs leading-relaxed text-muted">
          {text}
        </p>
      )}
      {error !== null && (
        <p role="status" className="text-xs text-muted">
          {error}
        </p>
      )}
    </div>
  );
}
