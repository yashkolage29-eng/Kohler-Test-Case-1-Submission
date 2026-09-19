import { parseDraftRoom } from "@kolher/engine";
import { isDecorFixtures, isInjectionSafe, isPhotoDataUrl } from "./ai/validate.js";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { resolveStatic, streamStatic } from "./static.js";
import { createAiAdapter, type AiAdapter, type AiEnv } from "./ai/index.js";

/** POST /api/nim body bound (prototype posture: images are base64 data URLs). */
export const MAX_BODY_BYTES = 1_000_000;

export interface ServerOptions {
  /** Directory containing the built web assets (SPA root). */
  webRoot: string;
  /** AI adapter env (NIM key/base/model/timeout). Injected by tests; index.ts reads process.env. */
  aiEnv?: AiEnv;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.destroyed || res.writableEnded) return;
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(payload);
}

const proposalErrors: Record<string, { status: number; message: string }> = {
  "provider-not-configured": { status: 503, message: "AI is not configured on the server. Configure NIM and restart the server." },
  "provider-config": { status: 503, message: "AI configuration is invalid. Check the server NIM URL, model and timeout, then restart it." },
  "provider-auth": { status: 502, message: "The AI provider rejected the server's credentials. Check NIM access on the server and restart it." },
  "provider-model": { status: 502, message: "The configured AI model was not found. Check NIM_MODEL, NIM_VISION_MODEL and NIM_BASE_URL on the server." },
  "provider-rate-limit": { status: 503, message: "AI is busy — too many requests this minute. Try again shortly." },
  "provider-upstream": { status: 502, message: "The AI provider failed to answer. Try again shortly." },
  "provider-timeout": { status: 504, message: "AI took too long to respond. Try again shortly." },
  "provider-network": { status: 502, message: "Cannot reach the AI provider. Check the server network and NIM_BASE_URL." },
  "provider-malformed-output": { status: 502, message: "AI returned an invalid or incomplete answer. Try again or simplify the request." },
  "no-vision-model": { status: 503, message: "Photo recognition is not configured. Set NIM_VISION_MODEL on the server and restart it." },
  "no-openings-detected": { status: 422, message: "No doors or windows were recognised in the photo." },
};

function sendProposalError(res: ServerResponse, reason: string): void {
  const code = reason === "no-nim-key" ? "provider-not-configured" : Object.hasOwn(proposalErrors, reason) ? reason : "provider-malformed-output";
  const error = proposalErrors[code]!;
  sendJson(res, error.status, { code, error: `${error.message} Existing work is unchanged.` });
}

function readBoundedBody(req: IncomingMessage): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy(); // hard-stop oversized uploads; request never completes
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", () => resolve(null));
    req.on("close", () => resolve(null));
  });
}

/**
 * Thin HTTP app: static host + SPA fallback + bounded /api/nim boundary.
 * The engine solve NEVER happens here — it runs in-browser against the
 * in-process engine module (ADR-011). /api/nim is the T-013 adapter seam.
 */
export function createAppServer(opts: ServerOptions): Server {
  return createServer(createAppHandler(opts));
}

export function createAppHandler(opts: ServerOptions): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const webRoot = opts.webRoot;
  const ai: AiAdapter = createAiAdapter(opts.aiEnv ?? {});
  return async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const pathname = url.pathname;

    if (req.method === "GET" && pathname === "/api/nim") {
      // TODO (from T-020, closed in T-021): non-POST API hits must not fall
      // through to the SPA fallback (200 text/html) — the API seam answers JSON.
      sendJson(res, 405, { error: "method not allowed; POST /api/nim only" });
      return;
    }
    if (req.method === "POST" && pathname === "/api/nim") {
      const contentType = req.headers["content-type"] ?? "";
      if (!contentType.startsWith("application/json")) {
        sendJson(res, 415, { error: "content-type must be application/json" });
        return;
      }
      const body = await readBoundedBody(req);
      if (body === null || body.length === 0) {
        sendJson(res, 413, { error: "body missing or exceeds size bound" });
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(body.toString("utf8"));
      } catch {
        sendJson(res, 400, { error: "malformed JSON body" });
        return;
      }
      // Structured validation only; the AI adapter itself lands in T-013.
      // Until then the documented failure contract holds: offline fallback.
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        typeof (parsed as { request?: unknown }).request !== "string"
      ) {
        sendJson(res, 400, { error: "expected { request: string, image?: string }" });
        return;
      }
      // T-013 (SYS-ARCH §6.2/§6.3): the documented {request, image?} envelope is
      // extended with typed payload fields (text/image/receipt/menu) and dispatched
      // on `request` across the four AI tasks. Every path answers via the adapter,
      // which falls back to the deterministic offline twin on ANY failure — the
      // offline path must always complete the demo (ADR-013).
      const bodyObj = parsed as { request: string };
      const respondTask = <T>(task: string, r: { value: T; fallback: boolean; reason: string }): void => {
        if (r.fallback) sendJson(res, 200, { fallback: true, reason: r.reason, task, [task === "taste" ? "featureConstraints" : task === "narrate" ? "narration" : "tradeoffs"]: r.value });
        else sendJson(res, 200, { ok: true, task, [task === "taste" ? "featureConstraints" : task === "narrate" ? "narration" : "tradeoffs"]: r.value });
      };

      if (bodyObj.request === "room-edit") {
        const payload = parsed as Record<string, unknown>;
        const room = parseDraftRoom(payload.room);
        if (Object.keys(payload).some((key) => !["request", "room", "text"].includes(key)) || !room || typeof payload.text !== "string" || !payload.text.trim() || payload.text.length > 4000 || !isInjectionSafe(payload.text)) {
          sendJson(res, 400, { error: "Invalid proposal request. Check the room and brief." });
          return;
        }
        const result = await ai.proposeRoom(payload.text, room);
        if (result.value === null) { sendProposalError(res, result.reason); }
        else if (result.fallback) { sendJson(res, 200, { fallback: true, reason: result.reason, task: bodyObj.request, proposal: result.value }); }
        else { sendJson(res, 200, { ok: true, proposal: result.value }); }
        return;
      }
      if (bodyObj.request === "taste") {
        const text = typeof (parsed as { text?: unknown }).text === "string"
          ? (parsed as { text: string }).text.slice(0, 4000)
          : "";
        respondTask("taste", await ai.tasteToFeatures(text));
        return;
      }
      if (bodyObj.request === "decor") {
        const payload = parsed as Record<string, unknown>;
        if (Object.keys(payload).some((key) => !["request", "text", "fixtures"].includes(key)) || typeof payload.text !== "string" || payload.text.length > 4000 || !isDecorFixtures(payload.fixtures)) {
          sendJson(res, 400, { error: "Invalid decor request. Expected { request, text, fixtures }." });
          return;
        }
        const result = await ai.decor(payload.text, payload.fixtures);
        if (result.fallback) sendJson(res, 200, { fallback: true, reason: result.reason, task: "decor", proposal: result.value });
        else sendJson(res, 200, { ok: true, task: "decor", proposal: result.value });
        return;
      }
      if (bodyObj.request === "photo") {
        // ADR-009: the photo yields an opening proposal for user review; never applied here.
        const payload = parsed as Record<string, unknown>;
        const room = parseDraftRoom(payload.room);
        if (Object.keys(payload).some((key) => !["request", "image", "room"].includes(key)) || !room || !isPhotoDataUrl(payload.image)) {
          sendJson(res, 400, { error: "Invalid photo request. Upload a PNG or JPEG photo and check the room." });
          return;
        }
        const result = await ai.photoProposal(payload.image, room);
        if (result.value === null) sendProposalError(res, result.reason);
        else sendJson(res, 200, { ok: true, proposal: result.value });
        return;
      }
      if (bodyObj.request === "narrate") {
        const receipt = (parsed as { receipt?: unknown }).receipt;
        if (typeof receipt !== "object" || receipt === null || !Array.isArray((receipt as { topK?: unknown }).topK)) {
          sendJson(res, 400, { error: "expected receipt: DecisionReceipt-like object with topK array" });
          return;
        }
        respondTask("narrate", await ai.narr(receipt as never));
        return;
      }
      if (bodyObj.request === "tradeoffs") {
        const menu = (parsed as { menu?: unknown }).menu;
        if (
          !Array.isArray(menu) ||
          !menu.every(
            (m) =>
              typeof m === "object" &&
              m !== null &&
              typeof (m as { kind?: unknown }).kind === "string" &&
              typeof (m as { tradeoffDelta?: unknown }).tradeoffDelta === "string"
          )
        ) {
          sendJson(res, 400, { error: "expected menu: array of { kind, tradeoffDelta }" });
          return;
        }
        respondTask("tradeoffs", await ai.tradeoffs(menu as never));
        return;
      }
      sendJson(res, 400, { error: "unknown request task" });
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD, POST" });
      res.end();
      return;
    }

    // Static + SPA fallback: file hits serve directly; misses fall back to
    // index.html (documented "404 → SPA fallback" behavior).
    const headOnly = req.method === "HEAD";
    const hit = resolveStatic(webRoot, pathname);
    if (hit) {
      streamStatic(hit, res, headOnly);
      return;
    }
    const index = resolveStatic(webRoot, "/index.html");
    if (index) {
      streamStatic(index, res, headOnly);
      return;
    }
    sendJson(res, 404, { error: "no built web assets available" });
  };
}
