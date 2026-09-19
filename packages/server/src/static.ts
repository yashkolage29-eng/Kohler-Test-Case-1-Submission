import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";

/** Minimal MIME allowlist — anything not listed here is never served. */
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".glb": "model/gltf-binary",
  ".txt": "text/plain; charset=utf-8",
};

export interface StaticHit {
  absPath: string;
  contentType: string;
  contentLength: number;
}

/**
 * Resolve a request URL path against the static root.
 * Returns null when the path escapes the root (traversal), contains a null
 * byte, has a non-allowlisted extension, or does not exist on disk.
 * The caller decides SPA fallback behavior for misses.
 */
export function resolveStatic(rootDir: string, urlPath: string): StaticHit | null {
  if (urlPath.includes("\0")) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const abs = path.normalize(path.join(rootDir, decoded));
  // Traversal guard: the resolved path must stay inside the root.
  if (abs !== rootDir && !abs.startsWith(rootDir + path.sep)) return null;
  const ext = path.extname(abs).toLowerCase();
  const contentType = MIME[ext];
  // Extensionless paths (other than the root) are SPA routes, not files.
  if (!contentType) return null;
  if (!existsSync(abs) || !statSync(abs).isFile()) return null;
  return { absPath: abs, contentType, contentLength: statSync(abs).size };
}

export function streamStatic(hit: StaticHit, res: import("node:http").ServerResponse, headOnly = false): void {
  res.writeHead(200, {
    "Content-Type": hit.contentType,
    "Content-Length": hit.contentLength,
    // Hashed assets could be immutable, but no-store keeps the prototype honest.
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (headOnly) {
    res.end();
    return;
  }
  createReadStream(hit.absPath).pipe(res);
}
