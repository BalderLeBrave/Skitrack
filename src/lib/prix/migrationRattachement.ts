/**
 * Re-rattachement des annonces déjà enregistrées par l'écran Prix.
 *
 * Jusqu'au 6 octobre 2026, un relevé gardait sous la station cherchée tout ce
 * que `domainFit` jugeait « dans le domaine » ou « relié » : un logement
 * d'Aussois sous Val Cenis, un logement de Méribel sous treize stations des
 * 3 Vallées, et les relevés des villages d'une station (Plagne Centre,
 * Lanslebourg) sous leur propre clé. La règle d'aujourd'hui — une station par
 * logement, `stay/rattachement.ts` — les écarte déjà à la relecture : de
 * « Par budget » (`passeAnnonce`), et des médianes de « Par station »,
 * recomptées sur ce que chaque relevé montre (`resultatsALaLecture`). Mais
 * les relevés enregistrés les portent encore, et rien n'y range une annonce
 * sous sa station ni un village sous la sienne : c'est ce que fait ce module.
 *
 * Ce module **planifie** sans rien écrire : `planifierRattachement` rend, pour
 * chaque annonce, ce qu'il en ferait, et l'état qui en résulterait ;
 * `rapportRattachement` le dit en clair. L'écriture appartient à l'appelant
 * (`migrationRattachement.client.ts`, dans le navigateur, où sont les
 * relevés ; `scripts/rattachement-logements.ts`, sur un export), et seulement
 * sur demande explicite. Il lit les annonces telles qu'elles sont stockées
 * (`lireAnnoncesBrutes`), et rend des annonces à stocker telles quelles.
 *
 * ## Ce qu'il fait de chaque annonce, sous la clé (période, groupe, station)
 *
 * Chaque annonce a un seul sort dans le rapport :
 *
 * - **gardée** : elle appartient à la station de son relevé ;
 * - **déplacée** : elle appartient à une autre station (« autre-station »),
 *   ou son relevé est celui d'un village de sa station (« village ») ; elle
 *   rejoint le relevé de sa station aux mêmes dates pour le même groupe, et
 *   sa station de relevé (`stationId`) devient celle-là. Une autre station
 *   sans relevé réussi à ces dates ne la reçoit pas : elle est retirée, et y
 *   reviendra au relevé de cette station, qui seul dira son prix parmi les
 *   autres ;
 * - **doublon** : le relevé d'arrivée porte déjà le même bien (même
 *   plateforme, même identifiant, `cleBien`) ; la copie déjà là reste, avec
 *   son prix et son regroupement ; entre deux copies arrivées d'ailleurs,
 *   celle que `copiesParBien` garde ;
 * - **retirée sans station** : à plus de 12 km de toute station ;
 * - **non située** : sans position ni commune qui tranche (relevés de
 *   l'ancien format) ; elle reste dans le relevé de sa station, que rien ne
 *   permet de contredire.
 *
 * ## Les résultats et les médianes
 *
 * Le résultat d'un village passe sous la clé de sa station quand celle-ci
 * n'en a pas de réussi, avec ou sans annonces ; il est retiré sinon. Un
 * relevé touché voit son nombre de logements et sa médiane recalculés sur ce
 * qu'il garde : un logement par `logement` (l'identité que le relevé a donnée
 * à ses offres), son offre la moins chère, et seulement ce que l'onglet « Par
 * budget » montre (`recompter`).
 *
 * Seulement là où l'on sait ce qu'un relevé garde : un relevé réussi dont les
 * annonces n'ont pas été lues n'est ni recompté, ni destinataire, ni fondu ;
 * un village dont le relevé ou celui de sa station est dans ce cas reste tel
 * quel (`laissees`). Les comptes de logements « muets » et « trop
 * petits » ne sont pas recalculables — les annonces écartées ne sont pas
 * enregistrées — : ils restent ceux du relevé.
 */

import { metresBetween } from "../osmAccess.ts";
import { stationById } from "../stations.ts";
import { cleBien, cleDuLogement, copiesParBien, dedoublonnerParBien } from "../stay/poserReleve.ts";
import { plausible } from "../stay/priseFiche.ts";
import { distanceAuRepere, rattacher, verdictStation } from "../stay/rattachement.ts";
import { regrouper } from "../stay/regroupement.ts";
import { stationDeRattachement } from "../villages.ts";
import {
  annonceMontree,
  mediane,
  rejugerPourStation,
  stationDeCle,
  type AnnonceRetenue,
  type Resultat,
} from "./calcul.ts";

export type EntreeStockee = { cle: string; annonces: readonly AnnonceRetenue[] };

/** Les relevés d'un navigateur, exportés pour le script : résultats et
 *  annonces, par clé de résultat, telles qu'elles sont stockées. */
export type ExportReleves = {
  res: Record<string, Resultat>;
  annonces: Record<string, AnnonceRetenue[]>;
};

export type Action = "deplacee" | "doublon" | "retiree" | "non-situee";

export type Motif =
  | "village"
  | "autre-station"
  | "station-sans-releve"
  | "releve-non-lu"
  | "doublon"
  | "trop-loin"
  | "sans-position";

export type Mouvement = {
  action: Action;
  motif: Motif;
  id: string;
  titre: string;
  source: string;
  /** La clé d'où elle vient. */
  de: string;
  /** La clé où elle va, ou `null` si elle quitte les relevés. */
  vers: string | null;
};

export type PlanRattachement = {
  examinees: number;
  /** Les annonces que les relevés garderaient, toutes clés confondues. */
  restantes: number;
  mouvements: Mouvement[];
  /** Les relevés tels qu'ils seraient : une clé absente est à oublier. */
  apres: Map<string, AnnonceRetenue[]>;
  /** Les clés dont les annonces ou le résultat changent. */
  touchees: Set<string>;
  /** Les résultats tels qu'ils seraient ; une clé absente est à retirer. */
  resultats: Record<string, Resultat>;
  /** Les relevés de village laissés tels quels : celui de leur station est
   *  réussi, mais ses annonces n'ont pas été lues. */
  laissees: string[];
};

function prefixeDe(cle: string): string {
  return cle.split("|").slice(0, 4).join("|");
}

const reussi = (r: Resultat | undefined): boolean => r?.etat === "fait";

/**
 * Un relevé peut-il recevoir des annonces, et son résultat être recompté ?
 * Seulement si l'on sait ce qu'il garde : ses annonces ont été lues, ou il
 * n'avait rien compté. Un relevé réussi dont la liste manque (base
 * indisponible, purgée) ne se recompte pas sur les seules annonces qu'on lui
 * apporterait : sa médiane deviendrait celle de ces quelques annonces.
 */
function connu(
  cle: string,
  lues: ReadonlySet<string>,
  avant: Readonly<Record<string, Resultat>>,
): boolean {
  const r = avant[cle];
  return lues.has(cle) || r?.etat !== "fait" || r.n === 0;
}

/**
 * Le nombre de logements et la médiane d'un relevé, sur ce qu'il garde et
 * selon la règle de l'affichage : une offre tarifée que la station montre
 * (`annonceMontree`, la règle de « Par budget »). Un logement compte une
 * fois, par son offre la moins chère.
 */
export function recompter(
  annonces: readonly AnnonceRetenue[],
  stationId: string,
): { n: number; med: number | null } {
  // Un logement : les offres qui partagent un `logement` (le regroupement du
  // relevé) ou un bien (`cleDuLogement` : deux copies d'une même annonce, les
  // deux formules d'un bien, même dans un relevé d'avant ces marques), comme
  // « Par budget » les réunit en une carte (`logementsReleves`).
  const parent = new Map<string, string>();
  const racine = (k: string): string => {
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(k, r);
    return r;
  };
  const totaux: [string, number][] = [];
  for (const a of annonces) {
    if (!(a.total > 0)) continue;
    if (!annonceMontree(a, stationId)) continue;
    // Sans marque, l'offre est son propre logement (`regrouper` marque une
    // offre seule de son identifiant).
    const noeuds = [`bien\n${cleDuLogement(a)}`, `logement\n${a.logement ?? a.id}`];
    for (const k of noeuds) if (!parent.has(k)) parent.set(k, k);
    for (const k of noeuds.slice(1)) parent.set(racine(k), racine(noeuds[0]));
    totaux.push([noeuds[0], a.total]);
  }
  const parLogement = new Map<string, number>();
  for (const [k, total] of totaux) {
    const r = racine(k);
    const deja = parLogement.get(r);
    if (deja == null || total < deja) parLogement.set(r, total);
  }
  return { n: parLogement.size, med: mediane([...parLogement.values()]) };
}

/** Chaque offre porte le logement que `regrouper` lui donne dans ce relevé :
 *  l'identifiant de l'offre la moins chère de son groupe. */
function regrouperDeNouveau(annonces: readonly AnnonceRetenue[]): AnnonceRetenue[] {
  const logementDe = new Map<unknown, string>();
  for (const g of regrouper(annonces)) for (const o of g.offres) logementDe.set(o, g.principale.id);
  return annonces.map((a) => {
    const logement = logementDe.get(a);
    return logement != null && logement !== a.logement ? { ...a, logement } : a;
  });
}

/**
 * L'annonce rangée sous une autre station : sa station de relevé, et sa
 * distance au repère, sont désormais celles-là. Venue d'une **autre station**
 * (`remesurer`), elle perd la remontée mesurée pour l'ancienne et se rejuge
 * pour la nouvelle (`rejugerPourStation`), comme à la relecture ; non située
 * (rangée par sa commune), elle n'a plus de distance mesurée, celles de
 * l'ancienne station ne valant rien pour la nouvelle. Venue d'un village, ses
 * mesures restent celles de la même station.
 */
function rangerSous(a: AnnonceRetenue, stationId: string, remesurer: boolean): AnnonceRetenue {
  if (a.stationId === stationId) return a;
  const s = stationById(stationId);
  const situee = plausible(a.lat, a.lon);
  const rangee: AnnonceRetenue = {
    ...a,
    stationId,
    distToSlopesM:
      distanceAuRepere(a, stationId) ??
      (s && situee
        ? Math.round(metresBetween(a.lat!, a.lon!, s.lat, s.lon))
        : (a.distToSlopesM ?? null)),
  };
  if (!remesurer) return rangee;
  const sansRemontee = {
    distToLiftM: null,
    liftName: null,
    liftKind: null,
    liftLat: null,
    liftLon: null,
    liftOtherLat: null,
    liftOtherLon: null,
  };
  if (!situee) return { ...rangee, ...sansRemontee, distToSlopesM: null };
  return rejugerPourStation({ ...rangee, ...sansRemontee }, s);
}

export function planifierRattachement(
  entrees: readonly EntreeStockee[],
  resultats: Readonly<Record<string, Resultat>>,
): PlanRattachement {
  const res: Record<string, Resultat> = { ...resultats };
  const touchees = new Set<string>();
  const mouvements: Mouvement[] = [];
  /** Le mouvement noté pour une annonce : une annonce n'a qu'un sort. */
  const mouvementDe = new Map<AnnonceRetenue, number>();
  const noter = (a: AnnonceRetenue, m: Omit<Mouvement, "id" | "titre" | "source">) =>
    mouvementDe.set(a, mouvements.push({ ...m, id: a.id, titre: a.title, source: a.source }) - 1);

  const lues = new Set(entrees.map((e) => e.cle));
  const recevable = (cle: string) => reussi(res[cle]) && connu(cle, lues, resultats);
  const laissees: string[] = [];

  // Les résultats des villages, avec ou sans annonces, passent sous la clé de
  // leur station si elle n'en a pas de réussi. Un village dont le relevé, ou
  // celui de sa station, est réussi mais non lu reste tel quel : on ne sait
  // pas ce qu'il garde.
  const cles = [...new Set([...Object.keys(resultats), ...entrees.map((e) => e.cle)])].sort();
  for (const cle of cles) {
    const station = stationDeCle(cle);
    const mere = stationDeRattachement(station);
    if (mere === station) continue;
    const cleMere = `${prefixeDe(cle)}|${mere}`;
    // Un résultat de village non lu ne passe pas sous sa station : on ne
    // saurait ni le recompter ni y ajouter d'annonces.
    if (!connu(cle, lues, resultats) || !connu(cleMere, lues, resultats)) {
      laissees.push(cle);
      continue;
    }
    if (res[cle] && !reussi(res[cleMere]) && (reussi(res[cle]) || !res[cleMere]))
      res[cleMere] = res[cle];
    delete res[cle];
    touchees.add(cle);
    touchees.add(cleMere);
  }

  const arrivees = new Map<string, AnnonceRetenue[]>();
  const provenance = new Map<AnnonceRetenue, string>();
  const poser = (cle: string, a: AnnonceRetenue, de: string, remesurer = false) => {
    const pose = rangerSous(a, stationDeCle(cle), remesurer);
    const liste = arrivees.get(cle);
    if (liste) liste.push(pose);
    else arrivees.set(cle, [pose]);
    provenance.set(pose, de);
    const i = mouvementDe.get(a);
    if (i != null) mouvementDe.set(pose, i);
  };

  let examinees = 0;
  for (const { cle, annonces } of [...entrees].sort((a, b) => a.cle.localeCompare(b.cle))) {
    const station = stationDeCle(cle);
    const famille = `${prefixeDe(cle)}|${stationDeRattachement(station)}`;
    for (const a of annonces) {
      examinees += 1;
      const verdict = verdictStation(a, station);
      if (verdict === "trop-loin") {
        noter(a, { action: "retiree", motif: "trop-loin", de: cle, vers: null });
        touchees.add(cle);
        continue;
      }
      if (verdict === "autre-station") {
        const vers = `${prefixeDe(cle)}|${rattacher(a).stationId}`;
        touchees.add(cle);
        if (!recevable(vers)) {
          // Elle n'est pas de ce relevé : elle le quitte, qu'elle trouve ou
          // non le sien.
          // Son relevé est réussi mais non lu, ou n'existe qu'à travers un
          // village laissé tel quel faute d'avoir été lu.
          const nonLu =
            reussi(res[vers]) ||
            laissees.some(
              (k) => `${prefixeDe(k)}|${stationDeRattachement(stationDeCle(k))}` === vers,
            );
          const motif = nonLu ? "releve-non-lu" : "station-sans-releve";
          noter(a, { action: "retiree", motif, de: cle, vers: null });
          continue;
        }
        noter(a, { action: "deplacee", motif: "autre-station", de: cle, vers });
        touchees.add(vers);
        poser(vers, a, cle, true);
        continue;
      }
      // Le relevé d'un village rejoint celui de sa station, situées ou non :
      // c'est la station du relevé qui change, pas le jugement de l'annonce.
      if (famille !== cle && !laissees.includes(cle)) {
        if (!recevable(famille)) {
          noter(a, { action: "retiree", motif: "station-sans-releve", de: cle, vers: null });
          continue;
        }
        noter(a, { action: "deplacee", motif: "village", de: cle, vers: famille });
        poser(famille, a, cle);
        continue;
      }
      if (verdict === "non-situe")
        noter(a, { action: "non-situee", motif: "sans-position", de: cle, vers: cle });
      poser(cle, a, cle);
    }
  }

  // Un même bien arrivé deux fois sous une clé n'y reste qu'une fois. La
  // copie déjà là passe devant une copie venue d'ailleurs : elle porte le
  // regroupement de son relevé, et son prix est celui que ce relevé a lu. Une
  // copie venue d'ailleurs n'est gardée que pour un bien que le relevé
  // n'avait pas ; entre copies d'une même provenance, `copiesParBien` choisit.
  const apres = new Map<string, AnnonceRetenue[]>();
  const marquerDoublon = (a: AnnonceRetenue, cle: string) => {
    const doublon: Mouvement = {
      action: "doublon",
      motif: "doublon",
      id: a.id,
      titre: a.title,
      source: a.source,
      de: provenance.get(a) ?? cle,
      vers: cle,
    };
    const i = mouvementDe.get(a);
    if (i != null) mouvements[i] = doublon;
    else mouvements.push(doublon);
    touchees.add(cle);
  };
  for (const [cle, liste] of arrivees) {
    const natives = liste.filter((a) => provenance.get(a) === cle);
    const venues = liste.filter((a) => provenance.get(a) !== cle);
    const biensNatifs = new Set(natives.map((a) => cleBien(a)));
    for (const a of venues) if (biensNatifs.has(cleBien(a))) marquerDoublon(a, cle);
    const candidates = [...natives, ...venues.filter((a) => !biensNatifs.has(cleBien(a)))];
    for (const { gardee, copies } of copiesParBien(candidates).values()) {
      for (const a of copies) if (a !== gardee) marquerDoublon(a, cle);
    }
    const gardees = dedoublonnerParBien(candidates);
    // Des offres venues d'un autre relevé portent le regroupement de celui-là
    // (`logement`) : le relevé d'arrivée se regroupe à nouveau, comme un
    // relevé neuf (`regrouper`), pour qu'un logement vendu sur deux
    // plateformes n'y compte qu'une fois.
    const regroupees = venues.length > 0 ? regrouperDeNouveau(gardees) : gardees;
    if (regroupees.length > 0) apres.set(cle, regroupees);
  }

  // Les médianes des relevés touchés, recalculées sur ce qu'ils gardent ;
  // seulement là où l'on sait ce qu'ils gardent.
  for (const cle of touchees) {
    const r = res[cle];
    if (!r || r.etat !== "fait") continue;
    if (!lues.has(cle) && !arrivees.has(cle)) continue;
    const { n, med } = recompter(apres.get(cle) ?? [], stationDeCle(cle));
    res[cle] = { ...r, n, med };
  }

  const restantes = [...apres.values()].reduce((n, l) => n + l.length, 0);
  return { examinees, restantes, mouvements, apres, touchees, resultats: res, laissees };
}

/**
 * Les résultats tels que l'écran Prix les montre avant toute migration : chaque
 * relevé réussi dont les annonces sont lues, recompté sur ses seules annonces
 * selon la règle de l'affichage (`recompter`). Rien ne change de relevé — ni
 * annonce déplacée, ni village fondu dans sa station : « Par station » et « Par
 * budget » lisent ainsi les mêmes annonces sous les mêmes clés. Le reste
 * (déplacer, fondre) est l'affaire de la migration.
 */
export function resultatsALaLecture(
  entrees: readonly EntreeStockee[],
  resultats: Readonly<Record<string, Resultat>>,
): Record<string, Resultat> {
  const res: Record<string, Resultat> = { ...resultats };
  for (const { cle, annonces } of entrees) {
    const r = res[cle];
    if (r?.etat !== "fait") continue;
    const { n, med } = recompter(annonces, stationDeCle(cle));
    if (n !== r.n || med !== r.med) res[cle] = { ...r, n, med };
  }
  return res;
}

/**
 * Des résultats comptés, et aucune annonce : la base était indisponible ou
 * l'export incomplet. Rien ne dit ce que les relevés gardent ; on ne planifie
 * rien.
 */
export function exportIlisible(e: ExportReleves): boolean {
  return (
    Object.keys(e.annonces ?? {}).length === 0 &&
    Object.values(e.res ?? {}).some((r) => r.etat === "fait" && r.n > 0)
  );
}

/** Le plan d'un export, et l'export tel qu'il serait après. */
export function planifierExport(e: ExportReleves): {
  plan: PlanRattachement;
  apres: ExportReleves;
} {
  const entrees = Object.entries(e.annonces).map(([cle, annonces]) => ({ cle, annonces }));
  const plan = planifierRattachement(entrees, e.res);
  const annonces: ExportReleves["annonces"] = {};
  for (const [cle, a] of Object.entries(e.annonces)) if (!plan.touchees.has(cle)) annonces[cle] = a;
  for (const [cle, a] of plan.apres) if (plan.touchees.has(cle)) annonces[cle] = a;
  return { plan, apres: { res: plan.resultats, annonces } };
}

/** Une empreinte du plan : deux plans de même empreinte font les mêmes
 *  écritures. `appliquer` refuse un plan autre que celui qu'on a simulé. */
export function empreintePlan(plan: PlanRattachement): string {
  const cles = [...plan.touchees].sort();
  return JSON.stringify([
    plan.mouvements.map((m) => [m.action, m.motif, m.id, m.de, m.vers]),
    cles.map((k) => [k, (plan.apres.get(k) ?? []).map((a) => a.id), plan.resultats[k] ?? null]),
  ]);
}

const LIBELLE_MOTIF: Record<Motif, string> = {
  village: "relevée pour un village (ou un ancien identifiant) de sa station",
  "autre-station": "dans une autre station",
  "station-sans-releve": "sa station n'a pas de relevé réussi à ces dates",
  "releve-non-lu": "le relevé de sa station n'a pas pu être lu",
  doublon: "même bien déjà dans le relevé",
  "trop-loin": "à plus de 12 km de toute station",
  "sans-position": "sans position ni commune qui tranche",
};

/** Le rapport, en clair : les comptes, puis le détail. */
export function rapportRattachement(plan: PlanRattachement, detailMax = 50): string {
  const compte = (action: Action, motif?: Motif) =>
    plan.mouvements.filter((m) => m.action === action && (motif == null || m.motif === motif))
      .length;
  const lignes = [
    `Annonces examinées : ${plan.examinees}`,
    `Déplacées vers leur station : ${compte("deplacee")}` +
      ` (autre station ${compte("deplacee", "autre-station")}, relevé de village ${compte("deplacee", "village")})`,
    `Supprimées comme doublons : ${compte("doublon")}`,
    `Retirées, à plus de 12 km de toute station : ${compte("retiree", "trop-loin")}`,
    `Retirées, leur station n'a pas de relevé réussi à ces dates : ${compte("retiree", "station-sans-releve")}`,
    `Retirées, le relevé de leur station n'a pas pu être lu : ${compte("retiree", "releve-non-lu")}`,
    `Laissées sans station, conservées : ${compte("non-situee")} (sans position ni commune qui tranche)`,
    `Annonces restantes : ${plan.restantes}`,
    `Relevés touchés : ${plan.touchees.size}`,
  ];
  if (plan.laissees.length > 0)
    lignes.push(
      `Relevés de village laissés, celui de leur station n'a pas pu être lu : ${plan.laissees.length}`,
    );
  if (plan.mouvements.length > 0) {
    lignes.push("", "Détail :");
    for (const m of plan.mouvements.slice(0, detailMax)) {
      const trajet =
        m.vers == null ? " → retirée" : m.vers !== m.de ? ` → ${stationDeCle(m.vers)}` : "";
      lignes.push(
        `- ${m.source} ${m.id} « ${m.titre} » : ${LIBELLE_MOTIF[m.motif]} — ${stationDeCle(m.de)}${trajet}`,
      );
    }
    if (plan.mouvements.length > detailMax)
      lignes.push(`… et ${plan.mouvements.length - detailMax} de plus.`);
  }
  return lignes.join("\n");
}
