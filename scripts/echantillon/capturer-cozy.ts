/**
 * Capture ce que CozyCozy échange avec son `/api/` quand on cherche, puis
 * quand on ouvre une fiche : une fiche Airbnb, une Abritel, une Booking. Le
 * lecteur de fiches Cozy (description, équipements, salles de bain, « Bon à
 * savoir », galerie) s'écrira sur ces réponses réelles, pas sur une forme
 * devinée.
 *
 * À lancer sur une machine qui a accès à CozyCozy, depuis la racine du dépôt :
 *
 *   node --import ./scripts/echantillon/enregistrer.mjs --experimental-strip-types \
 *     scripts/echantillon/capturer-cozy.ts --station la-plagne --du 2026-10-26 --au 2026-10-28
 *
 * Options : --station <id> (défaut : la-plagne), --du, --au (défaut : du
 * 26 au 28 octobre 2026), --voyageurs <n> (défaut : 2), --sortie <dossier>.
 *
 * Le navigateur est celui de l'application (`browser.server.ts`) ; la page
 * fait elle-même ses requêtes, comme pour une personne : le script observe et
 * clique, une fiche à la fois, quelques secondes d'écart. robots.txt est lu
 * et noté dans le manifeste, sans bloquer (CLAUDE.md, `robots.ts`). Aucun
 * en-tête ni cookie n'est écrit : seulement l'adresse, le corps de la requête
 * et la réponse. Rend un dossier `captures/cozy-…/` (hors Git) :
 * `manifest.json`, `api/` (une réponse par fichier) et `fiches/` (le texte et
 * le HTML de chaque fiche ouverte).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Page } from "playwright";
import type { LiveSearchInput } from "../../src/lib/scrape/types.ts";

/** Une réponse de `/api/`, telle que la page l'a reçue. */
export type Echange = {
  n: number;
  /** « recherche », ou la fiche ouverte au moment de la réponse. */
  phase: string;
  methode: string;
  url: string;
  requete: unknown;
  statut: number;
  reponse: unknown;
};

export type FicheOuverte = {
  fournisseur: "airbnb" | "abritel" | "booking";
  accommodationId: string;
  nom: string;
  ouverte: boolean;
  /** L'adresse de la page après le clic : une fiche peut avoir la sienne. */
  adresse: string | null;
  echanges: number[];
  texte: string | null;
};

const FOURNISSEURS = ["airbnb", "abritel", "booking"] as const;
const PAUSE_ENTRE_FICHES_MS = 4_000;
const ATTENTE_FICHE_MS = 6_000;

function pause(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function lireJson(texte: string): unknown {
  try {
    return JSON.parse(texte);
  } catch {
    return texte.length > 200_000 ? `${texte.slice(0, 200_000)}…` : texte;
  }
}

/** Le dernier mot du chemin d'une adresse `/api/…`, pour nommer son fichier. */
export function nomEchange(url: string): string {
  try {
    return (
      new URL(url).pathname
        .replace(/^\/api\//, "")
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-|-$/g, "") || "api"
    );
  } catch {
    return "api";
  }
}

/**
 * La première fiche de chaque fournisseur dans les réponses `getResultList`
 * capturées : son identifiant Cozy et son nom, que la carte affiche.
 */
export function fichesAOuvrir(
  reponses: readonly unknown[],
): Omit<FicheOuverte, "ouverte" | "adresse" | "echanges" | "texte">[] {
  const out = new Map<string, Omit<FicheOuverte, "ouverte" | "adresse" | "echanges" | "texte">>();
  for (const r of reponses) {
    const entries = r && typeof r === "object" ? (r as { entries?: unknown }).entries : null;
    if (!Array.isArray(entries)) continue;
    for (const e of entries) {
      if (!e || typeof e !== "object") continue;
      const o = e as Record<string, unknown>;
      if (o.type !== "result" || typeof o.name !== "string" || !o.name.trim()) continue;
      const hits = Array.isArray(o.highlightedResults) ? o.highlightedResults : [];
      for (const h of hits) {
        const code =
          h && typeof h === "object"
            ? String((h as Record<string, unknown>).providerCode ?? "")
            : "";
        const f = FOURNISSEURS.find((x) => x === code);
        if (!f || out.has(f)) continue;
        out.set(f, {
          fournisseur: f,
          accommodationId: String(o.accommodationId ?? ""),
          nom: o.name.trim(),
        });
      }
    }
  }
  return FOURNISSEURS.flatMap((f) => (out.has(f) ? [out.get(f)!] : []));
}

/** Accepte le bandeau des cookies s'il en a un ; rien sinon. */
async function accepterCookies(page: Page): Promise<void> {
  try {
    await page
      .getByRole("button", { name: /tout accepter|accepter et fermer|j'accepte|accepter/i })
      .first()
      .click({ timeout: 2_500 });
  } catch {
    /* pas de bandeau */
  }
}

/** Le texte et le HTML de la fiche ouverte : la fenêtre (`role="dialog"`), ou la page. */
async function contenuFiche(page: Page): Promise<{ texte: string; html: string } | null> {
  return page.evaluate(() => {
    const el =
      document.querySelector('[role="dialog"]') ?? document.querySelector("main") ?? document.body;
    if (!el) return null;
    const copie = el.cloneNode(true) as Element;
    for (const s of copie.querySelectorAll("script, style, noscript")) s.remove();
    return { texte: (el as HTMLElement).innerText ?? "", html: copie.outerHTML };
  });
}

/**
 * Ouvre la recherche, attend ses réponses, puis chaque fiche choisie, une à
 * la fois. Rend les échanges et les fiches ; n'écrit rien.
 */
export async function capturer(
  page: Page,
  input: LiveSearchInput,
  url: string,
  journal: (m: string) => void = console.info,
): Promise<{ echanges: Echange[]; fiches: FicheOuverte[] }> {
  const echanges: Echange[] = [];
  let phase = "recherche";
  let compteur = 0;
  const enCours: Promise<void>[] = [];
  page.on("response", (r) => {
    if (!/^https:\/\/www\.cozycozy\.com\/api\//.test(r.url())) return;
    const req = r.request();
    const n = ++compteur;
    const ici = phase;
    enCours.push(
      r
        .text()
        .then((t) => {
          echanges.push({
            n,
            phase: ici,
            methode: req.method(),
            url: r.url(),
            requete: req.postData() ? lireJson(req.postData()!) : null,
            statut: r.status(),
            reponse: lireJson(t),
          });
        })
        .catch(() => undefined),
    );
  });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await accepterCookies(page);
  // La recherche se remplit en arrière-plan : on attend ses premières listes.
  const fin = Date.now() + 25_000;
  while (Date.now() < fin && !echanges.some((e) => /getResultList/.test(e.url))) await pause(250);
  await pause(3_000);
  await Promise.all(enCours);
  const listes = echanges.filter((e) => /getResultList/.test(e.url)).map((e) => e.reponse);
  const choix = fichesAOuvrir(listes);
  journal(
    `[capture] ${echanges.length} réponses /api/ pendant la recherche ; fiches à ouvrir : ${choix.map((c) => c.fournisseur).join(", ") || "aucune"}`,
  );
  const fiches: FicheOuverte[] = [];
  for (const c of choix) {
    phase = `fiche ${c.fournisseur} ${c.accommodationId}`;
    const avant = compteur;
    const fiche: FicheOuverte = { ...c, ouverte: false, adresse: null, echanges: [], texte: null };
    try {
      const carte = page.getByText(c.nom, { exact: true }).first();
      await carte.scrollIntoViewIfNeeded({ timeout: 5_000 });
      await carte.click({ timeout: 5_000 });
      fiche.ouverte = true;
      await pause(ATTENTE_FICHE_MS);
      // Les onglets de la fiche font peut-être leurs propres requêtes (avis, offres).
      for (const onglet of ["Avis", "Offres"]) {
        try {
          await page.getByText(onglet, { exact: true }).first().click({ timeout: 2_000 });
          await pause(2_000);
        } catch {
          /* onglet absent */
        }
      }
      fiche.adresse = page.url();
      const contenu = await contenuFiche(page);
      fiche.texte = contenu?.texte ?? null;
      (fiche as FicheOuverte & { html?: string }).html = contenu?.html;
    } catch (err) {
      journal(
        `[capture] fiche ${c.fournisseur} « ${c.nom} » non ouverte : ${(err as Error).message.split("\n")[0]}`,
      );
    }
    await Promise.all(enCours);
    fiche.echanges = echanges.filter((e) => e.n > avant).map((e) => e.n);
    journal(
      `[capture] fiche ${c.fournisseur} « ${c.nom} » : ${fiche.echanges.length} réponse(s) /api/ ` +
        `(${[...new Set(echanges.filter((e) => e.n > avant).map((e) => nomEchange(e.url)))].join(", ") || "aucune"})`,
    );
    fiches.push(fiche);
    // Refermer : Échap, puis retour si la fiche avait sa propre adresse.
    await page.keyboard.press("Escape").catch(() => undefined);
    if (fiche.adresse && fiche.adresse !== page.url()) await page.goBack().catch(() => undefined);
    await pause(PAUSE_ENTRE_FICHES_MS);
  }
  phase = "fin";
  await Promise.all(enCours);
  echanges.sort((a, b) => a.n - b.n);
  return { echanges, fiches };
}

/** Écrit la capture : manifeste, une réponse par fichier, le texte et le HTML de chaque fiche. */
export function ecrireCapture(
  dossier: string,
  manifeste: Record<string, unknown>,
  echanges: readonly Echange[],
  fiches: readonly FicheOuverte[],
): void {
  mkdirSync(join(dossier, "api"), { recursive: true });
  mkdirSync(join(dossier, "fiches"), { recursive: true });
  for (const e of echanges) {
    writeFileSync(
      join(dossier, "api", `${String(e.n).padStart(3, "0")}-${nomEchange(e.url)}.json`),
      JSON.stringify(e, null, 1),
    );
  }
  for (const f of fiches) {
    const base = join(dossier, "fiches", `${f.fournisseur}-${f.accommodationId}`);
    if (f.texte != null) writeFileSync(`${base}.txt`, f.texte);
    const html = (f as FicheOuverte & { html?: string }).html;
    if (html) writeFileSync(`${base}.html`, html);
  }
  const resume = fiches.map(({ texte, ...f }) => ({
    ...f,
    html: undefined,
    texteCaracteres: texte?.length ?? 0,
  }));
  writeFileSync(
    join(dossier, "manifest.json"),
    JSON.stringify({ ...manifeste, fiches: resume }, null, 1),
  );
}

async function principal(): Promise<void> {
  const args = process.argv.slice(2);
  const arg = (nom: string, defaut: string) => {
    const i = args.indexOf(`--${nom}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : defaut;
  };
  const { stationById } = await import("../../src/lib/stations.ts");
  const { cozySearchUrl } = await import("../../src/lib/scrape/cozy.server.ts");
  const { withBrowser } = await import("../../src/lib/scrape/browser.server.ts");
  const { parseRobots, robotsAllows } = await import("../../src/lib/scrape/robots.ts");
  const station = stationById(arg("station", "la-plagne"));
  if (!station) throw new Error(`station inconnue : ${arg("station", "la-plagne")}`);
  const input: LiveSearchInput = {
    stationId: station.id,
    stationName: station.name,
    lat: station.lat,
    lon: station.lon,
    checkIn: arg("du", "2026-10-26"),
    checkOut: arg("au", "2026-10-28"),
    guests: Number(arg("voyageurs", "2")),
    bedrooms: 0,
  };
  const url = cozySearchUrl(input);
  const horodatage = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dossier = arg("sortie", join("captures", `cozy-${horodatage}`));
  const { echanges, fiches, robots } = await withBrowser(async (open) => {
    const page = await open();
    // robots.txt : lu et noté, sans bloquer (CLAUDE.md).
    let robots: { statut: number; texte: string } | null = null;
    try {
      const r = await page
        .context()
        .request.get("https://www.cozycozy.com/robots.txt", { timeout: 15_000 });
      robots = { statut: r.status(), texte: await r.text() };
    } catch {
      robots = null;
    }
    return { ...(await capturer(page, input, url)), robots };
  });
  const regles = robots ? parseRobots(robots.texte) : [];
  const chemins = [...new Set(echanges.map((e) => new URL(e.url).pathname))];
  ecrireCapture(
    dossier,
    {
      capture: new Date().toISOString(),
      recherche: { ...input, url },
      robots: robots && {
        statut: robots.statut,
        texte: robots.texte,
        // Noté, pas appliqué : robots.txt ne bloque aucun relevé (CLAUDE.md).
        verdicts: Object.fromEntries(chemins.map((p) => [p, robotsAllows(regles, p)])),
      },
    },
    echanges,
    fiches,
  );
  console.info(
    `[capture] ${echanges.length} réponses et ${fiches.filter((f) => f.ouverte).length} fiche(s) ouverte(s) écrites dans ${dossier}`,
  );
  process.exit(0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  principal().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
