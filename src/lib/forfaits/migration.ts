/**
 * La migration des prix existants vers les grilles par période.
 *
 * Trois sources de prix existaient avant les grilles :
 *
 * 1. le **catalogue** (`catalog.json`) : pour 172 domaines, un 6 jours adulte
 *    relevé en août 2026, parfois la journée, le 6 jours enfant et la saison,
 *    et deux estimations. Aucune date de validité ;
 * 2. le **référentiel Monde** (`monde/data/vuesDomaines.json`) : les grilles
 *    Skiinfo, skiresort et bergfex. Seul bergfex date ses tarifs ;
 * 3. la **saisie** de l'écran Forfaits (`grille.ts`), gardée dans le
 *    navigateur, par durée et catégorie, sans période.
 *
 * Règle : **rien n'est perdu, rien n'est inventé.** Un prix sans date devient
 * une période unique « saison entière » ; une grille datée garde ses dates.
 * Toute grille migrée est de confiance faible : un ancien relevé, parfois
 * d'une saison passée, parfois d'un agrégateur, n'a pas la valeur d'une page
 * officielle relue.
 *
 * Tout est pur : le script `build-grilles-forfaits.ts` lit les fichiers et
 * écrit le résultat. Le relevé du magasin serveur, qui change pendant que
 * l'application tourne, est converti à la lecture (`grillesDuMagasin`).
 */

import { cleDomaine } from "./catalog.ts";
import { dateLbl } from "../provenance.ts";
import type { DomainForfait, ForfaitRow } from "./types.ts";
import type { Grille as GrilleSaisie } from "./grille.ts";
import type { ForfaitVue } from "../monde/vues.ts";
import {
  bornesSaison,
  LIBELLE_SAISON_ENTIERE,
  periodeSaisonEntiere,
  saisonDeJour,
  type CategorieTarif,
  type Duree,
  type GrilleTarifaire,
  type Perimetre,
  type Periode,
  type Tarif,
} from "./tarifsPeriode.ts";

/* ---------- Lecture des libellés ---------- */

const plier = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * La durée d'un libellé publié.
 *
 * L'ordre compte : « 1 Jour à partir de 12:30 » commence comme une journée et
 * n'en est pas une.
 */
export function dureeDepuisLibelle(libelle: string): { duree: Duree; restriction: string | null } {
  const l = plier(libelle);
  const restriction = /week-?end/.test(l) ? "le week-end" : null;
  const des = /(?:^|\s)(?:a partir de|a|des)\s*(\d{1,2})\s*[:h]\s*(\d{2})/.exec(l);
  if (des)
    return {
      duree: { type: "partielle", heures: null, des: `${des[1].padStart(2, "0")}:${des[2]}` },
      restriction,
    };
  // « Forfait 1/2j (ou 4h si proposé) » : une demi-journée, quatre heures
  // seulement là où la station les vend.
  if (/1\/2\s*j|demi|half|halbtag/.test(l))
    return { duree: { type: "partielle", heures: null, des: null }, restriction };
  const heures = /(\d{1,2})\s*(?:heures?|h\b|hours?|stunden?)/.exec(l);
  if (heures && !/jour|tag|day/.test(l))
    return { duree: { type: "partielle", heures: Number(heures[1]), des: null }, restriction };
  const n = /(?:^|\D)(\d{1,2})\s*(?:jours?|j\b|tage?s?|days?|giorni)/.exec(l);
  if (n) return { duree: { type: "jours", jours: Number(n[1]) }, restriction };
  // Avant la saison : « Forfait journalier Haute saison » est une journée.
  if (/journee|journalier|tageskarte|day (?:ticket|pass)/.test(l)) {
    return { duree: { type: "jours", jours: 1 }, restriction };
  }
  // « Hebdomadaire » (Terre Ronde) est le forfait semaine.
  if (/semaine|hebdo|wochenkarte/.test(l)) return { duree: { type: "semaine" }, restriction };
  if (/saison|season|saisonkarte/.test(l)) return { duree: { type: "saison" }, restriction };
  return { duree: { type: "autre" }, restriction };
}

/** La catégorie d'un nom de colonne publié. */
export function categorieDepuisLibelle(nom: string): CategorieTarif {
  const l = plier(nom);
  if (/famil|tribu/.test(l)) return "famille";
  if (/etudiant|student/.test(l)) return "etudiant";
  if (/senior|age d'or|vermeil|veteran|\baine/.test(l)) return "senior";
  if (/junior|jeune|ado|youth|jugend/.test(l)) return "junior";
  if (/enfant|child|kind|bambin/.test(l)) return "enfant";
  if (/adult|erwachsen/.test(l)) return "adulte";
  return "autre";
}

/**
 * Les bornes d'âge d'un texte publié : « 5-12 », « 70+ », « 65- », « 75 ».
 *
 * Des années de naissance (« 2010-2020 ») ne sont pas des âges : sans savoir à
 * quelle date on les lit, les convertir serait deviner. Elles restent dans le
 * libellé, et `ages` vaut `null`.
 */
export function agesDepuisTexte(
  texte: string | null | undefined,
): { min: number | null; max: number | null } | null {
  if (!texte) return null;
  const t = texte.replace(/\s+/g, "");
  const m = /^(\d{1,4})(?:-(\d{1,4})?|\+)?$/.exec(t);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] != null ? Number(m[2]) : null;
  if (a > 150 || (b != null && b > 150)) return null;
  if (b != null) return { min: Math.min(a, b), max: Math.max(a, b) };
  return { min: a, max: null };
}

/**
 * Les plages de dates d'une grille bergfex : « 20.12.25 - 03.01.26 07.02.26 -
 * 07.03.26 » en donne deux. Rend des dates AAAA-MM-JJ.
 */
export function plagesBergfex(dates: string): { debut: string; fin: string }[] {
  const out: { debut: string; fin: string }[] = [];
  const re = /(\d{2})\.(\d{2})\.(\d{2})\s*-\s*(\d{2})\.(\d{2})\.(\d{2})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(dates))) {
    out.push({ debut: `20${m[3]}-${m[2]}-${m[1]}`, fin: `20${m[6]}-${m[5]}-${m[4]}` });
  }
  return out;
}

const MOIS: Record<string, string> = {
  janv: "01",
  janvier: "01",
  fevr: "02",
  fevrier: "02",
  mars: "03",
  avr: "04",
  avril: "04",
  mai: "05",
  juin: "06",
  juil: "07",
  juillet: "07",
  aout: "08",
  sept: "09",
  septembre: "09",
  oct: "10",
  octobre: "10",
  nov: "11",
  novembre: "11",
  dec: "12",
  decembre: "12",
};

/** « 27 nov. 2025 » → « 2025-11-27 ». */
export function dateFrancaise(texte: string | null | undefined): string | null {
  if (!texte) return null;
  const m = /(\d{1,2})\s+([a-z]+)\.?\s+(\d{4})/.exec(plier(texte));
  if (!m) return null;
  const mois = MOIS[m[2]];
  return mois ? `${m[3]}-${mois}-${m[1].padStart(2, "0")}` : null;
}

/** « 2025-2026 Tarif valable jusqu'au 29 mars » → « 2025-26 ». */
export function saisonDepuisTexte(texte: string | null | undefined): string | null {
  const m = /(20\d{2})\s*[-/]\s*(20\d{2})/.exec(texte ?? "");
  if (!m || Number(m[2]) !== Number(m[1]) + 1) return null;
  return `${m[1]}-${m[2].slice(2)}`;
}

/* ---------- Catalogue ---------- */

/**
 * Le périmètre d'une grille.
 *
 * Un domaine relié porte une clé tirée de son nom, articles et parenthèses
 * retirés (`cleDomaine`) : « Les 3 Vallées » du catalogue et « Les Trois
 * Vallées » d'une autre source désignent le même forfait. Une station seule
 * porte la clé de sa fiche.
 */
export function perimetre(type: "station" | "domaine", nom: string, cleFiche: string): Perimetre {
  const cle = type === "domaine" ? cleDomaine(nom) : null;
  return { type, cle: cle ? `domaine:${cle}` : `station:${cleFiche}`, nom };
}

function perimetreDuDomaine(d: DomainForfait): Perimetre {
  return d.pass ? perimetre("domaine", d.pass, d.slug) : perimetre("station", d.name, d.slug);
}

function tarif(
  duree: Duree,
  libelleDuree: string,
  categorie: CategorieTarif,
  libelleCategorie: string,
  prix: number,
  devise: string,
  estime = false,
): Tarif {
  return {
    duree,
    libelleDuree,
    categorie,
    libelleCategorie,
    ages: null,
    prix,
    devise,
    canal: "non-precise",
    restriction: null,
    ...(estime ? { estime: true as const } : {}),
  };
}

const prixValide = (v: number | null | undefined): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;

/**
 * Un domaine du catalogue devient une grille : une seule période « saison
 * entière », de la saison de son relevé.
 *
 * Le périmètre est celui que le catalogue déclare : le `pass` quand il y en a
 * un (« Les 3 Vallées »), sinon le domaine seul. Les estimations suivent,
 * marquées comme telles.
 */
export function grilleDepuisCatalogue(
  d: DomainForfait,
  stationIds: readonly string[],
  devise: string,
): GrilleTarifaire | null {
  const s = d.seed;
  if (!s) return null;
  const est = (s as { estime?: { j1: number | null; enf6: number | null } | null }).estime ?? null;
  const tarifs: Tarif[] = [];
  const un = { type: "jours", jours: 1 } as const;
  const six = { type: "jours", jours: 6 } as const;
  const estJ1 = est?.j1 ?? null;
  const estEnf6 = est?.enf6 ?? null;
  if (prixValide(s.j1)) tarifs.push(tarif(un, "1 jour", "adulte", "Adulte", s.j1, devise));
  else if (prixValide(estJ1))
    tarifs.push(tarif(un, "1 jour", "adulte", "Adulte", estJ1, devise, true));
  if (prixValide(s.j6)) tarifs.push(tarif(six, "6 jours", "adulte", "Adulte", s.j6, devise));
  if (prixValide(s.enf6)) tarifs.push(tarif(six, "6 jours", "enfant", "Enfant", s.enf6, devise));
  else if (prixValide(estEnf6))
    tarifs.push(tarif(six, "6 jours", "enfant", "Enfant", estEnf6, devise, true));
  if (prixValide(s.saison))
    tarifs.push(tarif({ type: "saison" }, "Saison", "adulte", "Adulte", s.saison, devise));
  if (!tarifs.some((t) => !t.estime)) return null;
  const saison = s.maj ? saisonDeJour(s.maj) : null;
  if (!saison) return null;
  const periode = periodeSaisonEntiere(saison, tarifs);
  if (!periode) return null;
  const notes = [
    `Prix du catalogue relevés ${s.majLabel ? `le ${s.majLabel}` : "sans date"}, sans période publiée : repris en une période « ${LIBELLE_SAISON_ENTIERE} ».`,
    "Saison déduite de la date du relevé ; le catalogue ne dit pas à quelle saison ses prix s'appliquent.",
  ];
  if (est && (est.j1 != null || est.enf6 != null))
    notes.push(
      "Journée ou 6 jours enfant estimés d'après le 6 jours adulte : jamais comptés dans un coût.",
    );
  if (s.zone) notes.push(`Zone annoncée par le catalogue : ${s.zone}.`);
  return {
    id: `catalogue:${d.slug}:${saison}`,
    saison,
    perimetre: perimetreDuDomaine(d),
    stationIds: [...stationIds].sort(),
    periodes: [periode],
    source: {
      origine: "catalogue",
      url: d.website,
      libelle: `Catalogue des forfaits${s.majLabel ? `, relevé du ${s.majLabel}` : ""}`,
    },
    scrapeLe: s.maj,
    confiance: "faible",
    notes,
  };
}

/* ---------- Saisie de l'écran Forfaits ---------- */

/**
 * La grille saisie sur l'écran Forfaits (durée × catégorie, par saison)
 * devient une période « saison entière ». Les cases saisies et relevées sont
 * reprises ; une case estimée l'est aussi, marquée.
 */
export function grilleDepuisSaisie(
  g: GrilleSaisie,
  domaine: DomainForfait | undefined,
  stationIds: readonly string[],
): GrilleTarifaire | null {
  const tarifs: Tarif[] = [];
  let derniere: string | null = null;
  for (const [cle, c] of Object.entries(g.cases)) {
    if (!prixValide(c.prix)) continue;
    const [d, cat] = cle.split("|");
    const jours = Number(d);
    if (!Number.isFinite(jours)) continue;
    const duree: Duree =
      jours < 1 ? { type: "partielle", heures: null, des: null } : { type: "jours", jours };
    const libelleDuree = jours < 1 ? "Demi-journée" : `${jours} jour${jours > 1 ? "s" : ""}`;
    const categorie = categorieDepuisLibelle(cat);
    const libelleCategorie = cat.charAt(0).toUpperCase() + cat.slice(1);
    tarifs.push(
      tarif(
        duree,
        libelleDuree,
        categorie,
        libelleCategorie,
        c.prix,
        c.devise,
        c.statut === "estime",
      ),
    );
    if (c.dateReleve && (!derniere || c.dateReleve > derniere)) derniere = c.dateReleve;
  }
  if (!tarifs.length) return null;
  const periode = periodeSaisonEntiere(g.saison, tarifs);
  if (!periode) return null;
  return {
    id: `saisie:${g.slug}:${g.saison}`,
    saison: g.saison,
    perimetre: domaine ? perimetreDuDomaine(domaine) : perimetre("station", g.slug, g.slug),
    stationIds: [...stationIds].sort(),
    periodes: [periode],
    source: { origine: "saisie", url: null, libelle: "Saisie sur l'écran Forfaits" },
    scrapeLe: derniere,
    confiance: "faible",
    notes: [
      `Grille saisie ou relevée sur l'écran Forfaits, sans période : reprise en une période « ${LIBELLE_SAISON_ENTIERE} ».`,
    ],
  };
}

/* ---------- Relevé du magasin serveur ---------- */

/**
 * La ligne du magasin serveur (`refresh.server.ts`) devient une grille, quand
 * elle porte un relevé à elle : le 6 jours lu sur la page officielle par
 * l'actualisation, ou le prix saisi à la main sur l'écran Forfaits.
 *
 * Une ligne semée depuis le catalogue (`parseKind` « referentiel ») n'est pas
 * reprise : sa grille existe déjà (`grilleDepuisCatalogue`), aux mêmes prix.
 * Une estimation ou une erreur non plus : rien n'est inventé.
 *
 * Le forfait est celui du catalogue pour ce domaine : même périmètre, mêmes
 * stations. Une page officielle relue sans dates publiées est de confiance
 * moyenne (`tarifsPeriode.ts`) ; une saisie à la main reste faible, comme
 * celle de `grilleDepuisSaisie`. La saison est celle du relevé : un relevé
 * plus récent que le catalogue passe devant lui, un plus ancien derrière.
 */
export function grilleDepuisReleve(
  row: ForfaitRow,
  catalogue: GrilleTarifaire | undefined,
): GrilleTarifaire | null {
  if (!catalogue || !catalogue.stationIds.length) return null;
  if (row.parseKind === "referentiel") return null;
  const saisie = row.status === "manuel";
  if (!saisie && row.status !== "ok" && row.status !== "stale") return null;
  const jour = row.fetchedAt?.slice(0, 10) ?? null;
  const saison = jour ? saisonDeJour(jour) : null;
  if (!jour || !saison) return null;
  const devise = catalogue.periodes[0]?.tarifs[0]?.devise ?? "EUR";
  const un = { type: "jours", jours: 1 } as const;
  const six = { type: "jours", jours: 6 } as const;
  const tarifs: Tarif[] = [];
  if (prixValide(row.j1)) tarifs.push(tarif(un, "1 jour", "adulte", "Adulte", row.j1, devise));
  if (prixValide(row.j6)) tarifs.push(tarif(six, "6 jours", "adulte", "Adulte", row.j6, devise));
  if (prixValide(row.enf6))
    tarifs.push(tarif(six, "6 jours", "enfant", "Enfant", row.enf6, devise));
  if (!tarifs.length) return null;
  const periode = periodeSaisonEntiere(saison, tarifs);
  if (!periode) return null;
  const date = dateLbl(jour);
  return {
    id: `releve:${row.slug}:${saison}`,
    saison,
    perimetre: catalogue.perimetre,
    stationIds: [...catalogue.stationIds],
    periodes: [periode],
    source: saisie
      ? {
          origine: "saisie",
          url: row.sourceUrl,
          libelle: `Saisie de l'écran Forfaits${date ? ` du ${date}` : ""}`,
        }
      : {
          origine: "officiel",
          url: row.sourceUrl,
          libelle: `Page officielle, relevé du ${date ?? jour}`,
        },
    scrapeLe: jour,
    confiance: saisie ? "faible" : "moyenne",
    notes: [
      `${saisie ? "Prix saisi à la main" : "Prix relevé sur la page officielle"}, sans période publiée : repris en une période « ${LIBELLE_SAISON_ENTIERE} ».`,
    ],
  };
}

/**
 * Les grilles des lignes du magasin serveur, chacune rattachée au forfait du
 * catalogue de son domaine (`catalogue:{slug}:{saison}`, la plus récente).
 */
export function grillesDuMagasin(
  rows: readonly ForfaitRow[],
  grilles: readonly GrilleTarifaire[],
): GrilleTarifaire[] {
  const catalogue = new Map<string, GrilleTarifaire>();
  for (const g of grilles) {
    if (g.source.origine !== "catalogue") continue;
    const slug = g.id.split(":")[1];
    const deja = catalogue.get(slug);
    if (!deja || deja.saison < g.saison) catalogue.set(slug, g);
  }
  return rows.flatMap((r) => grilleDepuisReleve(r, catalogue.get(r.slug)) ?? []);
}

/* ---------- Référentiel Monde ---------- */

const SITE_VUE: Record<ForfaitVue["source"], string> = {
  skiinfo: "Skiinfo",
  skiresort: "skiresort.fr",
  bergfex: "bergfex",
  officiel: "le site officiel",
  proprietaire: "un relevé à la main",
};

/** L'adresse de la fiche d'où vient une grille. */
export function urlVue(f: ForfaitVue): string | null {
  switch (f.source) {
    case "skiinfo":
      return `https://www.skiinfo.fr/${f.cle}/forfaits-de-ski`;
    case "skiresort":
      return `https://www.skiresort.fr/domaine-skiable/${f.cle}/`;
    case "bergfex":
      return `https://www.bergfex.fr/${f.cle}/preise/`;
    default:
      return f.pageTarifs ?? null;
  }
}

function tarifsDeLignes(
  lignes: readonly { libelle: string; prix: (number | null)[] }[],
  categories: readonly { nom: string; ages: string | null }[],
  devise: string,
): Tarif[] {
  const out: Tarif[] = [];
  for (const l of lignes) {
    const { duree, restriction } = dureeDepuisLibelle(l.libelle);
    l.prix.forEach((p, i) => {
      const c = categories[i];
      // Zéro n'est pas un prix : Skiinfo remplit ainsi ce qu'il ne publie pas.
      if (!c || !prixValide(p)) return;
      out.push({
        duree,
        libelleDuree: l.libelle,
        categorie: categorieDepuisLibelle(c.nom),
        libelleCategorie: c.ages ? `${c.nom} ${c.ages}` : c.nom,
        ages: agesDepuisTexte(c.ages),
        prix: p,
        devise,
        canal: "non-precise",
        restriction,
      });
    });
  }
  return out;
}

export type ContexteVue = {
  /** L'identifiant du domaine dans le référentiel Monde (« fr-megeve »). */
  mondeId: string;
  perimetre: Perimetre;
  stationIds: readonly string[];
  /** La date du relevé de la source (AAAA-MM-JJ ou ISO), si connue. */
  releveLe: string | null;
};

/**
 * Une grille du référentiel Monde devient une ou plusieurs grilles, une par
 * saison.
 *
 * - bergfex daté : chaque plage de dates devient une période, sous le libellé
 *   publié. Une grille publiée pour deux plages (« 29.11.25 - 12.12.25
 *   25.04.26 - 03.05.26 ») donne deux périodes aux mêmes tarifs ;
 * - grille sans date (Skiinfo, skiresort, bergfex non daté) : une période
 *   « saison entière », de la saison que la source écrit (bloc saison de
 *   Skiinfo, date de mise à jour), à défaut de celle du relevé, et c'est
 *   noté.
 */
export function grillesDepuisVue(f: ForfaitVue, ctx: ContexteVue): GrilleTarifaire[] {
  const devise = f.devise;
  if (!devise) return [];
  const parSaison = new Map<string, { periodes: Periode[]; notes: string[] }>();
  const ajouter = (saison: string, p: Periode, note?: string) => {
    const e = parSaison.get(saison) ?? { periodes: [], notes: [] };
    e.periodes.push(p);
    if (note && !e.notes.includes(note)) e.notes.push(note);
    parSaison.set(saison, e);
  };

  const releveSaison = ctx.releveLe ? saisonDeJour(ctx.releveLe) : null;
  const majSaison = saisonDeJour(dateFrancaise(f.misAJour) ?? "");

  if (f.periodes?.length) {
    for (const p of f.periodes) {
      const tarifs = tarifsDeLignes(
        p.lignes,
        p.categories.map((nom) => ({ nom, ages: null })),
        devise,
      );
      if (!tarifs.length) continue;
      for (const plage of plagesBergfex(p.dates)) {
        const saison = saisonDeJour(plage.debut);
        const b = saison ? bornesSaison(saison) : null;
        if (!saison || !b || plage.debut > plage.fin || plage.fin > b.fin) continue;
        ajouter(
          saison,
          { libelle: p.dates, debut: plage.debut, fin: plage.fin, saisonEntiere: false, tarifs },
          "Périodes datées par la source, reprises telles que publiées.",
        );
      }
    }
  } else {
    const tarifs = tarifsDeLignes(f.lignes, f.categories, devise);
    const saison = majSaison ?? saisonDepuisTexte(f.saison?.libelle) ?? releveSaison;
    if (tarifs.length && saison) {
      const p = periodeSaisonEntiere(saison, tarifs);
      const note = majSaison
        ? `Grille sans période, mise à jour le ${f.misAJour} : reprise en une période « ${LIBELLE_SAISON_ENTIERE} ».`
        : f.saison?.libelle && saisonDepuisTexte(f.saison.libelle)
          ? `Grille sans période ni date, rangée à la saison de son forfait saison : « ${f.saison.libelle.trim()} ».`
          : `Grille sans période ni date publiée : rangée à la saison du relevé (${saison}).`;
      if (p) ajouter(saison, p, note);
    }
  }
  if (f.saison) {
    const tarifs = tarifsDeLignes(
      [{ libelle: "Saison", prix: f.saison.prix }],
      f.saison.categories,
      devise,
    );
    const saison = saisonDepuisTexte(f.saison.libelle) ?? majSaison ?? releveSaison;
    if (tarifs.length && saison) {
      const e = parSaison.get(saison);
      const entiere = e?.periodes.find((p) => p.saisonEntiere);
      if (entiere) entiere.tarifs = [...entiere.tarifs, ...tarifs];
      else {
        const p = periodeSaisonEntiere(saison, tarifs);
        if (p) ajouter(saison, p, `Forfait saison : « ${f.saison.libelle.trim()} ».`);
      }
    }
  }

  const out: GrilleTarifaire[] = [];
  for (const [saison, e] of parSaison) {
    e.periodes.sort((a, b) => (a.debut < b.debut ? -1 : a.debut > b.debut ? 1 : 0));
    out.push({
      id: `${f.source}:${ctx.mondeId}:${saison}`,
      saison,
      perimetre: ctx.perimetre,
      stationIds: [...ctx.stationIds].sort(),
      periodes: e.periodes,
      source: {
        origine: f.source === "proprietaire" ? "officiel" : f.source,
        url: urlVue(f),
        libelle: `${SITE_VUE[f.source]}, fiche « ${f.nom ?? f.cle} »`,
      },
      scrapeLe: ctx.releveLe,
      confiance: "faible",
      notes: e.notes,
    });
  }
  return out.sort((a, b) => (a.saison < b.saison ? -1 : 1));
}
