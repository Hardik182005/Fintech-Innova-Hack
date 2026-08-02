import { NextResponse, type NextRequest } from "next/server";

import { CANNED, SYSTEM_PROMPT, factFallback } from "@/lib/orb-knowledge";

/**
 * The page assistant.
 *
 * Deliberately not routed through app/api/credence: that proxy carries the
 * tenant bearer and the demo token, and this endpoint needs neither. The orb
 * reads nothing, writes nothing, and is never given a session — so a prompt
 * injected into a visitor's message has nothing to reach for. Keeping it on its
 * own route is what makes that true by construction rather than by review.
 *
 * Three tiers answer, in order: a canned reply, the model, then the fact
 * fallback. Every response reports which one produced it in `source`, because
 * "the model said it" and "a lookup table said it" are different claims and the
 * UI should not present them as the same.
 */

const DEFAULT_MODEL = "gemma3:4b";
const DEFAULT_OLLAMA = "http://localhost:11434";

/** A visitor waits a couple of seconds for a chat bubble, not a minute. If the
 *  model has not answered by then the fact fallback is a better response than a
 *  spinner, so the deadline is short and failure is not an error state. */
const MODEL_TIMEOUT_MS = 12_000;

/** Long enough for a real question, short enough that the prompt cannot be
 *  padded with instructions until the grounding rules fall out of context. */
const MAX_MESSAGE_CHARS = 600;

type Source = "canned" | "model" | "facts";

function reply(text: string, source: Source, status = 200): NextResponse {
  const response = NextResponse.json({ reply: text, source }, { status });
  response.headers.set("Cache-Control", "no-store, private");
  return response;
}

function orbModel(): string {
  return process.env.CREDENCE_ORB_MODEL ?? DEFAULT_MODEL;
}

/**
 * Where the chat model is served.
 *
 * Not `NEXT_PUBLIC_` — the browser talks to this route, never to Ollama, so the
 * inference host stays server configuration and is not in the bundle. When it
 * is unset the orb runs on the fact fallback alone, which is the deployed
 * state: the GPU service in the sandbox is IAM-locked to the API and holds one
 * loaded model, so pointing the orb at it would evict the analyst model and put
 * a cold start in front of somebody typing "hi".
 */
function ollamaBase(): string | null {
  const raw = process.env.CREDENCE_ORB_OLLAMA_URL;
  if (raw === undefined || raw.trim() === "") return null;
  return raw.replace(/\/+$/, "");
}

async function askModel(message: string): Promise<string | null> {
  const base = ollamaBase();
  if (base === null) return null;

  const abort = AbortSignal.timeout(MODEL_TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: orbModel(),
        stream: false,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: message },
        ],
        options: {
          // Low temperature because the job is recall of supplied facts, not
          // invention; a small num_predict keeps the reply to the two or three
          // sentences the system prompt asks for even if the model rambles.
          temperature: 0.3,
          num_predict: 220,
          num_ctx: 4096,
        },
      }),
      signal: abort,
      cache: "no-store",
    });
  } catch {
    return null; // unreachable, or slower than a visitor will wait
  }

  if (!upstream.ok) return null;

  try {
    const payload = (await upstream.json()) as { message?: { content?: unknown } };
    const content = payload.message?.content;
    if (typeof content !== "string") return null;
    // Small models like to open with a preamble line and close with markdown
    // emphasis. Strip both rather than ship them into a plain-text bubble.
    const cleaned = content.replace(/[*_`#]/g, "").trim();
    return cleaned === "" ? null : cleaned;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply("I could not read that. Try typing it again?", "facts", 400);
  }

  const message = (body as { message?: unknown })?.message;
  if (typeof message !== "string" || message.trim() === "") {
    return reply("Ask me something about this page and I'll do my best.", "facts", 400);
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return reply(
      "That's a bit long for me. Could you ask it in a sentence or two?",
      "facts",
      413,
    );
  }

  const trimmed = message.trim();

  const canned = CANNED.find((c) => c.match.test(trimmed));
  if (canned !== undefined) return reply(canned.reply, "canned");

  const answered = await askModel(trimmed);
  if (answered !== null) return reply(answered, "model");

  const fallback = factFallback(trimmed);
  if (fallback !== null) return reply(fallback, "facts");

  return reply(
    "I don't know that one — I only answer from what this page states. Try asking about the vault, the repayment order, the agent passport, or the sandbox disclosure.",
    "facts",
  );
}
