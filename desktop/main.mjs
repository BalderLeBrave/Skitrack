import { app, BrowserWindow, shell } from "electron";
import { fork } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const ICON = join(root, "build", "icon.ico");

/**
 * Port fixe, et non un port libre au hasard : le navigateur range ce que l'app
 * sauvegarde (comparateur, notes, préférences) par origine, port compris. Un
 * port qui change à chaque lancement effacerait tout à chaque lancement.
 */
const PORT = Number(process.env.SKITRACK_PORT || 4731);
const HOST = "127.0.0.1";
const BASE = `http://${HOST}:${PORT}/`;

let serveur = null;
let enFermeture = false;

/** Le serveur Nitro : hors des ressources une fois installé, dans `.output` sinon. */
function cheminServeur() {
  return app.isPackaged
    ? join(process.resourcesPath, "output", "server", "index.mjs")
    : join(root, ".output", "server", "index.mjs");
}

function dossierDonnees() {
  const d = app.getPath("userData");
  mkdirSync(d, { recursive: true });
  return d;
}

/**
 * Démarre le serveur dans un process à part.
 *
 * `ELECTRON_RUN_AS_NODE` fait tourner le binaire d'Electron en simple Node :
 * le serveur ne voit ni fenêtre ni module Electron, et une erreur de sa part
 * ne fait pas tomber l'interface.
 */
function demarrerServeur() {
  const entree = cheminServeur();
  if (!existsSync(entree)) {
    throw new Error(`Serveur introuvable : ${entree}. Lancer « npm run build ».`);
  }

  const donnees = dossierDonnees();
  const journal = createWriteStream(join(donnees, "serveur.log"), { flags: "a" });

  serveur = fork(entree, [], {
    execPath: process.execPath,
    cwd: dirname(dirname(entree)),
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      HOST,
      PORT: String(PORT),
      // Le client a été bâti sans authentification (`LOCAL_APP_ENV` de
      // scripts/with-app-env.mjs, l'app installée n'étant jamais dans le bac à
      // sable Grok). Le serveur relit la clé à l'exécution : sans elle, il la
      // croirait active et contredirait le client.
      VITE_AUTH_ENABLED: process.env.VITE_AUTH_ENABLED ?? "false",
      // Ces trois chemins visent /tmp par défaut, absent sous Windows.
      SKITRACK_TAUX: join(donnees, "taux.json"),
      SKITRACK_AIRBNB_CIRCUIT: join(donnees, "airbnb-429"),
      SKITRACK_AIRBNB_SESSION: join(donnees, "airbnb-session.json"),
    },
  });

  serveur.stdout?.pipe(journal);
  serveur.stderr?.pipe(journal);
  serveur.on("exit", (code) => {
    serveur = null;
    if (!enFermeture && code) console.error(`[skitrack] serveur arrêté (code ${code})`);
  });
}

/** Attend que le serveur réponde. Deux minutes au plus, puis on abandonne. */
async function attendreServeur(essais = 240) {
  for (let i = 0; i < essais; i += 1) {
    if (!serveur && i > 0) throw new Error("Le serveur s'est arrêté au démarrage.");
    try {
      const res = await fetch(BASE, { redirect: "manual" });
      if (res.status > 0) return;
    } catch {
      /* pas encore prêt */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Le serveur n'écoute pas sur ${BASE}`);
}

/** Écran d'attente, puis message d'erreur le cas échéant. Fond sombre, pas de blanc. */
function pageMessage(titre, detail) {
  const html = `<!doctype html><meta charset="utf-8"><title>SKITRACK</title>
<style>
  html,body{height:100%;margin:0}
  body{background:#0f1620;color:#c8d4e2;display:flex;align-items:center;
       justify-content:center;font:15px/1.6 system-ui,sans-serif}
  div{max-width:34rem;padding:2rem;text-align:center}
  h1{font-size:1rem;letter-spacing:.14em;text-transform:uppercase;color:#7f94ab;font-weight:600}
  p{white-space:pre-wrap}
</style>
<div><h1>${titre}</h1><p>${detail}</p></div>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 940,
    show: false,
    backgroundColor: "#0f1620",
    title: "SKITRACK",
    autoHideMenuBar: true,
    ...(existsSync(ICON) ? { icon: ICON } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // `minWidth` borne la fenêtre, cadre compris, alors que `.v7.app` et `.v6`
  // exigent 1100 px de contenu (min-width), barre de défilement verticale en
  // sus : à la taille minimale, une barre horizontale apparaissait toujours.
  // On borne donc le contenu, plus le cadre et la barre (15 px sous Windows).
  const [largeur, hauteur] = win.getSize();
  const [largeurContenu, hauteurContenu] = win.getContentSize();
  win.setMinimumSize(1100 + 15 + (largeur - largeurContenu), 700 + (hauteur - hauteurContenu));

  win.once("ready-to-show", () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    const allowed = process.env.ELECTRON_RENDERER_URL;
    if (allowed && url.startsWith(allowed)) return;
    if (url.startsWith("file://") || url.startsWith("data:")) return;
    event.preventDefault();
    if (/^https?:/.test(url)) void shell.openExternal(url);
  });

  win.on("closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  return win;
}

async function demarrer() {
  // En développement, `electron-dev.mjs` a déjà lancé Vite et passe l'adresse.
  const fourni = process.env.ELECTRON_RENDERER_URL;
  if (fourni) {
    const win = createWindow();
    void win.loadURL(fourni);
    return;
  }

  // `will-navigate` compare à cette variable : la poser avant la fenêtre laisse
  // la navigation interne de l'app fonctionner.
  process.env.ELECTRON_RENDERER_URL = BASE;
  const win = createWindow();
  void win.loadURL(pageMessage("SKITRACK", "Démarrage…"));

  try {
    demarrerServeur();
    await attendreServeur();
    await win.loadURL(BASE);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const log = join(dossierDonnees(), "serveur.log");
    void win.loadURL(pageMessage("Démarrage impossible", `${message}\n\nJournal : ${log}`));
  }
}

// Une seule instance : deux fenêtres voudraient le même port, et la seconde
// échouerait sans que l'on comprenne pourquoi.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(demarrer);

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void demarrer();
  });
  app.on("before-quit", () => {
    enFermeture = true;
    serveur?.kill();
  });
}
