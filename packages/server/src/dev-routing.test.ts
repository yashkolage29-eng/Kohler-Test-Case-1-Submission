import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import { expect, it, vi } from "vitest";

it("serves room-edit through the real Vite config and HTTP provider without a separate backend", async () => {
  let calls = 0;
  const provider = createServer(async (req, res) => {
    for await (const _chunk of req) { void _chunk; }
    calls++;
    res.setHeader("Content-Type", "application/json");
    if (req.url !== "/v1/chat/completions" || req.headers.authorization !== "Bearer local-test-only") {
      res.writeHead(400);
      res.end("local-test-only");
      return;
    }
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ operations: [{ op: "dimension", field: "widthMm", value: 3000 }] }) } }] }));
  });
  await new Promise<void>((resolve) => provider.listen(0, "127.0.0.1", resolve));
  vi.stubEnv("NIM_API_KEY", "local-test-only");
  vi.stubEnv("NIM_BASE_URL", `http://127.0.0.1:${(provider.address() as AddressInfo).port}/v1/`);
  vi.stubEnv("NIM_MODEL", "local-test");
  vi.stubEnv("NIM_TIMEOUT_MS", "1000");
  let vite: ViteDevServer | undefined;
  try {
    vite = await createViteServer({
      root: fileURLToPath(new URL("../../web", import.meta.url)),
      configFile: fileURLToPath(new URL("../../web/vite.config.ts", import.meta.url)),
      server: { host: "127.0.0.1", port: 0, open: false },
      logLevel: "silent",
    });
    await vite.listen();
    const base = `http://127.0.0.1:${(vite.httpServer!.address() as AddressInfo).port}`;
    const room = { polygon: { vertices: [{ x: 0, y: 0 }, { x: 2400, y: 0 }, { x: 2400, y: 1800 }, { x: 0, y: 1800 }], ccw: true, wallThicknessMm: 100 }, openings: [], confirmed: true };
    const response = await fetch(`${base}/api/nim`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request: "room-edit", text: "make it wider", room }), signal: AbortSignal.timeout(5000) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.proposal.operations).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain("local-test-only");
    expect(calls).toBe(1);
    const get = await fetch(`${base}/api/nim`);
    expect(get.status).toBe(405);
    expect(get.headers.get("content-type")).toContain("application/json");
    expect((await fetch(base)).status).toBe(200);
  } finally {
    await vite?.close();
    await new Promise<void>((resolve) => provider.close(() => resolve()));
    vi.unstubAllEnvs();
  }
}, 15_000);
