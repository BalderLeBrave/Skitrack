/**
 * La lecture des galeries en tâche de fond, partie réseau, commune à Open
 * System et iResa : la liste ne publie qu'une vignette, la fiche de chaque
 * logement porte toute la galerie.
 *
 * Une fiche à la fois, douze secondes après la requête précédente vers la
 * centrale (`aTourDeRole`), au plus cent fiches ou trente minutes. La suite
 * cède dès qu'une nouvelle recherche part vers la centrale (`cede`), et
 * s'arrête sans nouvel essai sur la première erreur ; un refus (403, 429, 503)
 * pose la pause de l'hôte (`poserRefus`), que `porteFermee` fait respecter.
 * **Un Disallow de `robots.txt` est respecté** : la fiche n'est pas demandée.
 * Les galeries se gardent trente jours, par paquets de cinq ; l'écran les pose
 * par sa relecture, sans réseau (`reposerGardees`).
 */

import { contenuFiches, garderLectures, type LectureAGarder } from "@/lib/stay/contenuFiches.server";
import { UA_NAVIGATEUR } from "../../navigateur";
import { porteFermee, poserRefus } from "../../gardeHote";
import { aTourDeRole } from "../cadence";
import { centraleAutorise } from "../robots.server";
import { lireGaleries } from "./galeries";

/** L'écart des fiches lentes Airbnb, au-dessus de celui de l'hôte. */
const SUITE_ECART_MS = 12_000;
/** Fiches lues au plus par une suite, et pas plus longtemps que cela. */
const SUITE_FICHES_MAX = 100;
const SUITE_MAX_MS = 30 * 60_000;
/** Une fiche qui ne répond pas dans ce délai est abandonnée. */
const FICHE_TIMEOUT_MS = 10_000;

const suitesEnCours = new Set<string>();

/** Une galerie de plus d'une photo est gardée pour cette annonce : rien à relire. */
export function galerieGardee(cle: string): boolean {
  try {
    return (contenuFiches().lire(cle)?.photos?.length ?? 0) > 1;
  } catch {
    return false;
  }
}

/** La page d'une fiche, ou une erreur qui dit le refus. Un Disallow de robots.txt rend une page vide. */
async function pageFiche(url: string): Promise<string> {
  const verdict = await centraleAutorise(url);
  // La liste publie déjà une vignette ; la galerie n'est pas une raison de
  // passer outre une interdiction. Une page vide compte comme « sans galerie ».
  if (verdict.regle.startsWith("Disallow")) return "";
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), FICHE_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": UA_NAVIGATEUR, accept: "text/html", "accept-language": "fr-FR,fr;q=0.9" },
    });
    if (!r.ok) {
      await r.body?.cancel();
      poserRefus(url, r.status, r.headers);
      throw new Error(`la centrale a répondu ${r.status}`);
    }
    return await r.text();
  } finally {
    clearTimeout(minuteur);
  }
}

export type SuiteGaleries<F> = {
  /** L'origine de la centrale : une suite à la fois par centrale. */
  base: string;
  /** Pour le journal. */
  host: string;
  /** Les fiches à lire, avec la clé de leur annonce (`cleListing`). */
  restantes: readonly { fiche: F; cle: string }[];
  /** L'adresse de la fiche, sur la centrale ; `null` : on passe. */
  adresse: (f: F) => string | null;
  /** Les photos que la page de la fiche publie. */
  galerie: (page: string, f: F) => string[];
  /** Le nom de la fiche, dans le motif d'arrêt et la mémoire. */
  nom: (f: F) => string;
  /** Une nouvelle recherche est partie vers la centrale : la suite cède. */
  cede: () => boolean;
};

export function lancerSuiteGaleries<F>(s: SuiteGaleries<F>): void {
  const { base, host, restantes } = s;
  if (suitesEnCours.has(base) || restantes.length === 0) return;
  suitesEnCours.add(base);
  const cles = new Map(restantes.map((x) => [s.nom(x.fiche), x.cle] as const));
  const debut = Date.now();
  const aGarder: LectureAGarder[] = [];
  const vider = () => {
    if (aGarder.length) garderLectures(aGarder.splice(0));
  };
  void lireGaleries(
    restantes.map((x) => x.fiche),
    {
      dejaLue: (f) => !s.adresse(f),
      arret: () =>
        s.cede()
          ? "une nouvelle recherche est partie"
          : (porteFermee(base) ?? (Date.now() - debut > SUITE_MAX_MS ? `${SUITE_MAX_MS / 60_000} min atteintes` : null)),
      lire: (f) => {
        const url = s.adresse(f)!;
        return aTourDeRole(url, async () => (s.cede() || porteFermee(url) ? null : pageFiche(url)), SUITE_ECART_MS);
      },
      garder: (f, photos) => {
        aGarder.push({ cle: cles.get(s.nom(f)), contenu: { photos } });
        if (aGarder.length >= 5) vider();
      },
    },
    s.galerie,
    s.nom,
    SUITE_FICHES_MAX,
  )
    .then(({ lues, demandes, arret }) => {
      console.info(
        `[centrale] ${host} : galeries, ${lues} fiche(s) lue(s) sur ${demandes} demandée(s)` +
          `${arret ? `, arrêtée : ${arret}` : ""}`,
      );
    })
    .catch((e: unknown) => {
      console.warn(`[centrale] ${host} : galeries, ${e instanceof Error ? e.message : String(e)}`);
    })
    .finally(() => {
      vider();
      suitesEnCours.delete(base);
    });
}
