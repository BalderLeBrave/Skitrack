/**
 * Ce qu'une fiche déjà téléchargée par `fillFiches` publie en plus des
 * nombres : sa description et ses équipements. Lecture seule d'un HTML lu
 * pour autre chose (position, titre, capacité) : aucune page n'est ouverte
 * pour ce contenu.
 *
 * Relevé le 6 octobre 2026, fiches lues en HTTP simple :
 * - cimalpes.com : le « Descriptif », la liste « Équipements » par rubrique
 *   (Généraux, Multimédia, Électroménager), les services inclus (« Ménage &
 *   Linge ») et les « points forts ». Rien n'y dit une absence. La fiche
 *   s'ouvre pour chaque annonce, la recherche ne publiant pas de position ;
 * - abritel.fr : les « Équipements populaires », une demi-douzaine. La
 *   description et la liste complète se chargent par script : elles ne sont
 *   pas dans la page. La fiche ne s'ouvre que pour une annonce trouée.
 *
 * - les centrales Ingénie (reservation.lessaisies.com, areches-beaufort.com,
 *   les2alpes.com…) : le descriptif, `<span class="contenu_descriptif">` dans
 *   son pavé `pave1`. Leurs hôtes varient : la page se reconnaît à ce bloc,
 *   pas à son adresse. La fiche ne s'ouvre que pour une annonce trouée
 *   (point, chambres) ; l'équipement n'est pas lu.
 *
 * Un lecteur peut aussi rendre les libellés de sa liste tels quels
 * (`equipementsPublies` : Cimalpes, Abritel) ; les douze clés n'en gardent
 * que ce qu'elles nomment.
 *
 * Les autres pages ne rendent rien ici. Module pur, chargé tel quel par
 * `node --experimental-strip-types`.
 */

import {
  depuisListe,
  depuisTexte,
  equipements,
  fusionner,
  plierEquipement,
  type Equipement,
  type EquipementPublie,
} from "./equipements.ts";
import { decoderEntites, texteDeHtml } from "./texteHtml.ts";

export type ContenuDeFiche = {
  description: string | null;
  photos: string[] | null;
  amenities: Equipement[] | null;
  /** Les libellés de la liste de la page (`Listing.equipementsPublies`) ; absent quand le lecteur ne les rend pas. */
  equipementsPublies?: EquipementPublie[] | null;
};

function hote(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Le texte d'un élément, entités décodées, espaces repliées. */
function texte(html: string): string {
  return decoderEntites(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/**
 * Un panneau de la fiche Cimalpes (`pop-equipements`, `pop-services-inclus`),
 * jusqu'au panneau ou à la fenêtre (`modal`) qui le suit. Sans la fenêtre,
 * le panneau des équipements de chalet-delta-36 courait jusqu'aux
 * « Distances » (« Distance du centre : 700 m »), qui ne sont pas des
 * équipements.
 */
function panneau(html: string, id: string): string {
  const i = html.indexOf(`id="${id}"`);
  if (i < 0) return "";
  const reste = html.slice(i + 4);
  const j = reste.search(/id="(?:pop|Modal)-|<div class="modal\b/);
  return j < 0 ? reste : reste.slice(0, j);
}

/**
 * Les éléments d'un panneau : un `<p>` nu par équipement ou service, sous le
 * titre de sa rubrique (`<h3>` : « Généraux », « Multimédia », « Ménage &
 * Linge »). Les titres du panneau (`<p class="…">`) n'en sont pas.
 */
function elementsCimalpes(p: string): { libelle: string; groupe: string | null }[] {
  const out: { libelle: string; groupe: string | null }[] = [];
  let groupe: string | null = null;
  for (const m of p.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>|<p>([^<]+)<\/p>/g)) {
    if (m[1] != null) {
      groupe = texte(m[1]) || null;
      continue;
    }
    const libelle = texte(m[2]);
    if (libelle) out.push({ libelle, groupe });
  }
  return out;
}

/**
 * La rubrique « Services Inclus » du panneau des services, jusqu'au titre
 * suivant. « Essential (A la carte) » et « Personnels » la précèdent : à la
 * carte, rien n'y est inclus. Sans ce titre, rien.
 */
function servicesInclusCimalpes(p: string): string {
  const m = /<p class="[^"]*">\s*Services Inclus\s*<\/p>/i.exec(p);
  if (!m) return "";
  const reste = p.slice(m.index + m[0].length);
  const j = reste.search(/<p class="/);
  return j < 0 ? reste : reste.slice(0, j);
}

/** Le « Descriptif » : le bloc `read-more-content`, sans le paragraphe de la station qui le suit. */
function descriptifCimalpes(html: string): string | null {
  const m = /<div id="manifest">\s*<div class="read-more-content"[^>]*>([\s\S]*?)(?:<p><a\b|<\/div>)/.exec(html);
  return m ? texteDeHtml(m[1]) : null;
}

export function contenuCimalpes(html: string): ContenuDeFiche | null {
  const description = descriptifCimalpes(html);
  const equipementsPanneau = elementsCimalpes(panneau(html, "pop-equipements"));
  const services = panneau(html, "pop-services-inclus");
  const forts = [...html.matchAll(/<span class="bg-paille">([^<]+)<\/span>/g)]
    .map((m) => texte(m[1]))
    .filter(Boolean);
  // Les douze clés : tout le panneau des services, comme avant ; les
  // libellés publiés, ses seuls services inclus.
  const liste = [
    ...equipementsPanneau.map((e) => e.libelle),
    ...elementsCimalpes(services).map((e) => e.libelle),
    ...forts,
  ];
  if (!description && liste.length === 0) return null;
  // Les libellés tels quels, chacun une fois, le premier gardé : les
  // équipements par rubrique, les services inclus, les points forts
  // (« Terrasse », que le panneau ne liste pas). Rien n'y dit une absence :
  // le libellé seul en décide. Jamais la description.
  const vus = new Set<string>();
  const equipementsPublies: EquipementPublie[] = [];
  for (const { libelle, groupe } of [
    ...equipementsPanneau,
    ...elementsCimalpes(servicesInclusCimalpes(services)),
    ...forts.map((libelle) => ({ libelle, groupe: null })),
  ]) {
    const cle = plierEquipement(libelle);
    if (vus.has(cle)) continue;
    vus.add(cle);
    equipementsPublies.push({ libelle, ...(groupe ? { groupe } : {}) });
  }
  return {
    description,
    photos: null,
    amenities: equipements(fusionner(depuisListe(liste.map((t) => ({ texte: t }))), depuisTexte(description))),
    ...(equipementsPublies.length ? { equipementsPublies } : {}),
  };
}

export function contenuAbritel(html: string): ContenuDeFiche | null {
  const i = html.indexOf(">Équipements populaires</h2>");
  if (i < 0) return null;
  const fin = html.indexOf("</ul>", i);
  const bloc = html.slice(i, fin < 0 ? undefined : fin);
  const items = [...bloc.matchAll(/<li[^>]*data-stid="sp-content-item-\d+"[^>]*>([\s\S]*?)<\/li>/g)]
    .map((m) => texte(m[1]))
    .filter(Boolean);
  if (items.length === 0) return null;
  // Les douze clés n'y lisent que le Wi-Fi (« Accès Internet ») : la cuisine,
  // le barbecue, le mobilier d'extérieur, le réfrigérateur de p5392632vb
  // passent par les libellés publiés (`equipementsDe`). Chacun une fois, le
  // premier tel quel (« Barbecue » y revient) ; rien n'y dit une absence, le
  // libellé seul en décide.
  const vus = new Set<string>();
  const equipementsPublies: EquipementPublie[] = [];
  for (const libelle of items) {
    const cle = plierEquipement(libelle);
    if (vus.has(cle)) continue;
    vus.add(cle);
    equipementsPublies.push({ libelle });
  }
  return {
    description: null,
    photos: null,
    amenities: equipements(depuisListe(items.map((t) => ({ texte: t })))),
    equipementsPublies,
  };
}

/**
 * Le descriptif d'une fiche Ingénie : les blocs `contenu_descriptif` du pavé
 * `pave1`. Aux Saisies (73G211126, 1er octobre 2026), un `pave2` le précède,
 * l'encart « BONS PLANS AVEC LES SAISIES RÉSERVATION » de la centrale : il
 * n'est pas le logement. Sans `pave1` (`<div class="cadre">` de certaines
 * centrales), tous les blocs. Rien que du texte : ni équipement, ni photo.
 */
export function contenuIngenie(html: string): ContenuDeFiche | null {
  const blocs = [...html.matchAll(/<div class=["']([^"']*)["'][^>]*>\s*<span class=["']contenu_descriptif["'][^>]*>([\s\S]*?)<\/span>\s*<\/div>/gi)].map(
    (m) => ({ pave1: /(?:^|\s)pave1(?:\s|$)/.test(m[1]), texte: texteDeHtml(m[2]) }),
  );
  const retenus = blocs.some((b) => b.pave1) ? blocs.filter((b) => b.pave1) : blocs;
  const description = retenus
    .map((b) => b.texte)
    .filter((t): t is string => !!t)
    .join("\n")
    .trim();
  return description ? { description, photos: null, amenities: null } : null;
}

/** La page est une fiche Ingénie : elle porte un descriptif `contenu_descriptif`. */
function estFicheIngenie(html: string): boolean {
  return /class=["']contenu_descriptif["']/i.test(html);
}

/** Les hôtes dont on sait lire le contenu de la fiche, et leur lecteur. */
const LECTEURS: ReadonlyArray<{ hote: RegExp; lire: (html: string) => ContenuDeFiche | null }> = [
  { hote: /(^|\.)cimalpes\.com$/, lire: contenuCimalpes },
  { hote: /(^|\.)abritel\.fr$/, lire: contenuAbritel },
];

/**
 * La fiche de cette URL a un lecteur de contenu : lue (par la recherche ou sa
 * tâche de fond), elle donne description et équipements. L'écran relit ses
 * annonces tant que ce contenu manque (`contenuAPoser`, `relecture.ts`), sans
 * recopier la liste des hôtes.
 */
export function aLecteurDeContenu(url: string): boolean {
  const h = hote(url);
  return h != null && LECTEURS.some((l) => l.hote.test(h));
}

/**
 * Le contenu d'une fiche lue, selon son hôte, ou, faute de lecteur pour
 * l'hôte, selon la page (Ingénie) ; `null` pour une page qu'on ne sait pas
 * lire. `aLecteurDeContenu` ne compte pas Ingénie : sa fiche n'est pas
 * redemandée pour sa description, elle est lue quand elle s'ouvre pour un
 * trou.
 */
export function contenuDeFiche(url: string, html: string): ContenuDeFiche | null {
  const h = hote(url);
  if (!h) return null;
  const lecteur = LECTEURS.find((l) => l.hote.test(h));
  if (lecteur) return lecteur.lire(html);
  return estFicheIngenie(html) ? contenuIngenie(html) : null;
}
