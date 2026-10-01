/**
 * Le relevé des grilles de forfaits sur les pages officielles.
 *
 * Tout ici est pur : les accès au réseau (robots.txt, page, navigateur, PDF)
 * sont passés par l'appelant (`scripts/releve-grilles-forfaits.ts`), ce qui
 * permet de tester le relevé entier sans réseau.
 *
 * Pour chaque source (`sourcesTarifs.ts`) et chacune de ses pages :
 *
 * 1. `robots.txt` est lu et **respecté** : une page interdite n'est pas
 *    demandée, et c'est écrit dans le rapport ;
 * 2. la page est lue selon son type : servie, rendue par un navigateur, PDF.
 *    Un refus (401, 403, 429), un défi anti-robot ou un captcha arrêtent la
 *    page : rien n'est contourné ;
 * 3. les lignes sont lues (`lecteurGrille.ts`), rangées en grilles par
 *    périmètre et par saison, puis contrôlées (`controle.ts`) ;
 * 4. un même périmètre publié par plusieurs sources (Les 3 Vallées, Portes
 *    du Soleil…) garde sa meilleure grille, et réunit les stations de toutes.
 *
 * Une grille déjà relevée n'est jamais effacée par un échec : elle reste,
 * avec sa date, tant qu'un relevé ne la remplace pas.
 */

import {
  adresseProduit,
  calendrierTarifaire,
  lireProduit,
  periodeDesProduits,
  periodesAuMemePrix,
  type ProduitLu,
} from "./boutique.ts";
import { controlerGrille } from "./controle.ts";
import { lireGrille, type Lecture, type ReperePerimetre, type TarifLu } from "./lecteurGrille.ts";
import { perimetre as creerPerimetre } from "./migration.ts";
import { plier } from "./periodesFr.ts";
import type { PageTarifs, PerimetreSource, SourceTarifs } from "./sourcesTarifs.ts";
import {
  anomaliesGrille,
  bornesSaison,
  LIBELLE_SAISON_ENTIERE,
  saisonDeJour,
  type Confiance,
  type GrilleTarifaire,
  type Perimetre,
  type Periode,
  type Tarif,
} from "./tarifsPeriode.ts";
import { lignesDepuisHtml } from "./texteStructure.ts";

/* ---------- Accès au réseau, fournis par l'appelant ---------- */

export type VerdictRobots = { autorise: boolean | null; regle: string; delaiMs: number };

export type Acces = {
  robots(url: string): Promise<VerdictRobots>;
  html(url: string, delaiMs: number): Promise<{ status: number; html: string }>;
  /** Le rendu d'un navigateur ; `blocage` dit un défi anti-robot rencontré. */
  navigateur(
    url: string,
    delaiMs: number,
  ): Promise<{ status: number; html: string; blocage: string | null }>;
  /** Le texte de chaque page d'un PDF. */
  pdf(url: string, delaiMs: number): Promise<{ status: number; pages: string[] }>;
};

export type CauseEchec =
  | "robots"
  | "refus"
  | "http"
  | "reseau"
  | "sans-tarif"
  | "prix-ambigus"
  | "grille-image"
  | "controle";

export const CAUSE_LBL: Record<CauseEchec, string> = {
  robots: "page interdite par robots.txt",
  refus: "accès refusé par le site (401, 403, 429 ou défi anti-robot)",
  http: "page en erreur",
  reseau: "site injoignable",
  "sans-tarif": "page lue, aucun tarif reconnu",
  "prix-ambigus": "plusieurs prix par case, sans dire lesquels",
  "grille-image": "grille publiée en image",
  controle: "grille rejetée par le contrôle qualité",
};

export type Echec = { source: string; url: string; cause: CauseEchec; detail: string };

/* ---------- Périmètres ---------- */

export type PerimetreResolu = {
  perimetre: Perimetre;
  stationIds: string[];
  repere: ReperePerimetre | null;
};

const cleFiche = (nom: string) =>
  plier(nom)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Les périmètres d'une source, avec leurs stations et le repère qui les
 *  désigne dans un titre de page. */
export function perimetresDeSource(
  source: SourceTarifs,
  stationsDe: (p: PerimetreSource) => string[],
): PerimetreResolu[] {
  return source.perimetres.map((p) => {
    const perimetre = creerPerimetre(p.type, p.nom, cleFiche(p.nom));
    return {
      perimetre,
      stationIds: [...new Set(stationsDe(p))].sort(),
      repere: p.motif ? { cle: perimetre.cle, motif: new RegExp(p.motif) } : null,
    };
  });
}

/* ---------- Des tarifs lus aux grilles ---------- */

const cleTarif = (t: Tarif) =>
  [JSON.stringify(t.duree), t.categorie, t.libelleCategorie, t.canal, t.restriction ?? ""].join(
    "|",
  );

/**
 * La saison d'une page qui ne date pas ses tarifs : celle visée si la page la
 * cite, sinon la plus récente qu'elle cite, sinon celle visée (et c'est noté).
 */
export function saisonDeLaPage(
  lecture: Lecture,
  cible: string,
): { saison: string; ecrite: boolean } {
  if (lecture.saisons.includes(cible)) return { saison: cible, ecrite: true };
  const avant = lecture.saisons.filter((s) => s <= cible).sort();
  if (avant.length) return { saison: avant[avant.length - 1], ecrite: true };
  return { saison: cible, ecrite: false };
}

export type ContexteGrilles = {
  source: SourceTarifs;
  url: string;
  saison: string;
  perimetres: PerimetreResolu[];
  maintenant: string;
};

/** Les grilles d'une page lue, par périmètre et par saison. */
export function grillesDepuisLecture(
  lecture: Lecture,
  ctx: ContexteGrilles,
): { grilles: GrilleTarifaire[]; problemes: string[] } {
  const problemes = [...lecture.problemes];
  const defaut = ctx.perimetres[0];
  const page = saisonDeLaPage(lecture, ctx.saison);
  let hote = ctx.url;
  try {
    hote = new URL(ctx.url).host;
  } catch {
    /* l'adresse telle quelle */
  }

  const parPerimetre = new Map<string, TarifLu[]>();
  for (const t of lecture.tarifs) {
    const cle = t.perimetre ?? defaut.perimetre.cle;
    parPerimetre.set(cle, [...(parPerimetre.get(cle) ?? []), t]);
  }

  const grilles: GrilleTarifaire[] = [];
  for (const [cle, tarifs] of parPerimetre) {
    const res = ctx.perimetres.find((p) => p.perimetre.cle === cle) ?? defaut;
    // Par saison, les périodes : une par plage de dates, sous son libellé.
    const saisons = new Map<string, Map<string, Periode>>();
    const sansDates = new Set<string>();
    const ajouter = (saison: string, p: Omit<Periode, "tarifs">, t: Tarif) => {
      const periodes = saisons.get(saison) ?? new Map<string, Periode>();
      const k = `${p.libelle}|${p.debut}|${p.fin}`;
      const per = periodes.get(k) ?? { ...p, tarifs: [] };
      const doublon = per.tarifs.find((x) => cleTarif(x) === cleTarif(t));
      if (!doublon) per.tarifs.push(t);
      else if (doublon.prix !== t.prix) {
        problemes.push(
          `${res.perimetre.nom}, « ${p.libelle} » : ${t.libelleDuree} ${t.libelleCategorie} lu deux fois (${doublon.prix} et ${t.prix} €), le premier gardé`,
        );
      }
      periodes.set(k, per);
      saisons.set(saison, periodes);
    };
    for (const { periode, tarif } of tarifs) {
      if (periode?.plages.length) {
        for (const plage of periode.plages) {
          const saison = saisonDeJour(plage.debut);
          if (!saison) continue;
          ajouter(
            saison,
            { libelle: periode.libelle, debut: plage.debut, fin: plage.fin, saisonEntiere: false },
            tarif,
          );
        }
      } else if (periode) {
        // Une période nommée mais sans date (« Haute saison » sans ses
        // bornes) : on ne sait pas quand elle s'applique.
        sansDates.add(periode.libelle);
      } else {
        const b = bornesSaison(page.saison)!;
        ajouter(
          page.saison,
          { libelle: LIBELLE_SAISON_ENTIERE, debut: b.debut, fin: b.fin, saisonEntiere: true },
          tarif,
        );
      }
    }
    for (const l of sansDates)
      problemes.push(`${res.perimetre.nom} : période « ${l} » sans dates, ses tarifs sont écartés`);

    for (const [saison, periodes] of saisons) {
      const liste = [...periodes.values()].sort((a, b) =>
        a.debut !== b.debut ? (a.debut < b.debut ? -1 : 1) : a.fin < b.fin ? -1 : 1,
      );
      const datees = liste.every((p) => !p.saisonEntiere);
      // Haute : chaque tarif a sa période datée. Sans date publiée, la grille
      // vaut pour la saison entière et le dit : confiance moyenne.
      const confiance: Confiance = datees ? "haute" : "moyenne";
      const notes = [
        datees
          ? "Périodes lues sur la page officielle, telles que publiées."
          : liste.some((p) => !p.saisonEntiere)
            ? "Périodes lues sur la page officielle ; les tarifs publiés sans date forment une période « Saison entière »."
            : "Tarifs publiés sans période : une période « Saison entière ».",
      ];
      if (!datees && !page.ecrite)
        notes.push(`Saison non écrite sur la page : rangée à la saison ${saison}.`);
      const cleCourte = cle.replace(/^(domaine|station):/, "");
      grilles.push({
        id: `officiel:${ctx.source.id}:${cleCourte}:${saison}`,
        saison,
        perimetre: res.perimetre,
        stationIds: res.stationIds,
        periodes: liste,
        source: { origine: "officiel", url: ctx.url, libelle: `Page tarifs officielle, ${hote}` },
        scrapeLe: ctx.maintenant,
        confiance,
        notes,
      });
    }
  }
  return { grilles, problemes };
}

/* ---------- Le relevé ---------- */

export type Rapport = {
  le: string;
  saison: string;
  sources: number;
  pages: number;
  pagesLues: number;
  grilles: number;
  periodes: number;
  stationsCouvertes: number;
  /** Par cause, les pages en échec : « source : adresse (détail) ». */
  echecs: Partial<Record<CauseEchec, string[]>>;
  rejets: string[];
  alertes: string[];
  /** Les grilles relevées confrontées à un témoin (Skiinfo) : les écarts à
   *  vérifier. */
  verifications: string[];
  problemes: string[];
};

export type ContexteReleve = {
  saison: string;
  maintenant: string;
  stationsDe: (p: PerimetreSource) => string[];
  /** Les grilles connues avant ce relevé : officielles d'un relevé précédent,
   *  et migrées. Elles servent de référence pour l'écart. */
  precedentes: readonly GrilleTarifaire[];
  signal?: AbortSignal;
  /** Suivi, ligne par ligne, pour la console. */
  journal?: (ligne: string) => void;
  /** La vérification d'une grille retenue contre un témoin indépendant
   *  (Skiinfo, `verification.ts`) : les écarts à signaler, rien de modifié. */
  verifier?: (g: GrilleTarifaire) => string[];
};

const RANG: Record<Confiance, number> = { haute: 3, moyenne: 2, faible: 1 };
const nbTarifs = (g: GrilleTarifaire) => g.periodes.reduce((n, p) => n + p.tarifs.length, 0);

/** La référence d'une grille pour mesurer un écart : la précédente du même
 *  périmètre et de la même saison, sinon la plus récente qui couvre les mêmes
 *  stations. */
export function grillePrecedente(
  g: GrilleTarifaire,
  precedentes: readonly GrilleTarifaire[],
): GrilleTarifaire | null {
  const meme = precedentes.filter((p) => p.perimetre.cle === g.perimetre.cle);
  const exacte = meme.find((p) => p.saison === g.saison);
  if (exacte) return exacte;
  const proches = (
    meme.length
      ? meme
      : precedentes.filter(
          (p) =>
            p.perimetre.type === g.perimetre.type &&
            p.stationIds.some((s) => g.stationIds.includes(s)),
        )
  )
    .slice()
    .sort((a, b) => (a.saison < b.saison ? 1 : -1));
  return proches[0] ?? null;
}

async function lirePage(
  source: SourceTarifs,
  page: PageTarifs,
  acces: Acces,
): Promise<{ lignes: string[] } | { echec: Echec }> {
  const echec = (cause: CauseEchec, detail: string) => ({
    echec: { source: source.id, url: page.url, cause, detail },
  });
  if (page.lecteur === "image") return echec("grille-image", "aucune lecture d'image");
  const robots = await acces.robots(page.url);
  if (robots.autorise === false) return echec("robots", robots.regle);
  try {
    if (page.lecteur === "pdf") {
      const r = await acces.pdf(page.url, robots.delaiMs);
      if ([401, 403, 429].includes(r.status)) return echec("refus", `HTTP ${r.status}`);
      if (r.status >= 400) return echec("http", `HTTP ${r.status}`);
      // Une page du PDF est un bloc : son titre de période ne déborde pas
      // sur la suivante.
      return {
        lignes: r.pages.flatMap((p, i) => [
          `# Page ${i + 1}`,
          ...p
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean),
        ]),
      };
    }
    const r =
      page.lecteur === "navigateur"
        ? await acces.navigateur(page.url, robots.delaiMs)
        : { ...(await acces.html(page.url, robots.delaiMs)), blocage: null };
    if (r.blocage) return echec("refus", r.blocage);
    if ([401, 403, 429].includes(r.status)) return echec("refus", `HTTP ${r.status}`);
    if (r.status >= 400) return echec("http", `HTTP ${r.status}`);
    return { lignes: lignesDepuisHtml(r.html) };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    return echec("reseau", err instanceof Error ? err.message : String(err));
  }
}

/* ---------- Boutique produit par produit ---------- */

type Lire = (page: PageTarifs) => Promise<{ lignes: string[] } | { echec: Echec }>;

/** Au-delà, une boutique qui ne répond plus n'est plus sollicitée. */
const ECHECS_MAX_BOUTIQUE = 5;

/**
 * Le relevé d'une boutique qui ne publie son prix caisse que produit par
 * produit (`boutique.ts`) : le calendrier, un forfait repère au premier jour
 * de chaque période, puis chaque durée et catégorie au premier jour des
 * périodes réunies. Un refus ou une interdiction par robots.txt arrête la
 * boutique : rien n'est redemandé.
 */
export async function releverBoutique(
  source: SourceTarifs,
  perimetres: readonly PerimetreResolu[],
  lire: Lire,
  ctx: Pick<ContexteReleve, "saison" | "maintenant" | "signal" | "journal">,
): Promise<{
  grille: GrilleTarifaire | null;
  echecs: Echec[];
  problemes: string[];
  pages: number;
  pagesLues: number;
}> {
  const b = source.boutique!;
  const echecs: Echec[] = [];
  const problemes: string[] = [];
  let pages = 0;
  let pagesLues = 0;
  const vide = () => ({ grille: null, echecs, problemes, pages, pagesLues });
  const res = perimetres.find((p) => p.perimetre.nom === b.perimetre) ?? perimetres[0];

  const cal = await lire(b.calendrier);
  if ("echec" in cal) {
    echecs.push(cal.echec);
    return vide();
  }
  const { segments, problemes: pc } = calendrierTarifaire(cal.lignes, ctx.saison);
  problemes.push(...pc);
  if (!segments.length) {
    echecs.push({
      source: source.id,
      url: b.calendrier.url,
      cause: "sans-tarif",
      detail: "calendrier tarifaire illisible",
    });
    return vide();
  }

  let arret = false;
  const lus = new Map<string, ProduitLu | null>();
  const sonder = async (modele: string, date: string, categorie: string) => {
    const url = adresseProduit(modele, date, categorie);
    if (lus.has(url)) return lus.get(url)!;
    if (arret || ctx.signal?.aborted) return null;
    pages += 1;
    const r = await lire({ url, lecteur: b.lecteur });
    if ("echec" in r) {
      echecs.push(r.echec);
      if (
        r.echec.cause === "robots" ||
        r.echec.cause === "refus" ||
        echecs.length >= ECHECS_MAX_BOUTIQUE
      )
        arret = true;
      lus.set(url, null);
      return null;
    }
    pagesLues += 1;
    let p = lireProduit(r.lignes);
    if (!p) problemes.push(`${url} : aucun forfait lisible sur la page`);
    else if (p.premierJour && p.premierJour !== date) {
      problemes.push(`${url} : la boutique a servi le ${p.premierJour} au lieu du ${date}, écarté`);
      p = null;
    }
    lus.set(url, p);
    return p;
  };

  const repere: (number | null)[] = [];
  for (const s of segments)
    repere.push((await sonder(b.produits[0], s.debut, b.categories[0]))?.prixPublic ?? null);
  const periodes: Periode[] = [];
  for (const pb of periodesAuMemePrix(segments, repere)) {
    const produits: ProduitLu[] = [];
    for (const modele of b.produits)
      for (const categorie of b.categories) {
        const p = await sonder(modele, pb.debut, categorie);
        if (p) produits.push(p);
      }
    const { periode, problemes: pp } = periodeDesProduits(pb, produits);
    problemes.push(...pp);
    if (periode.tarifs.length) periodes.push(periode);
  }
  ctx.journal?.(
    `${source.id} : boutique, ${pagesLues} page(s) produit lue(s) sur ${pages}, ${periodes.length} période(s)`,
  );
  if (!periodes.length) {
    if (!echecs.length)
      echecs.push({
        source: source.id,
        url: b.calendrier.url,
        cause: "sans-tarif",
        detail: "aucune page produit lisible",
      });
    return vide();
  }
  let hote = b.calendrier.url;
  try {
    hote = new URL(b.calendrier.url).host;
  } catch {
    /* l'adresse telle quelle */
  }
  const cle = res.perimetre.cle.replace(/^(domaine|station):/, "");
  return {
    grille: {
      id: `officiel:${source.id}:boutique:${cle}:${ctx.saison}`,
      saison: ctx.saison,
      perimetre: res.perimetre,
      stationIds: res.stationIds,
      periodes,
      source: {
        origine: "officiel",
        url: b.calendrier.url,
        libelle: `Boutique officielle, ${hote} (prix caisse lus produit par produit)`,
      },
      scrapeLe: ctx.maintenant,
      confiance: "haute",
      notes: [
        "Prix public en caisse lu sur la page de chaque forfait de la boutique officielle, au premier jour de chaque période du calendrier publié.",
        "Périodes qui se suivent au même prix caisse réunies ; les remises en ligne ne font pas une période.",
      ],
    },
    echecs,
    problemes,
    pages,
    pagesLues,
  };
}

/** Le relevé de toutes les sources. */
export async function releverGrilles(
  sources: readonly SourceTarifs[],
  acces: Acces,
  ctx: ContexteReleve,
): Promise<{ grilles: GrilleTarifaire[]; rapport: Rapport }> {
  const echecs: Echec[] = [];
  const rejets: string[] = [];
  const alertes: string[] = [];
  const problemes: string[] = [];
  const candidates: GrilleTarifaire[] = [];
  let pages = 0;
  let pagesLues = 0;

  const retenir = (source: SourceTarifs, g: GrilleTarifaire): boolean => {
    const forme = anomaliesGrille(g);
    const c = forme.length
      ? { grille: null, rejets: forme.map((a) => `${g.id} : ${a}`), alertes: [] }
      : controlerGrille(g, grillePrecedente(g, ctx.precedentes));
    rejets.push(...c.rejets.map((r) => `${source.id} : ${r}`));
    alertes.push(...c.alertes.map((a) => `${source.id} : ${a}`));
    if (c.grille) candidates.push(c.grille);
    return !!c.grille;
  };

  for (const source of sources) {
    if (ctx.signal?.aborted) break;
    const perimetres = perimetresDeSource(source, ctx.stationsDe);
    // Une page lue deux fois (la page des tarifs qui porte aussi le
    // calendrier d'une boutique) n'est demandée qu'une fois.
    const deja = new Map<string, Promise<{ lignes: string[] } | { echec: Echec }>>();
    const lire: Lire = (page) => {
      const k = `${page.lecteur}|${page.url}`;
      if (!deja.has(k)) deja.set(k, lirePage(source, page, acces));
      return deja.get(k)!;
    };
    for (const page of source.pages) {
      if (ctx.signal?.aborted) break;
      pages += 1;
      const lu = await lire(page);
      if ("echec" in lu) {
        echecs.push(lu.echec);
        ctx.journal?.(
          `${source.id} : ${page.url} : ${CAUSE_LBL[lu.echec.cause]} (${lu.echec.detail})`,
        );
        continue;
      }
      pagesLues += 1;
      const lecture = lireGrille(lu.lignes, {
        saison: ctx.saison,
        perimetres: perimetres.map((p) => p.repere).filter((r): r is ReperePerimetre => !!r),
      });
      const { grilles, problemes: pbs } = grillesDepuisLecture(lecture, {
        source,
        url: page.url,
        saison: ctx.saison,
        perimetres,
        maintenant: ctx.maintenant,
      });
      problemes.push(...pbs.map((p) => `${source.id} (${page.url}) : ${p}`));
      if (!grilles.length) {
        const ambigus = lecture.problemes.some((p) => p.includes("plusieurs prix"));
        echecs.push({
          source: source.id,
          url: page.url,
          cause: ambigus ? "prix-ambigus" : "sans-tarif",
          detail: ambigus
            ? `${lecture.problemes.length} case(s) à plusieurs prix`
            : "aucune ligne de durée chiffrée",
        });
        ctx.journal?.(
          `${source.id} : ${page.url} : ${ambigus ? CAUSE_LBL["prix-ambigus"] : CAUSE_LBL["sans-tarif"]}`,
        );
        continue;
      }
      let retenues = 0;
      for (const g of grilles) if (retenir(source, g)) retenues += 1;
      if (!retenues) {
        echecs.push({
          source: source.id,
          url: page.url,
          cause: "controle",
          detail: `${grilles.length} grille(s) rejetée(s)`,
        });
      }
      ctx.journal?.(`${source.id} : ${page.url} : ${retenues} grille(s)`);
    }
    if (source.boutique && !ctx.signal?.aborted) {
      const r = await releverBoutique(source, perimetres, lire, ctx);
      pages += r.pages;
      pagesLues += r.pagesLues;
      echecs.push(...r.echecs);
      problemes.push(...r.problemes.map((p) => `${source.id} (boutique) : ${p}`));
      if (r.grille && !retenir(source, r.grille))
        echecs.push({
          source: source.id,
          url: source.boutique.calendrier.url,
          cause: "controle",
          detail: "grille de la boutique rejetée",
        });
    }
  }

  // Un même périmètre et une même saison : la meilleure grille, les stations
  // de toutes.
  const parCle = new Map<string, GrilleTarifaire[]>();
  for (const g of candidates) {
    const k = `${g.perimetre.cle}|${g.saison}`;
    parCle.set(k, [...(parCle.get(k) ?? []), g]);
  }
  const grilles: GrilleTarifaire[] = [];
  for (const liste of parCle.values()) {
    const meilleure = [...liste].sort(
      (a, b) =>
        RANG[b.confiance] - RANG[a.confiance] ||
        b.periodes.length - a.periodes.length ||
        nbTarifs(b) - nbTarifs(a),
    )[0];
    const stations = [...new Set(liste.flatMap((g) => g.stationIds))].sort();
    grilles.push({ ...meilleure, stationIds: stations });
  }
  grilles.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const verifications = ctx.verifier ? grilles.flatMap((g) => ctx.verifier!(g)) : [];

  const parCause: Partial<Record<CauseEchec, string[]>> = {};
  for (const e of echecs) (parCause[e.cause] ??= []).push(`${e.source} : ${e.url} (${e.detail})`);
  return {
    grilles,
    rapport: {
      le: ctx.maintenant,
      saison: ctx.saison,
      sources: sources.length,
      pages,
      pagesLues,
      grilles: grilles.length,
      periodes: grilles.reduce((n, g) => n + g.periodes.length, 0),
      stationsCouvertes: new Set(grilles.flatMap((g) => g.stationIds)).size,
      echecs: parCause,
      rejets,
      alertes,
      verifications,
      problemes,
    },
  };
}

/**
 * Les grilles à écrire : celles du relevé, plus celles d'un relevé précédent
 * que celui-ci n'a pas remplacées. Un échec n'efface rien.
 */
export function fusionnerAvecPrecedent(
  nouvelles: readonly GrilleTarifaire[],
  anciennes: readonly GrilleTarifaire[],
): GrilleTarifaire[] {
  const vues = new Set(nouvelles.map((g) => `${g.perimetre.cle}|${g.saison}`));
  const gardees = anciennes.filter((g) => !vues.has(`${g.perimetre.cle}|${g.saison}`));
  return [...nouvelles, ...gardees].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
