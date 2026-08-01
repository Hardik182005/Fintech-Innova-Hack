"use client";

import * as React from "react";
import { Volume2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { NarrationScript, VOICE_UNAVAILABLE_MESSAGE } from "@/components/voice/narration-script";
import { fetchDecisionNarration } from "@/lib/api";
import { useDecisionScript, useVoiceStatus } from "@/lib/queries";

/**
 * Optional voice narration of a credit decision.
 *
 * Renders nothing at all unless the backend confirms voice is enabled, and
 * degrades to a one-line message on any failure — the decision screen never
 * depends on this. On listen, the composed script is fetched and shown so the
 * user sees exactly what is spoken, and the audio arrives as bytes through
 * the same-origin proxy (no provider, key, or URL is visible to the browser).
 */

export function DecisionNarration({ applicationId }: { applicationId: string }) {
  const status = useVoiceStatus();
  const [requested, setRequested] = React.useState(false);
  const script = useDecisionScript(applicationId, { enabled: requested });
  const [fetching, setFetching] = React.useState(false);
  const [audioError, setAudioError] = React.useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const urlRef = React.useRef<string | null>(null);

  // Stop playback and release the object URL when the page moves on.
  React.useEffect(
    () => () => {
      audioRef.current?.pause();
      if (urlRef.current !== null) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  // Voice off, status unknown, or status failed: render nothing at all.
  if (status.data?.enabled !== true) return null;

  const listen = async () => {
    setRequested(true); // reveals the script block via useDecisionScript
    setAudioError(null);
    setFetching(true);
    try {
      const blob = await fetchDecisionNarration(applicationId);
      audioRef.current?.pause();
      if (urlRef.current !== null) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      await audio.play();
    } catch {
      // 503 VOICE_UNAVAILABLE, network faults, autoplay refusals — all the
      // same to the user: the text on screen remains the decision.
      setAudioError(VOICE_UNAVAILABLE_MESSAGE);
    } finally {
      setFetching(false);
    }
  };

  return (
    <div className="mt-3 space-y-2">
      <Button variant="secondary" size="sm" onClick={() => void listen()} disabled={fetching}>
        <Volume2 /> {fetching ? "Preparing narration…" : "Listen to this decision"}
      </Button>
      <NarrationScript
        text={script.data?.text ?? null}
        error={audioError ?? (script.isError ? VOICE_UNAVAILABLE_MESSAGE : null)}
      />
    </div>
  );
}
