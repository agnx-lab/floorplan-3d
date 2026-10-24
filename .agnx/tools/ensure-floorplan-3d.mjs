#!/usr/bin/env node
/**
 * 场景：Floorplan3D 短跑 sidecar — 确保静态服务在 127.0.0.1:5192 起来（提供 index.html + 本地 three）。
 * 用法：node .agnx/tools/ensure-floorplan-3d.mjs [--port <n>] [--force-restart] [--supervised] [--work-dir <path>]
 * stdout：JSON { ok, origin, port, pid, reused?, plan?, warnings?, error? }
 * 端口必须稳定（localStorage 按 origin 隔离，换端口就丢方案），除非显式传 --port。
 */
import { spawn } from "node:child_process";
import { access, constants as fsConstants, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const APP_ID = "floorplan-3d";
const ENSURE_ID = "floorplan-3d.ensure";
const STATE_FILE = "floorplan-3d.json";
const DEFAULT_PORT = 5192;
const SERVER_ENTRY = path.join(__dirname, "serve-static.mjs");

function parseArgs(argv) {
  let port = DEFAULT_PORT;
  let forceRestart = false;
  let supervised = false;
  let workDir = process.env.AGNX_APP_DATA_ROOT || "";
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--port" && next) {
      const n = Number(next);
      if (Number.isFinite(n) && n > 0) port = Math.floor(n);
      i += 1;
    } else if (arg === "--force-restart" || arg === "--forceRestart") {
      forceRestart = true;
    } else if (arg === "--supervised") {
      supervised = true;
    } else if ((arg === "--work-dir" || arg === "--workDir") && next) {
      workDir = String(next).trim();
      i += 1;
    }
  }
  return {
    port,
    forceRestart,
    supervised,
    repoRoot,
    // 运行时状态写 $AGNX_HOME/apps/data/<appId>/，绝不写进 App 目录。
    workDir: workDir || path.join(repoRoot, "..", "data", APP_ID),
  };
}

async function pathExists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readState(statePath) {
  try {
    return JSON.parse(await readFile(statePath, "utf8"));
  } catch {
    return null;
  }
}

async function writeState(statePath, payload) {
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function httpGetOk(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 2500 }, (res) => {
      res.resume();
      resolve(res.statusCode != null && res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function isHealthy(port) {
  return httpGetOk(`http://127.0.0.1:${port}/`);
}

async function waitForHealth(port, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isHealthy(port)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function stopPid(pid) {
  const n = Number(pid);
  if (!Number.isFinite(n) || n <= 0) return;
  try {
    process.kill(n, "SIGTERM");
  } catch {
    // 进程已退出，忽略
  }
}

function fingerprint(cfg) {
  return JSON.stringify({ repoRoot: cfg.repoRoot, port: cfg.port, mode: "static" });
}

function originOf(port) {
  return `http://127.0.0.1:${port}/`;
}

async function tryReused(cfg, statePath, wantedFp) {
  if (cfg.forceRestart) return null;
  const existing = await readState(statePath);
  if (!existing || !(await isHealthy(cfg.port))) return null;
  if (existing.fingerprint !== wantedFp) return null;
  return {
    ok: true,
    reused: true,
    port: cfg.port,
    pid: existing.pid ?? null,
    origin: originOf(cfg.port),
    repoRoot: cfg.repoRoot,
    warnings: existing.warnings || [],
  };
}

function buildSupervisedPlan(cfg) {
  return {
    ok: true,
    appId: APP_ID,
    ensureId: ENSURE_ID,
    origin: originOf(cfg.port),
    port: cfg.port,
    reused: false,
    sidecar: { supervised: true, stateFile: STATE_FILE, defaultPort: DEFAULT_PORT },
    plan: {
      command: process.execPath,
      args: [SERVER_ENTRY, "--port", String(cfg.port), "--root", cfg.repoRoot],
      cwd: cfg.repoRoot,
      env: {},
      health: { url: originOf(cfg.port), timeoutMs: 30_000 },
    },
  };
}

async function main() {
  const cfg = parseArgs(process.argv.slice(2));
  await mkdir(cfg.workDir, { recursive: true });
  const statePath = path.join(cfg.workDir, STATE_FILE);
  const wantedFp = fingerprint(cfg);
  const warnings = [];

  // 前置体检：index.html 与本地 three 必须都在，否则直接给出可读错误而不是空白页。
  if (!(await pathExists(path.join(cfg.repoRoot, "index.html")))) {
    console.log(
      JSON.stringify({
        ok: false,
        appId: APP_ID,
        ensureId: ENSURE_ID,
        error: "ENSURE_MISSING_INDEX",
        message: "App 根目录缺 index.html，请确认整仓已拷入。",
        port: cfg.port,
      }),
    );
    process.exit(1);
  }
  if (!(await pathExists(path.join(cfg.repoRoot, "node_modules/three/build/three.module.js")))) {
    console.log(
      JSON.stringify({
        ok: false,
        appId: APP_ID,
        ensureId: ENSURE_ID,
        error: "ENSURE_MISSING_THREE",
        message: "缺本地 three。请在 App 根目录执行：npm install（需 Node ≥ 18）。",
        port: cfg.port,
      }),
    );
    process.exit(1);
  }

  if (cfg.supervised) {
    const reused = await tryReused(cfg, statePath, wantedFp);
    if (reused) {
      console.log(JSON.stringify({ ...reused, appId: APP_ID, ensureId: ENSURE_ID }));
      return;
    }
    console.log(JSON.stringify(buildSupervisedPlan(cfg)));
    return;
  }

  const lockDir = path.join(cfg.workDir, "ensure-floorplan-3d.lock");
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      await mkdir(lockDir);
      try {
        const reused = await tryReused(cfg, statePath, wantedFp);
        if (reused) {
          console.log(JSON.stringify({ ...reused, appId: APP_ID, ensureId: ENSURE_ID }));
          return;
        }
        const existing = await readState(statePath);
        if (existing?.pid) stopPid(existing.pid);

        const child = spawn(
          process.execPath,
          [SERVER_ENTRY, "--port", String(cfg.port), "--root", cfg.repoRoot],
          { cwd: cfg.repoRoot, env: { ...process.env }, detached: true, stdio: "ignore" },
        );
        child.unref();

        if (!(await waitForHealth(cfg.port))) {
          stopPid(child.pid);
          console.log(
            JSON.stringify({
              ok: false,
              appId: APP_ID,
              ensureId: ENSURE_ID,
              error: "ENSURE_TIMEOUT",
              message: `静态服务启动超时（port=${cfg.port}）。可手动执行 node .agnx/tools/serve-static.mjs --port ${cfg.port} 排查。`,
              port: cfg.port,
            }),
          );
          process.exit(1);
        }

        await writeState(statePath, {
          fingerprint: wantedFp,
          port: cfg.port,
          pid: child.pid ?? null,
          repoRoot: cfg.repoRoot,
          warnings,
          updatedAt: Date.now(),
        });
        console.log(
          JSON.stringify({
            ok: true,
            reused: false,
            appId: APP_ID,
            ensureId: ENSURE_ID,
            port: cfg.port,
            pid: child.pid ?? null,
            origin: originOf(cfg.port),
            repoRoot: cfg.repoRoot,
            warnings,
          }),
        );
        return;
      } finally {
        await rm(lockDir, { recursive: true, force: true }).catch(() => {});
      }
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const reused = await tryReused(cfg, statePath, wantedFp);
      if (reused) {
        console.log(JSON.stringify({ ...reused, appId: APP_ID, ensureId: ENSURE_ID }));
        return;
      }
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  console.log(
    JSON.stringify({ ok: false, appId: APP_ID, ensureId: ENSURE_ID, error: "ENSURE_LOCK_TIMEOUT", port: cfg.port }),
  );
  process.exit(1);
}

main().catch((error) => {
  console.log(
    JSON.stringify({
      ok: false,
      appId: APP_ID,
      ensureId: ENSURE_ID,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exit(1);
});
