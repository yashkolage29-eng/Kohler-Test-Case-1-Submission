import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createAppServer, MAX_BODY_BYTES } from "./http.js";

let server: Server;
let baseUrl: string;
let webRoot: string;

beforeAll(async () => {
  webRoot = mkdtempSync(path.join(tmpdir(), "kolher-web-"));
  writeFileSync(
    path.join(webRoot, "index.html"),
    "<!doctype html><title>app</title><div id=root></div>"
  );
  writeFileSync(path.join(webRoot, "app.js"), "console.log('app');\n");
  mkdirSync(path.join(webRoot, "secret"));
  writeFileSync(path.join(webRoot, "secret", "key.pem"), "leak"); // .pem not on MIME allowlist
  writeFileSync(path.join(webRoot, "data.bin"), "binary-not-allowlisted");

  server = createAppServer({ webRoot });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(webRoot, { recursive: true, force: true });
});

async function req(
  method: string,
  urlPath: string,
  init: { headers?: Record<string, string>; body?: string } = {}
): Promise<{ status: number; contentType: string; text: string }> {
  const res = await fetch(baseUrl + urlPath, {
    method,
    headers: init.headers,
    body: init.body,
  });
  return {
    status: res.status,
    contentType: res.headers.get("content-type") ?? "",
    text: await res.text(),
  };
}

describe("static host", () => {
  it("serves built assets with correct content type", async () => {
    const r = await req("GET", "/app.js");
    expect(r.status).toBe(200);
    expect(r.contentType).toContain("text/javascript");
    expect(r.text).toContain("console.log");
  });

  it("falls back to index.html for SPA routes", async () => {
    const r = await req("GET", "/some/client/route");
    expect(r.status).toBe(200);
    expect(r.contentType).toContain("text/html");
    expect(r.text).toContain('id=root');
  });

  it("serves the root as index.html", async () => {
    const r = await req("GET", "/");
    expect(r.status).toBe(200);
    expect(r.contentType).toContain("text/html");
  });
});

describe("path traversal guards", () => {
  it("rejects encoded traversal above the root", async () => {
    const r = await req("GET", "/%2e%2e%2f%2e%2e%2fpackage.json");
    // Must never serve anything outside webRoot: SPA fallback or 404, not the file.
    expect(r.text).not.toContain("workspaces");
    expect(r.status).toBe(200); // SPA fallback, index.html only
    expect(r.contentType).toContain("text/html");
  });

  it("rejects null-byte and plain .. paths", async () => {
    for (const p of ["/..%2f..%2fsecret", "/%00", "/../secret/key.pem"]) {
      const r = await req("GET", p);
      expect(r.text).not.toContain("leak");
    }
  });

  it("does not serve files inside the root via dot-segment smuggling", async () => {
    const r = await req("GET", "/secret/../app.js");
    expect(r.status).toBe(200);
    expect(r.text).toContain("console.log"); // normalizes inside root — fine
    const bad = await req("GET", "/secret/..%2f..%2fsecret%2fkey.txt");
    expect(bad.text).not.toContain("leak");
  });

  it("rejects non-allowlisted extensions", async () => {
    const r = await req("GET", "/data.bin");
    expect(r.status).toBe(200); // SPA fallback — .bin never served as a file
    expect(r.contentType).toContain("text/html");
  });
});

describe("bounded request parsing", () => {
  it("answers a taste task offline with the deterministic twin", async () => {
    const r = await req("POST", "/api/nim", {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ request: "taste", text: "modern minimal bathroom" }),
    });
    expect(r.status).toBe(200);
    const json = JSON.parse(r.text) as { fallback: boolean; reason: string; featureConstraints: unknown };
    expect(json.fallback).toBe(true);
    expect(typeof json.reason).toBe("string");
    // "modern minimal" hits no closed-vocab keyword → null constraints, still 2xx
    // (the demo path must always complete; documented empty/null design).
    expect(json.featureConstraints).toBeNull();
  });

  it("rejects an unknown request task with 400", async () => {
    const r = await req("POST", "/api/nim", {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ request: "modern minimal bathroom" }),
    });
    expect(r.status).toBe(400);
  });

  it("rejects oversized bodies without responding with data", async () => {
    const big = "x".repeat(MAX_BODY_BYTES + 1);
    // The server hard-destroys the connection on overflow, so fetch may either
    // reject outright or surface a truncated/413 response — both are safe.
    let leaked = false;
    try {
      const res = await fetch(baseUrl + "/api/nim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ request: big }),
      });
      const text = await res.text();
      leaked = text.includes(big.slice(0, 100));
    } catch {
      // connection destroyed — the desired outcome
    }
    expect(leaked).toBe(false);
  });

  it("rejects non-JSON content type and malformed JSON", async () => {
    const ct = await req("POST", "/api/nim", {
      headers: { "content-type": "text/plain" },
      body: "hello",
    });
    expect(ct.status).toBe(415);
    const bad = await req("POST", "/api/nim", {
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    expect(bad.status).toBe(400);
  });

  it("rejects structurally invalid JSON payloads", async () => {
    const r = await req("POST", "/api/nim", {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ norequest: true }),
    });
    expect(r.status).toBe(400);
  });
});

describe("method and offline behavior", () => {
  it("rejects unsupported methods", async () => {
    const r = await req("DELETE", "/app.js");
    expect(r.status).toBe(405);
  });

  it("starts offline with no network, key, or engine round-trip", async () => {
    // The server is already running against a plain tmp dir with no catalog,
    // no engine solve, and no AI key — offline start is proven by construction.
    const r = await req("GET", "/");
    expect(r.status).toBe(200);
  });
});

describe("T-013 /api/nim AI tasks (no-network, all four tasks offline)", () => {
  const post = (body: unknown): Promise<{ status: number; text: string }> =>
    req("POST", "/api/nim", { headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  it("taste maps closed-vocab keywords offline", async () => {
    const r = await post({ request: "taste", text: "rain shower and smart toilet in matte black" });
    expect(r.status).toBe(200);
    const json = JSON.parse(r.text) as { fallback: boolean; featureConstraints: { requiredFeatures: string[]; finishFamilies: string[] } };
    expect(json.fallback).toBe(true); // this server has no NIM key
    expect(json.featureConstraints.requiredFeatures).toEqual(["rain_shower", "smart"]);
    expect(json.featureConstraints.finishFamilies).toEqual(["matte_black"]);
  });

  it("photo without a room is rejected; with a room it reports unconfigured AI", async () => {
    expect((await post({ request: "photo", image: "data:image/png;base64,AAAA" })).status).toBe(400);
    const room = { polygon: { vertices: [{ x: 0, y: 0 }, { x: 2400, y: 0 }, { x: 2400, y: 1800 }, { x: 0, y: 1800 }], ccw: true, wallThicknessMm: 100 }, openings: [], confirmed: false };
    const r = await post({ request: "photo", image: "data:image/png;base64,AAAA", room });
    expect(r.status).toBe(503);
    expect((JSON.parse(r.text) as { code: string }).code).toBe("provider-not-configured");
  });

  it("narrate validates receipt shape and answers offline", async () => {
    const bad = await post({ request: "narrate", receipt: { noTopK: true } });
    expect(bad.status).toBe(400);
    const ok = await post({ request: "narrate", receipt: { topK: [] } });
    expect(ok.status).toBe(200);
    const json = JSON.parse(ok.text) as { fallback: boolean; narration: string };
    expect(json.fallback).toBe(true);
    expect(typeof json.narration).toBe("string");
  });

  it("tradeoffs validates menu shape and answers offline", async () => {
    const bad = await post({ request: "tradeoffs", menu: [{ wrong: true }] });
    expect(bad.status).toBe(400);
    const ok = await post({ request: "tradeoffs", menu: [{ kind: "raise-budget", tradeoffDelta: "budget rises by 18,000 INR" }] });
    expect(ok.status).toBe(200);
    const json = JSON.parse(ok.text) as { fallback: boolean; tradeoffs: string[] };
    expect(json.fallback).toBe(true);
    expect(json.tradeoffs[0]).toContain("18,000 INR");
  });
});

describe("T-013 secrets and NIM-configured fallback", () => {
  const KEY = "nvapi-sk-ENDPOINT-SECRET";
  let aiServer: Server;
  let aiBaseUrl: string;

  beforeAll(async () => {
    aiServer = createAppServer({
      webRoot,
      aiEnv: {
        nimApiKey: KEY,
        // Always-failing fetch: every NIM path must fall back to the offline twin.
        fetchImpl: async () => new Response("denied", { status: 401 }),
      },
    });
    await new Promise<void>((resolve) => aiServer.listen(0, "127.0.0.1", resolve));
    aiBaseUrl = `http://127.0.0.1:${(aiServer.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => aiServer.close(() => resolve()));
  });

  it("falls back on NIM failure and never echoes the key in any response body", async () => {
    const bodies: string[] = [];
    for (const body of [
      { request: "taste", text: "matte black rain shower" },
      { request: "photo" },
      { request: "narrate", receipt: { topK: [] } },
      { request: "tradeoffs", menu: [{ kind: "raise-budget", tradeoffDelta: "up by 18,000 INR" }] },
      { request: "unknown-task" },
      { norequest: true },
    ]) {
      const res = await fetch(aiBaseUrl + "/api/nim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      bodies.push(await res.text());
    }
    for (const b of bodies) expect(b).not.toContain(KEY);
    const taste = JSON.parse(bodies[0]) as { fallback: boolean; featureConstraints: unknown };
    expect(taste.fallback).toBe(true); // NIM failed → offline twin still completes the demo
    expect(taste.featureConstraints).not.toBeNull();
    // oversized image body still 413/destroyed under the configured server too
    const big = "x".repeat(MAX_BODY_BYTES + 1);
    let destroyed = false;
    try {
      const res = await fetch(aiBaseUrl + "/api/nim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ request: "photo", image: big }),
      });
      destroyed = res.status === 413;
    } catch {
      destroyed = true; // connection destroyed — acceptable
    }
    expect(destroyed).toBe(true);
  });
});
