#!/usr/bin/env node
/** Lance Vite puis la fenêtre SKITRACK.
 *
 *   node scripts/electron-dev.mjs                     → 127.0.0.1:5173
 *   node scripts/electron-dev.mjs --host 0.0.0.0 --port 8080
 *
 * `npm run dev` passe par ici aussi, pour que la fenêtre s'ouvre dans les deux
 * cas. Mais `dev` sert également de serveur sans écran — `startup.sh` le lance
 * dans le bac à sable, `check-auth-invariant` et le smoke test l'interrogent :
 * `SKITRACK_NO_WINDOW=1`, ou l'absence de DISPLAY sous Linux, garde alors Vite
 * seul. */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { projectRoot } from "./with-app-env.mjs";

/** `--port 8080` ou `--port=8080`. */
function flag(name, fallback) {
  const args = process.argv.slice(2);
  const i = args.indexOf(`--${name}`);
  if (i !== -1 && args[i + 1]) return args[i + 1];
  const inline = args.find((a) => a.startsWith(`--${name}=`));
  return inline ? inline.slice(name.length + 3) : fallback;
}

const root = projectRoot();
const PORT = flag("port", process.env.ELECTRON_PORT || "5173");
/** Adresse d'écoute : `0.0.0.0` expose au réseau local. */
const BIND = flag("host", "127.0.0.1");
/** On ne charge jamais 0.0.0.0 dans la fenêtre : ce n'est pas une adresse. */
const URL = `http://${BIND === "0.0.0.0" ? "127.0.0.1" : BIND}:${PORT}/`;

/** Pas de fenêtre demandée, ou pas d'écran pour l'afficher. */
function windowWanted() {
  if (process.env.SKITRACK_NO_WINDOW === "1") return false;
  if (process.platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    return false;
  }
  return true;
}

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
  [join(here, "with-app-env.mjs"), "vite", "dev", "--host", BIND, "--port", PORT],
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

const canElectron = windowWanted() && electronReady();
let child;
if (!windowWanted()) {
  console.log("Sans fenêtre (SKITRACK_NO_WINDOW ou pas d’écran) — Vite seul.");
} else if (canElectron) {
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
