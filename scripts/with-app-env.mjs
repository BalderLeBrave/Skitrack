#!/usr/bin/env node
/**
 * Run a command with `.grok/app-env.json` merged into its environment.
 *
 * `dev`, `build` and `preview` all route through this wrapper, so the dev
 * server, the built bundle and the preview server can never disagree about
 * `VITE_AUTH_ENABLED` — a divergence that only shows up as a built-output
 * mismatch long after the fact. Anything that starts Vite directly bypasses it.
 *
 * Only `VITE_`-prefixed keys are honored: the file is a build flag carrier, not
 * a secret store, and only `VITE_` vars reach the browser anyway. A real
 * `process.env` entry always wins, so an explicit override still works.
 *
 * That precedence also means the file governs this workspace only. A deployed
 * build runs with the provider's project env, where the deployer sets
 * `VITE_AUTH_ENABLED` itself (today unconditionally `"true"`), so the deployed
 * flag is the platform's, not this file's.
 *
 * `.grok/` is the Grok sandbox's and ignored by git, so a checkout outside the
 * sandbox has no file at all. It gets `LOCAL_APP_ENV` instead: auth off, which
 * is what the sandbox file ships too.
 *
 * Vite picks the values up because `loadEnv` prefix-matches entries already in
 * `process.env`, which is why the merge has to happen before Vite starts.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { constants as osConstants } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

export const APP_ENV_REL_PATH = ".grok/app-env.json";

const VITE_PREFIX = "VITE_";

/**
 * Parse an app-env document, keeping only `VITE_`-prefixed string entries.
 * Anything unparseable is an empty environment: auth on, no overrides.
 */
export function parseAppEnv(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {};
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const env = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!key.startsWith(VITE_PREFIX)) continue;
    if (typeof value !== "string") continue;
    env[key] = value;
  }
  return env;
}

/** The app env recorded under `root`, or `{}` when the file is absent. */
export function readAppEnv(root) {
  try {
    return parseAppEnv(readFileSync(join(root, APP_ENV_REL_PATH), "utf8"));
  } catch {
    return {};
  }
}

/**
 * The app env of a checkout outside the Grok sandbox. Skitrack then runs on
 * one person's machine, where no sign-in can complete (the broker's preview
 * client only takes `*.grok-sandbox.com` callbacks): auth is off and the dev
 * user owns the data, as `src/lib/auth` describes for the shipped default.
 */
export const LOCAL_APP_ENV = Object.freeze({ VITE_AUTH_ENABLED: "false" });

/**
 * The app env `root` runs with: its `.grok/app-env.json` when there is one —
 * even one without the key, which is how the sandbox turns real sign-in on —
 * else `LOCAL_APP_ENV`.
 */
export function workspaceAppEnv(root) {
  return existsSync(join(root, APP_ENV_REL_PATH)) ? readAppEnv(root) : { ...LOCAL_APP_ENV };
}

/** File values under the process environment: an explicit override wins. */
export function mergeAppEnv(appEnv, processEnv) {
  return { ...appEnv, ...processEnv };
}

/**
 * Translate a child's `exit` `(code, signal)` into this process's exit status.
 *
 * Do not re-raise the signal with `process.kill(process.pid, signal)`: under
 * qemu-user (amd64 image builds on an arm host) a self-directed signal is
 * routinely delivered as SIGSEGV to the wrong process, which takes down the
 * test worker and fails the image build. `128 + signo` is what a shell reports
 * for a signal-killed command, so a cancelled `vite build` is still a failure.
 */
export function exitStatusFromChild(code, signal) {
  if (signal) {
    const signo = osConstants.signals[signal];
    return 128 + (typeof signo === "number" ? signo : 1);
  }
  return code ?? 1;
}

/** The workspace root (this file lives in `<root>/scripts/`). */
export function projectRoot() {
  return dirname(dirname(fileURLToPath(import.meta.url)));
}

/**
 * Whether `moduleUrl` is the script node was asked to run.
 *
 * Both sides are resolved through symlinks: node realpaths `import.meta.url`
 * but leaves `process.argv[1]` as typed, so comparing them raw makes a CLI
 * launched through a symlinked path (`/tmp` on macOS) a silent no-op.
 */
export function isMainModule(moduleUrl) {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === fileURLToPath(moduleUrl);
  } catch {
    return false;
  }
}

/**
 * Resolve a local npm bin (vite, …) to `node path/to/bin.js`.
 * Bare `spawn("vite")` fails on Windows: the shim is `vite.cmd`, ENOENT.
 */
export function resolveLocalCommand(command, args, root = projectRoot()) {
  if (!command || command.includes("/") || command.includes("\\") || isAbsolute(command)) {
    return { command, args };
  }
  try {
    const req = createRequire(join(root, "package.json"));
    const pkgPath = req.resolve(`${command}/package.json`);
    const pkg = req(pkgPath);
    const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.[command];
    if (typeof bin === "string") {
      const script = join(dirname(pkgPath), bin.replace(/^\.\//, ""));
      if (existsSync(script)) return { command: process.execPath, args: [script, ...args] };
    }
  } catch {
    /* package has no JS bin */
  }
  return { command, args };
}

/**
 * Whether Windows needs cmd.exe to start `command`. Only batch shims do, and a
 * bare name (`npm`) may resolve to one through PATHEXT. An explicit path to an
 * executable must not go through the shell: cmd.exe splits an unquoted
 * `C:\Program Files\nodejs\node.exe` at the space.
 */
export function needsWindowsShell(command, platform = process.platform) {
  if (platform !== "win32") return false;
  if (/\.(?:bat|cmd)$/i.test(command)) return true;
  return !(command.includes("/") || command.includes("\\") || isAbsolute(command));
}

function main(argv) {
  const [command, ...args] = argv;
  if (!command) {
    console.error("usage: node scripts/with-app-env.mjs <command> [args…]");
    process.exit(2);
  }
  const env = mergeAppEnv(workspaceAppEnv(projectRoot()), process.env);
  const resolved = resolveLocalCommand(command, args);
  const child = spawn(resolved.command, resolved.args, {
    stdio: "inherit",
    env,
    cwd: projectRoot(),
    shell: needsWindowsShell(resolved.command),
  });
  // The dev server is long-running and is stopped by signalling this wrapper.
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => child.kill(signal));
  }
  child.on("error", (err) => {
    console.error(`[with-app-env] failed to run ${command}:`, err?.message || err);
    process.exit(127);
  });
  child.on("exit", (code, signal) => {
    process.exit(exitStatusFromChild(code, signal));
  });
}

if (isMainModule(import.meta.url)) {
  main(process.argv.slice(2));
}
