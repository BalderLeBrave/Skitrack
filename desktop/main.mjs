import { app, BrowserWindow, clipboard, dialog, Menu, screen, session, shell } from "electron";
import electronUpdater from "electron-updater";
import { fork, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { getCACertificates } from "node:tls";
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

/**
 * Le jeton du serveur en cours : il le rend sur `/__skitrack/instance`
 * (`server/middleware/instance.ts`), et la fenêtre n'ouvre que le serveur qui
 * le connaît. Sur le port fixe pourrait répondre SKITRACK ouvert dans une
 * autre session Windows, ou un serveur resté d'une version précédente. Tiré à
 * nouveau à chaque démarrage du serveur : un jeton déjà lu ne sert plus.
 */
let JETON = randomUUID();

/**
 * L'adresse de l'interface : celle de Vite en développement
 * (`scripts/electron-dev.mjs`), celle du serveur sinon. Une variable
 * ELECTRON_RENDERER_URL restée dans l'environnement d'un tiers ne doit pas
 * faire croire à l'application installée qu'elle est en développement.
 */
const RENDU_DEV = app.isPackaged ? null : process.env.ELECTRON_RENDERER_URL || null;
const ORIGINE = RENDU_DEV ? new URL(RENDU_DEV).origin : new URL(BASE).origin;

let serveur = null;
let erreurServeur = null;
let enFermeture = false;
let demarre = false;
let relance = false;
let fenetre = null;

/** Le serveur Nitro : hors des ressources une fois installé, dans `.output` sinon. */
function cheminServeur() {
  return app.isPackaged
    ? join(process.resourcesPath, "output", "server", "index.mjs")
    : join(root, ".output", "server", "index.mjs");
}

/**
 * Une ressource embarquée par l'installateur (`electron-builder.yml`), ou
 * null en développement et si elle manque : le serveur cherche alors lui-même.
 */
function ressource(...chemin) {
  if (!app.isPackaged) return null;
  const p = join(process.resourcesPath, ...chemin);
  return existsSync(p) ? p : null;
}

/**
 * Le Python embarqué (`scripts/preparer-python-embarque.mjs`), avec curl_cffi,
 * bs4 et requests : les workers Airbnb, Booking et HomeToGo n'ont pas besoin
 * d'un Python sur la machine.
 */
const pythonEmbarque = () => ressource("python", "python.exe");

/**
 * Le navigateur de Playwright (`scripts/preparer-navigateur.mjs`) : sans lui,
 * Playwright le cherche dans `%LOCALAPPDATA%\ms-playwright`, qui n'existe que
 * sur un poste de développement.
 */
const navigateursEmbarques = () => ressource("ms-playwright");

function dossierDonnees() {
  const d = app.getPath("userData");
  mkdirSync(d, { recursive: true });
  return d;
}

const ascii = (s) => /^[\x20-\x7e]*$/.test(s);

/**
 * Les certificats racines des workers Python, dans un fichier au chemin ASCII.
 *
 * curl_cffi passe le chemin de son magasin à libcurl, qui l'ouvre dans la page
 * de code ANSI ; avec PYTHONUTF8 il l'encode en UTF-8. Sous un nom
 * d'utilisateur accentué (C:\Users\Hélène\…), toutes les requêtes d'Airbnb et
 * de Booking échouaient (erreur 77). Le magasin de certifi est donc recopié là
 * où le chemin est ASCII, complété des racines de Windows (un antivirus qui
 * inspecte HTTPS, un proxy d'entreprise), et désigné par SSL_CERT_FILE et
 * CURL_CA_BUNDLE, que curl_cffi et le module ssl lisent en premier.
 *
 * D'abord les dossiers propres à l'utilisateur : ses données, puis son
 * dossier temporaire (que Windows donne en nom court 8.3, donc en ASCII, même
 * sous un nom accentué). ProgramData, partagé entre les comptes, en dernier :
 * dans un sous-dossier dont l'héritage est coupé, réservé à l'utilisateur,
 * pour qu'aucun autre compte ne puisse y glisser sa propre autorité racine.
 */
function magasinCertificats(python) {
  const certifi = join(dirname(python), "Lib", "site-packages", "certifi", "cacert.pem");
  if (!existsSync(certifi)) return null;
  const donnees = dossierDonnees();
  const empreinte = createHash("sha1").update(donnees).digest("hex").slice(0, 12);
  const prive = process.env.ProgramData ? join(process.env.ProgramData, "SKITRACK", empreinte) : null;
  const candidats = [join(donnees, "cacert.pem"), join(tmpdir(), `skitrack-${empreinte}.pem`), prive && join(prive, "cacert.pem")].filter(
    (p) => p && ascii(p),
  );
  let systeme = [];
  try {
    systeme = getCACertificates("system");
  } catch {
    /* magasin de Windows illisible : certifi seul */
  }
  const contenu = `${readFileSync(certifi, "utf8").trimEnd()}\n${systeme.join("\n")}\n`;
  for (const p of candidats) {
    try {
      mkdirSync(dirname(p), { recursive: true });
      if (dirname(p) === prive) {
        const moi = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`;
        const r = spawnSync(
          "icacls",
          [prive, "/inheritance:r", "/grant:r", `${moi}:(OI)(CI)F`, "*S-1-5-18:(OI)(CI)F", "*S-1-5-32-544:(OI)(CI)F"],
          { windowsHide: true },
        );
        if (r.status !== 0) continue;
      }
      writeFileSync(p, contenu);
      return p;
    } catch {
      // Écriture refusée (un premier lancement « en tant qu'administrateur ») :
      // un fichier déjà à jour sert quand même.
      try {
        if (readFileSync(p, "utf8") === contenu) return p;
      } catch {
        /* suivant */
      }
    }
  }
  return null;
}

/**
 * Le proxy du système (Options Internet, script PAC), que ni le fetch de Node
 * ni les workers Python ne lisent d'eux-mêmes : ils suivent HTTPS_PROXY.
 */
async function proxySysteme() {
  if (process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy) {
    return null;
  }
  try {
    const r = await session.defaultSession.resolveProxy("https://www.skiinfo.fr/");
    const m = /PROXY\s+([^\s;]+)/.exec(r);
    return m ? `http://${m[1]}` : null;
  } catch {
    return null;
  }
}

/**
 * L'environnement du serveur : celui de l'utilisateur, moins ce qui le
 * détournerait (port, TLS ou base de Nitro, options de Node), plus le nôtre.
 */
async function environnementServeur() {
  const env = { ...process.env };
  for (const k of ["ELECTRON_RENDERER_URL", "NODE_OPTIONS", "NITRO_PORT", "NITRO_HOST", "NITRO_SSL_CERT", "NITRO_SSL_KEY", "DATABASE_URL"]) {
    delete env[k];
  }
  Object.assign(env, {
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
    HOST,
    PORT: String(PORT),
    NITRO_HOST: HOST,
    NITRO_PORT: String(PORT),
    // Le client a été bâti sans authentification (`scripts/release-win.mjs`) :
    // le serveur doit dire de même.
    VITE_AUTH_ENABLED: "false",
    SKITRACK_DESKTOP: "1",
    SKITRACK_INSTANCE: JETON,
    // Les racines de Windows en plus de celles de Node (121 seulement).
    NODE_USE_SYSTEM_CA: "1",
  });
  const proxy = await proxySysteme();
  if (proxy) Object.assign(env, { HTTPS_PROXY: proxy, HTTP_PROXY: proxy });
  if (env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy) {
    env.NODE_USE_ENV_PROXY = "1";
    env.NO_PROXY = [env.NO_PROXY || env.no_proxy, "127.0.0.1", "localhost"].filter(Boolean).join(",");
  }
  const python = pythonEmbarque();
  if (python) {
    Object.assign(env, { SKITRACK_PYTHON: python, PYTHONUTF8: "1", PYTHONDONTWRITEBYTECODE: "1" });
    const ca = magasinCertificats(python);
    if (ca) Object.assign(env, { SSL_CERT_FILE: ca, CURL_CA_BUNDLE: ca });
  }
  const navigateurs = navigateursEmbarques();
  if (navigateurs) env.PLAYWRIGHT_BROWSERS_PATH = navigateurs;
  // Journal de taux, coupe-circuit et session Airbnb : pas de chemin propre
  // à l'app. Les défauts sont dans le dossier temporaire de l'utilisateur,
  // communs au serveur de développement et aux scripts : un seul limiteur
  // pour une seule adresse IP.
  return env;
}

/** Le port est-il libre ? Le serveur, lui, tait l'erreur d'écoute. */
function sonderPort() {
  return new Promise((ok, ko) => {
    const s = net.createServer();
    s.once("error", ko);
    s.listen({ port: PORT, host: HOST, exclusive: true }, () => s.close(() => ok()));
  });
}

function messagePort(err) {
  if (err?.code === "EADDRINUSE") {
    return `Le port ${PORT} est déjà pris : SKITRACK est peut-être ouvert dans une autre session Windows, ou resté en arrière-plan (Gestionnaire des tâches), ou un autre logiciel l'utilise.\n\nFermez-le puis relancez SKITRACK.`;
  }
  if (err?.code === "EACCES") {
    return `Windows réserve le port ${PORT} (Hyper-V, WSL…).\n\nLa commande « netsh int ipv4 show excludedportrange protocol=tcp » liste les plages réservées.`;
  }
  return `Port ${PORT} inutilisable : ${err?.message ?? err}`;
}

/**
 * Démarre le serveur dans un process à part.
 *
 * `ELECTRON_RUN_AS_NODE` fait tourner le binaire d'Electron en simple Node :
 * le serveur ne voit ni fenêtre ni module Electron, et une erreur de sa part
 * ne fait pas tomber l'interface. Sous Windows, libuv range le fils dans un
 * Job Object qui l'emporte avec le process principal, et avec lui ses
 * python.exe et le navigateur de Playwright.
 */
async function demarrerServeur() {
  const entree = cheminServeur();
  if (!existsSync(entree)) {
    throw new Error(`Serveur introuvable : ${entree}. Réinstallez SKITRACK.`);
  }

  const donnees = dossierDonnees();
  const journal = createWriteStream(join(donnees, "serveur.log"), { flags: "a" });
  journal.write(`\n--- ${new Date().toISOString()} SKITRACK ${app.getVersion()}, Electron ${process.versions.electron}\n`);

  erreurServeur = null;
  JETON = randomUUID();
  const env = await environnementServeur();
  if (env.SKITRACK_PYTHON && !env.SSL_CERT_FILE) {
    journal.write("[skitrack] aucun magasin de certificats au chemin ASCII : sous un chemin accentué, Airbnb et Booking échoueront (erreur 77)\n");
  }
  serveur = fork(entree, [], {
    execPath: process.execPath,
    cwd: dirname(dirname(entree)),
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    env,
  });

  serveur.stdout?.pipe(journal);
  serveur.stderr?.pipe(journal);
  serveur.on("error", (err) => {
    erreurServeur = err;
    serveur = null;
    journal.write(`[skitrack] serveur impossible à lancer : ${err.message}\n`);
  });
  serveur.on("exit", (code, signal) => {
    serveur = null;
    journal.write(`[skitrack] serveur arrêté (code ${code}, signal ${signal})\n`);
    if (!enFermeture && demarre) void serveurPerdu();
  });
}

/** Le serveur est mort après le démarrage : une relance, puis un message. */
async function serveurPerdu() {
  const log = join(dossierDonnees(), "serveur.log");
  if (!fenetre || fenetre.isDestroyed()) return;
  if (relance) {
    void fenetre.loadURL(pageMessage("Serveur arrêté", `Relancez SKITRACK.\n\nJournal : ${log}`));
    return;
  }
  relance = true;
  void fenetre.loadURL(pageMessage("SKITRACK", "Redémarrage du serveur…"));
  try {
    await sonderPort();
    await demarrerServeur();
    await attendreServeur();
    if (!fenetre.isDestroyed()) await fenetre.loadURL(BASE);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!fenetre.isDestroyed()) void fenetre.loadURL(pageMessage("Serveur arrêté", `${message}\n\nJournal : ${log}`));
  }
}

/**
 * Attend que notre serveur réponde, et seulement lui. Deux minutes au plus
 * (le premier lancement, analysé par l'antivirus, peut être lent).
 */
async function attendreServeur(essais = 240) {
  let etranger = 0;
  for (let i = 0; i < essais; i += 1) {
    if (!serveur) throw erreurServeur ?? new Error("Le serveur s'est arrêté au démarrage.");
    try {
      const res = await fetch(`${BASE}__skitrack/instance`, { signal: AbortSignal.timeout(2000) });
      const json = res.ok ? await res.json().catch(() => null) : null;
      if (json?.instance === JETON) return;
      etranger += 1;
      if (etranger > 20) throw new Error(messagePort({ code: "EADDRINUSE" }));
    } catch (err) {
      if (err instanceof Error && etranger > 20) throw err;
      /* pas encore prêt */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Le serveur n'écoute pas sur ${BASE}`);
}

const echapper = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Écran d'attente, puis message d'erreur le cas échéant. Fond sombre, pas de blanc. */
function pageMessage(titre, detail) {
  const html = `<!doctype html><meta charset="utf-8"><title>SKITRACK</title>
<style>
  html,body{height:100%;margin:0}
  body{background:#0f1620;color:#c8d4e2;display:flex;align-items:center;
       justify-content:center;font:15px/1.6 system-ui,sans-serif}
  div{max-width:34rem;padding:2rem;text-align:center}
  h1{font-size:1rem;letter-spacing:.14em;text-transform:uppercase;color:#7f94ab;font-weight:600}
  p{white-space:pre-wrap;user-select:text}
</style>
<div><h1>${echapper(titre)}</h1><p>${echapper(detail)}</p></div>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

/**
 * Taille minimale : `.v7.app` et `.v6` exigent 1100 px de contenu, barre de
 * défilement verticale (15 px sous Windows) et cadre en sus. Mais jamais plus
 * que l'aire de travail de l'écran : sur un portable 1366×768, ou en 1080p à
 * 150 %, le bas de l'app passait sous la barre des tâches. Le contenu défile.
 */
function bornerTaille(win) {
  if (win.isDestroyed()) return;
  const aire = screen.getDisplayMatching(win.getBounds()).workAreaSize;
  const [largeur, hauteur] = win.getSize();
  const [largeurContenu, hauteurContenu] = win.getContentSize();
  win.setMinimumSize(
    Math.min(1100 + 15 + (largeur - largeurContenu), aire.width),
    Math.min(700 + (hauteur - hauteurContenu), aire.height),
  );
}

/** Une adresse de l'app elle-même (serveur ou Vite), et non du web. */
const interne = (url) => {
  try {
    return new URL(url).origin === ORIGINE;
  } catch {
    return false;
  }
};

function createWindow() {
  const aire = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    width: Math.min(1440, aire.width),
    height: Math.min(940, aire.height),
    show: false,
    backgroundColor: "#0f1620",
    title: "SKITRACK",
    autoHideMenuBar: true,
    ...(existsSync(ICON) ? { icon: ICON } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Le lecteur de webcam de la fiche station se lance seul, sans clic.
      autoplayPolicy: "no-user-gesture-required",
    },
  });

  const borner = () => bornerTaille(win);
  borner();
  win.on("moved", borner);
  screen.on("display-metrics-changed", borner);
  win.on("closed", () => screen.off("display-metrics-changed", borner));

  win.once("ready-to-show", () => win.show());

  // Ctrl, Maj ou clic du milieu sur un lien de l'app : il reste dans la
  // fenêtre. Ouvert dans le navigateur du système, il n'y retrouverait ni
  // favoris, ni notes, ni relevés (le stockage est celui de la fenêtre).
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (interne(url)) void win.loadURL(url);
    else if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (interne(url) || url.startsWith("data:")) return;
    event.preventDefault();
    if (/^https?:/.test(url)) void shell.openExternal(url);
  });
  // Un affichage qui plante se recharge, mais pas en boucle : au-delà de trois
  // plantages par minute, ou s'il ne peut même pas démarrer, on le dit.
  const plantages = [];
  let abandon = false;
  win.webContents.on("render-process-gone", (_event, details) => {
    if (details.reason === "clean-exit" || win.isDestroyed() || abandon) return;
    const t = Date.now();
    while (plantages.length && t - plantages[0] > 60_000) plantages.shift();
    plantages.push(t);
    if (plantages.length > 3 || details.reason === "launch-failed" || details.reason === "integrity-failure") {
      abandon = true;
      void dialog.showMessageBox(win, {
        type: "error",
        title: "SKITRACK",
        message: "L'affichage de SKITRACK s'est arrêté.",
        detail: `${details.reason}, code ${details.exitCode}. Relancez SKITRACK.`,
      });
      return;
    }
    if (RENDU_DEV || demarre) void win.loadURL(RENDU_DEV ?? BASE);
    else win.webContents.reload();
  });
  win.webContents.on("unresponsive", async () => {
    const { response } = await dialog.showMessageBox(win, {
      type: "warning",
      title: "SKITRACK",
      message: "SKITRACK ne répond plus.",
      buttons: ["Attendre", "Recharger"],
      defaultId: 0,
      cancelId: 0,
    });
    if (response === 1 && !win.isDestroyed()) win.webContents.reload();
  });

  // Copier, coller (un jeton dans Plus › Clés), copier l'adresse d'un lien.
  win.webContents.on("context-menu", (_event, p) => {
    const items = [];
    if (p.isEditable) {
      items.push({ role: "cut", label: "Couper" }, { role: "copy", label: "Copier" }, { role: "paste", label: "Coller" });
      items.push({ type: "separator" }, { role: "selectAll", label: "Tout sélectionner" });
    } else if (p.selectionText.trim()) {
      items.push({ role: "copy", label: "Copier" });
    }
    if (p.linkURL && /^https?:/.test(p.linkURL) && !interne(p.linkURL)) {
      if (items.length) items.push({ type: "separator" });
      items.push({ label: "Copier l'adresse du lien", click: () => clipboard.writeText(p.linkURL) });
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });

  win.on("closed", () => {
    if (fenetre === win) fenetre = null;
    if (process.platform !== "darwin") app.quit();
  });

  fenetre = win;
  return win;
}

/**
 * Ce que la page peut demander : écrire dans le presse-papiers (partager un
 * dossier, un récapitulatif) et le plein écran des webcams. Le reste (caméra,
 * micro, position, notifications, périphériques) est refusé : sans
 * gestionnaire, Electron accorde tout sans rien demander.
 */
function verrouillerSession() {
  const permises = new Set(["clipboard-sanitized-write", "fullscreen"]);
  const s = session.defaultSession;
  s.setPermissionRequestHandler((_wc, permission, rappel) => rappel(permises.has(permission)));
  s.setPermissionCheckHandler((_wc, permission) => permises.has(permission));
  s.setDevicePermissionHandler(() => false);
  // L'app ne propose aucun téléchargement ; Alt+clic sur un lien en lançait un.
  s.on("will-download", (event) => event.preventDefault());
  // Le script de la plateforme Grok n'a rien à faire dans l'application de
  // bureau (le serveur ne l'injecte plus, mais Vite le fait en développement).
  s.webRequest.onBeforeRequest({ urls: ["*://grok.com/*", "*://*.grok.com/*"] }, (_details, rappel) => rappel({ cancel: true }));
}

async function demarrer() {
  verrouillerSession();
  // Le serveur local se joint en direct, même si l'environnement impose un
  // proxy à Node (NODE_USE_ENV_PROXY) : le fetch d'attendreServeur aussi.
  process.env.NO_PROXY = [process.env.NO_PROXY || process.env.no_proxy, "127.0.0.1", "localhost"].filter(Boolean).join(",");

  // En développement, `electron-dev.mjs` a déjà lancé Vite et passe l'adresse.
  if (RENDU_DEV) {
    const win = createWindow();
    void win.loadURL(RENDU_DEV);
    return;
  }

  const win = createWindow();
  void win.loadURL(pageMessage("SKITRACK", "Démarrage…"));

  try {
    try {
      await sonderPort();
    } catch (err) {
      throw new Error(messagePort(err));
    }
    await demarrerServeur();
    await attendreServeur();
    demarre = true;
    await win.loadURL(BASE);
    miseAJour(win);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const log = join(dossierDonnees(), "serveur.log");
    if (!win.isDestroyed()) void win.loadURL(pageMessage("Démarrage impossible", `${message}\n\nJournal : ${log}`));
  }
}

/** Une vérification au démarrage, puis toutes les quatre heures. */
const MAJ_INTERVALLE_MS = 4 * 60 * 60 * 1000;
let majPrete = null;

/**
 * Les mises à jour automatiques : electron-updater lit les Releases GitHub du
 * dépôt (`publish` d'electron-builder.yml, recopié dans resources/app-update.yml),
 * télécharge en arrière-plan la nouvelle version (seuls les blocs qui
 * changent, d'après le .blockmap), vérifie son empreinte SHA-512, puis
 * l'installe sans rien demander à la fermeture de SKITRACK. Une fois prête, il
 * propose aussi de redémarrer tout de suite. Les données (clés, mémoire des
 * fiches, comparateur, notes) restent : elles ne sont pas dans le dossier
 * d'installation. Hors ligne, rien ne s'affiche : l'erreur va au journal
 * `mises-a-jour.log`.
 */
function miseAJour(win) {
  if (!app.isPackaged) return;
  const { autoUpdater } = electronUpdater;
  const journal = createWriteStream(join(dossierDonnees(), "mises-a-jour.log"), { flags: "a" });
  const ecrire = (niveau) => (m) =>
    journal.write(`${new Date().toISOString()} ${niveau} ${m instanceof Error ? (m.stack ?? m.message) : m}\n`);
  autoUpdater.logger = { info: ecrire("info"), warn: ecrire("alerte"), error: ecrire("erreur"), debug: () => {} };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.disableWebInstaller = true;
  // L'installateur d'une version désormais installée (400 Mo) restait dans le
  // cache d'electron-updater jusqu'à la mise à jour suivante.
  const attente = join(process.env.LOCALAPPDATA ?? "", "skitrack-updater", "pending");
  try {
    for (const f of readdirSync(attente)) {
      const v = /^SKITRACK-(\d+)\.(\d+)\.(\d+)-x64\.exe(\.blockmap)?$/.exec(f);
      const [a, b, c] = app.getVersion().split(".").map(Number);
      if (v && (Number(v[1]) - a || Number(v[2]) - b || Number(v[3]) - c) <= 0) {
        rmSync(join(attente, f), { force: true });
        ecrire("info")(`installateur déjà appliqué retiré : ${f}`);
      }
    }
  } catch {
    /* pas de cache */
  }
  // La recette des mises à jour sert les versions depuis le poste lui-même
  // (docs/INSTALLATEUR-WINDOWS.md) ; aucune autre adresse n'est acceptée.
  const recette = process.env.SKITRACK_MAJ_URL;
  if (recette && /^http:\/\/127\.0\.0\.1:\d+\//.test(recette)) {
    autoUpdater.setFeedURL({ provider: "generic", url: recette });
  }
  autoUpdater.on("error", (err) => ecrire("erreur")(err));
  autoUpdater.on("update-downloaded", async (info) => {
    if (majPrete === info.version || win.isDestroyed()) return;
    majPrete = info.version;
    const { response } = await dialog.showMessageBox(win, {
      type: "info",
      title: "SKITRACK",
      message: `SKITRACK ${info.version} est prête.`,
      detail: "Elle s'installera d'elle-même à la fermeture de SKITRACK, ou tout de suite si vous redémarrez.",
      buttons: ["Redémarrer maintenant", "Plus tard"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response !== 0) return;
    enFermeture = true;
    arreterServeur();
    autoUpdater.quitAndInstall(true, true);
  });
  const verifier = () => autoUpdater.checkForUpdates().catch((err) => ecrire("erreur")(err));
  setTimeout(verifier, 10_000);
  setInterval(verifier, MAJ_INTERVALLE_MS);
}

/** Le serveur et tout ce qu'il a lancé (python.exe, navigateur de Playwright). */
function arreterServeur() {
  if (!serveur) return;
  if (process.platform === "win32" && serveur.pid) {
    spawnSync("taskkill", ["/PID", String(serveur.pid), "/T", "/F"], { windowsHide: true });
  }
  serveur?.kill();
}

if (process.platform === "win32") app.setAppUserModelId("fr.skitrack.app");

// Une seule instance : deux fenêtres voudraient le même port, et la seconde
// échouerait sans que l'on comprenne pourquoi.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Le menu par défaut d'Electron (en anglais, outils de développement,
  // « Learn More ») n'a rien à faire dans l'application installée. Ce menu-ci,
  // caché (Alt l'affiche), garde ses raccourcis : zoom (sur un petit écran,
  // dézoomer fait tenir l'app), rechargement, plein écran.
  if (app.isPackaged) {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: "Affichage",
          submenu: [
            { role: "reload", label: "Recharger" },
            { type: "separator" },
            { role: "resetZoom", label: "Taille réelle" },
            { role: "zoomIn", label: "Zoom avant" },
            { role: "zoomIn", accelerator: "CommandOrControl+=", visible: false },
            { role: "zoomOut", label: "Zoom arrière" },
            { type: "separator" },
            { role: "togglefullscreen", label: "Plein écran" },
          ],
        },
      ]),
    );
  }

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
    arreterServeur();
  });
}
