// NIM client (T-013, ADR-013): OpenAI-compatible chat-completions POST via global
// fetch, with AbortController timeout. Returns the parsed JSON content or null on
// ANY failure (non-2xx, timeout, bad JSON). The API key NEVER appears in errors,
// logs, or returned values — secrets stay server-side only.

// Two independent rolling 60 s windows keep total NIM traffic (10 + 25 = 35/min)
// under the provider's hard 40 RPM limit. Décor gets its own small pool so taste
// iteration can never starve room edits, photos, narration or tradeoffs. No retries.
export const NIM_WINDOW_MS = 60_000;
export const NIM_DECOR_MAX_PER_WINDOW = 10;
export const NIM_GENERAL_MAX_PER_WINDOW = 25;
export type NimPool = "decor" | "general";

const poolLimits: Record<NimPool, number> = { decor: NIM_DECOR_MAX_PER_WINDOW, general: NIM_GENERAL_MAX_PER_WINDOW };
const requestStarts: Record<NimPool, number[]> = { decor: [], general: [] };

function reserveRequest(pool: NimPool): boolean {
  const starts = requestStarts[pool];
  const now = Date.now();
  while (starts.length && now - starts[0]! >= NIM_WINDOW_MS) {
    starts.shift();
  }
  if (starts.length >= poolLimits[pool]) return false;
  starts.push(now);
  return true;
}

/** Test-only: empty both request windows. */
export function resetNimWindowsForTests(): void {
  requestStarts.decor.length = 0;
  requestStarts.general.length = 0;
}

export interface NimClientOptions {
  nimApiKey: string;
  nimBaseUrl: string;
  nimModel: string;
  nimTimeoutMs: number;
  fetchImpl: typeof fetch;
}

export type NimFailure = "provider-config" | "provider-auth" | "provider-model" | "provider-rate-limit" | "provider-upstream" | "provider-timeout" | "provider-network" | "provider-malformed-output";
export type NimResult = { ok: true; content: string } | { ok: false; reason: NimFailure };

export type NimUserContent = string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;

/** `opts.nimModel` is per call: callers pass the vision model for image content. */
export async function nimRequest(
  opts: NimClientOptions,
  userPrompt: NimUserContent,
  systemPrompt: string,
  maxTokens: number,
  pool: NimPool = "general"
): Promise<NimResult> {
  if (!opts.nimModel.trim() || !Number.isFinite(opts.nimTimeoutMs) || opts.nimTimeoutMs <= 0 || opts.nimTimeoutMs > 120_000) return { ok: false, reason: "provider-config" };
  try {
    const url = new URL(opts.nimBaseUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return { ok: false, reason: "provider-config" };
  } catch {
    return { ok: false, reason: "provider-config" };
  }
  if (!reserveRequest(pool)) return { ok: false, reason: "provider-rate-limit" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.nimTimeoutMs);
  try {
    const res = await opts.fetchImpl(`${opts.nimBaseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.nimApiKey}`,
      },
      body: JSON.stringify({
        model: opts.nimModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature: 0,
        // Nemotron models reason by default (slow, and reasoning can exhaust max_tokens
        // before any JSON is emitted); the app needs the direct answer only.
        chat_template_kwargs: { enable_thinking: false },
      }),
    });
    if (!res.ok) {
      await res.body?.cancel();
      return { ok: false, reason: res.status === 401 || res.status === 403 ? "provider-auth" : res.status === 404 ? "provider-model" : res.status === 429 ? "provider-rate-limit" : "provider-upstream" };
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return { ok: false, reason: controller.signal.aborted ? "provider-timeout" : "provider-malformed-output" };
    }
    const choice = (json as { choices?: Array<{ finish_reason?: string; message?: { content?: unknown } }> })?.choices?.[0];
    const content = choice?.message?.content;
    return typeof content === "string" && content.trim() && choice?.finish_reason !== "length"
      ? { ok: true, content }
      : { ok: false, reason: "provider-malformed-output" };
  } catch {
    return { ok: false, reason: controller.signal.aborted ? "provider-timeout" : "provider-network" };
  } finally {
    clearTimeout(timer);
  }
}

export async function nimComplete(opts: NimClientOptions, userPrompt: string, systemPrompt: string, maxTokens: number): Promise<string | null> {
  const result = await nimRequest(opts, userPrompt, systemPrompt, maxTokens);
  return result.ok ? result.content : null;
}
