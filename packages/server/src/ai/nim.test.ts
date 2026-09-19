import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NIM_DECOR_MAX_PER_WINDOW, NIM_GENERAL_MAX_PER_WINDOW, nimComplete, nimRequest, resetNimWindowsForTests, type NimClientOptions } from "./nim.js";

beforeEach(() => {
  resetNimWindowsForTests();
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => vi.useRealTimers());

function okFetch() {
  return vi.fn(async (_url: unknown, _init?: RequestInit) => new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] })));
}
function opts(fetchImpl: typeof fetch, extra: Partial<NimClientOptions> = {}): NimClientOptions {
  return { nimApiKey: "test", nimBaseUrl: "https://example.test", nimModel: "test", nimTimeoutMs: 1000, fetchImpl, ...extra };
}

describe("NIM request pools (hard 40 RPM provider limit)", () => {
  it("pool sizes sum below 40/min", () => {
    expect(NIM_DECOR_MAX_PER_WINDOW).toBe(10);
    expect(NIM_GENERAL_MAX_PER_WINDOW).toBe(25);
    expect(NIM_DECOR_MAX_PER_WINDOW + NIM_GENERAL_MAX_PER_WINDOW).toBeLessThan(40);
  });

  it("11th decor call in the window is rate-limited without consuming the general pool", async () => {
    const fetchImpl = okFetch();
    const o = opts(fetchImpl as unknown as typeof fetch);
    const decor = await Promise.all(Array.from({ length: 11 }, () => nimRequest(o, "x", "s", 10, "decor")));
    expect(decor.filter((r) => r.ok)).toHaveLength(10);
    expect(decor[10]).toEqual({ ok: false, reason: "provider-rate-limit" });
    expect(fetchImpl).toHaveBeenCalledTimes(10);
    const general = await Promise.all(Array.from({ length: 25 }, () => nimRequest(o, "x", "s", 10)));
    expect(general.every((r) => r.ok)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(35);
  });

  it("26th general call is denied; nimComplete uses the general pool; windows slide", async () => {
    const fetchImpl = okFetch();
    const o = opts(fetchImpl as unknown as typeof fetch);
    const results = await Promise.all(Array.from({ length: 30 }, () => nimComplete(o, "x", "s", 10)));
    expect(results.filter((v) => v === "ok")).toHaveLength(25);
    expect(await nimRequest(o, "x", "s", 10)).toEqual({ ok: false, reason: "provider-rate-limit" });
    expect((await nimRequest(o, "x", "s", 10, "decor")).ok).toBe(true);
    vi.setSystemTime(59_999);
    expect(await nimComplete(o, "x", "s", 10)).toBeNull();
    vi.setSystemTime(60_000);
    expect(await nimComplete(o, "x", "s", 10)).toBe("ok");
    expect(fetchImpl).toHaveBeenCalledTimes(27);
  });

  it("counts failed requests and expires each reservation independently", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("network failure"); });
    const o = opts(fetchImpl as unknown as typeof fetch);
    const call = () => nimComplete(o, "x", "s", 10);
    await Promise.all(Array.from({ length: 15 }, call));
    vi.setSystemTime(30_000);
    await Promise.all(Array.from({ length: 10 }, call));
    await call();
    expect(fetchImpl).toHaveBeenCalledTimes(25);
    vi.setSystemTime(60_000);
    await Promise.all(Array.from({ length: 16 }, call));
    expect(fetchImpl).toHaveBeenCalledTimes(40);
    vi.setSystemTime(89_999);
    await call();
    expect(fetchImpl).toHaveBeenCalledTimes(40);
    vi.setSystemTime(90_000);
    await call();
    expect(fetchImpl).toHaveBeenCalledTimes(41);
  });

  it("maps upstream 429 to provider-rate-limit with a single attempt (no retries)", async () => {
    const fetchImpl = vi.fn(async () => new Response("slow down", { status: 429 }));
    expect(await nimRequest(opts(fetchImpl as unknown as typeof fetch), "x", "s", 10, "decor")).toEqual({ ok: false, reason: "provider-rate-limit" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("NIM request body", () => {
  it("sends multimodal user content and the per-call model override", async () => {
    const fetchImpl = okFetch();
    const content = [
      { type: "text" as const, text: "walls" },
      { type: "image_url" as const, image_url: { url: "data:image/png;base64,AAAA" } },
    ];
    await nimRequest(opts(fetchImpl as unknown as typeof fetch, { nimModel: "vision-model" }), content, "sys", 1500);
    const body = JSON.parse(String(fetchImpl.mock.calls[0]![1]!.body)) as Record<string, unknown>;
    expect(body.model).toBe("vision-model");
    expect(body.max_tokens).toBe(1500);
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(body.messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content },
    ]);
  });
});
