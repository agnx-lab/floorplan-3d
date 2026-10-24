#!/usr/bin/env node
/**
 * 场景：Floorplan3D 静态服务 — 把 App 根目录（index.html + node_modules/three）以只读 HTTP 交给 Guest iframe。
 * 用法：node .agnx/tools/serve-static.mjs [--port 5192] [--root <App 根>]
 * 只服务白名单路径，不做目录列举、不写盘。
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(__dirname, "../..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

/** 只放行静态资源；禁止 .git / .agnx / data 等目录被外部读到。 */
const ALLOW_PREFIXES = ["index.html", "node_modules/three/", "assets/"];
const BLOCK_SEGMENTS = new Set([".agnx", ".git", "data", ".agnx-tidewater-runtime"]);

export function parseServeArgs(argv) {
  let port = 5192;
  let root = DEFAULT_ROOT;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--port" && next) {
      const n = Number(next);
      if (Number.isFinite(n) && n > 0) port = Math.floor(n);
      i += 1;
    } else if (arg === "--root" && next) {
      root = path.resolve(String(next));
      i += 1;
    }
  }
  return { port, root };
}

export function resolveStaticPath(root, requestUrl) {
  const raw = String(requestUrl || "/").split("?")[0].split("#")[0];
  let rel = decodeURIComponent(raw).replace(/^\/+/, "");
  if (!rel || rel === ".") rel = "index.html";
  if (rel.endsWith("/")) rel += "index.html";
  const normalized = path.posix.normalize(rel);
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) return null;
  if (normalized.split("/").some((seg) => BLOCK_SEGMENTS.has(seg))) return null;
  if (!ALLOW_PREFIXES.some((p) => normalized === p || normalized.startsWith(p))) return null;
  const abs = path.resolve(root, normalized);
  if (!abs.startsWith(root + path.sep)) return null;
  return { abs, rel: normalized };
}

const CSP = [
  "default-src 'self'",
  // 上游是单文件内联脚本 + 内联样式 + importmap，必须放开 inline。
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "frame-ancestors *",
].join("; ");

export function createStaticServer(root) {
  return http.createServer(async (req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
      res.end("method not allowed");
      return;
    }
    const hit = resolveStaticPath(root, req.url);
    if (!hit) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("not found");
      return;
    }
    let info;
    try {
      info = await stat(hit.abs);
    } catch {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("not found");
      return;
    }
    if (!info.isFile()) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("not found");
      return;
    }
    const type = MIME[path.extname(hit.abs).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, {
      "content-type": type,
      "content-length": String(info.size),
      "cache-control": "no-cache",
      "content-security-policy": CSP,
      "x-content-type-options": "nosniff",
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    createReadStream(hit.abs).pipe(res);
  });
}

function main() {
  const { port, root } = parseServeArgs(process.argv.slice(2));
  const server = createStaticServer(root);
  server.on("error", (error) => {
    console.error(`[serve-static] 启动失败 port=${port}: ${error.message}`);
    process.exit(1);
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`[serve-static] http://127.0.0.1:${port}/  root=${root}`);
  });
  const stop = () => {
    server.close(() => process.exit(0));
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
