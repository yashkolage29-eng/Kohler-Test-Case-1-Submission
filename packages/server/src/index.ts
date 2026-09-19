import { loadAiEnv } from "./env.js";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createAppServer } from "./http.js";
import type { BuildOutput } from "@kolher/engine";

function main(): void {
  // Type-only proof that the server compiles against the shared engine contract.
  const contractProbe: BuildOutput["kind"] = "out-of-scope";

  const aiEnv = loadAiEnv(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env"));

  const here = path.dirname(fileURLToPath(import.meta.url));
  // dist/index.js lives in <server>/dist; built web assets are <repo>/packages/web/dist.
  const webRoot = process.env.WEB_ROOT ?? path.resolve(here, "../../web/dist");
  const port = Number(process.env.PORT ?? 4173);
  const host = process.env.HOST ?? "127.0.0.1";

  const server = createAppServer({
    webRoot,
    aiEnv,
  });
  server.listen(port, host, () => {
    console.log(
      `[@kolher/server] Static host on http://${host}:${port} (web root: ${webRoot}). ` +
        `Contract probe: ${contractProbe}. Engine solving stays in-browser; /api/nim is the AI proxy seam (T-013).`
    );
  });
}

main();
