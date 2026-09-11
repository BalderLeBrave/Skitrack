#!/usr/bin/env node
/** Lance Vite (port 5173) puis la fenêtre SKITRACK. */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { projectRoot } from "./with-app-env.mjs";

const root = projectRoot();
const PORT = process.env.ELECTRON_PORT || "5173";
const HOST = "127.0.0.1";
const URL = `http://${HOST}:${PORT}/`;
const here = dirname(fileURLToPath(import.meta.url));
const electronDir = join(root, "node_modules", "electron");
const pathTxt = join(electronDir, "path.txt");

function runInstall() {
  const installer = join(electronDir, "install.js");
  if (!existsSync(installer)) return false;
  console.log("Téléchargement d’Electron (une fois)…");
  const r = spawnSync(process.execPath, [installer], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, npm_config_ignore_scripts: "false" },
  });
  return r.status === 0 && existsSync(pathTxt);
}

function electronReady() {
  if (existsSync(pathTxt)) return true;
  if (!existsSync(electronDir)) {
    console.log("Installation du paquet electron…");
    const r = spawnSync("npm", ["install", "electron", "--no-save", "--ignore-scripts"], {
      cwd: root,
      stdio: "inherit",
      shell: true,
    });
    if (r.status !== 0) return false;
  }
  return runInstall();
}

function openEdge(url) {
  if (process.platform !== "win32") return false;
  console.log("Electron indisponible — ouverture de SKITRACK dans Edge.");
  spawn("cmd", ["/c", "start", "", "msedge", `--app=${url}`], {
    stdio: "ignore",
    detached: true,
    windowsHide: true,
  }).unref();
  return true;
}

async function waitFor(url, tries = 120) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status > 0) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Vite n’écoute pas sur ${url}`);
}

const vite = spawn(
  process.execPath,
  [join(here, "with-app-env.mjs"), "vite", "dev", "--host", HOST, "--port", PORT],
  { stdio: "inherit", cwd: root, env: process.env },
);
vite.on("exit", (code) => {
  if (code && code !== 0) process.exit(code);
});

try {
  await waitFor(URL);
} catch (err) {
  vite.kill();
  console.error(err.message);
  process.exit(1);
}

const canElectron = electronReady();
let child;
if (canElectron) {
  const require = createRequire(join(root, "package.json"));
  const electronBin = require.resolve("electron/cli.js");
  child = spawn(process.execPath, [electronBin, join(root, "desktop/main.mjs")], {
    stdio: "inherit",
    cwd: root,
    env: { ...process.env, ELECTRON_RENDERER_URL: URL },
  });
  child.on("exit", (code) => {
    vite.kill();
    process.exit(code ?? 0);
  });
} else if (!openEdge(URL)) {
  console.error("Ouvre ce lien dans le navigateur :", URL);
}

function shutdown() {
  child?.kill();
  vite.kill();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

writeFileSync(join(root, ".skitrack-url"), URL);
console.log(`SKITRACK : ${URL}`);
