/**
 * Le marqueur de carte. **Une seule fabrique, une seule géométrie.**
 *
 * Il y en avait quatre : une pastille de station avec son nom en étiquette, la
 * même « compacte » au disque réduit, un repère de station à un troisième
 * diamètre, et le divIcon écrit à la main de `Carte.tsx`. Trois ombres
 * différentes, trois tailles, et l'étiquette de nom qui étirait la boîte du
 * marqueur : une pastille nommée « Val d'Isère » était trois fois plus large
 * qu'une pastille sans nom, et le poids de l'étiquette décalait le disque d'une
 * dizaine de pixels au-dessus de son point géographique.
 *
 * Ici, la boîte est **carrée, fixe et déclarée une fois** (`EPINGLE`). Rien ne
 * la fait varier : ni le nom, ni l'altitude, ni le prix, ni le zoom. Les états
 * — dans la comparaison, désignée — se distinguent par la couleur, l'anneau et
 * l'ombre, jamais par la taille. La seule variation de taille admise est la
 * mise à l'échelle au survol, dont le facteur est un jeton.
 *
 * La pastille ne porte aucun texte : le nom vit dans `aria-label`, et la fiche
 * qui s'ouvre au survol ou au clic le donne à lire.
 */

/** Géométrie du marqueur. Seule table de ces valeurs. */
export const EPINGLE = {
  /** Côté de la boîte, en pixels. C'est aussi la cible du pointeur. */
  taille: 32,
  /** Hauteur de la pastille au prix, sur la carte des logements. */
  hauteurPrix: 29,
} as const;

/** Étages d'empilement. Leaflet ajoute ces décalages à la latitude projetée du
 *  marqueur ; en deçà de la hauteur de la carte, deux marqueurs proches se
 *  départageaient par leur position et non par leur état. */
export const ETAGE = { repere: -4000, normale: 0, comparee: 2000, designee: 6000 } as const;

export type EtatEpingle = "normale" | "comparee" | "repere" | "vue" | "retenue";

export type Epingle = {
  html: string;
  /** Boîte du marqueur, en pixels. */
  taille: [number, number];
  /** Point de la boîte posé sur la coordonnée. */
  ancre: [number, number];
};

const MONTAGNE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 19l6-11 4 7 2-3 6 7z"/></svg>';

/**
 * La pastille d'une station. Aucun texte : `nom` sert au seul `aria-label`.
 *
 * L'attribut `title` natif a disparu avec l'étiquette : il produisait une
 * seconde infobulle, celle du système, par-dessus la fiche de survol.
 */
export function epingleStation(nom: string, etat: EtatEpingle = "normale"): Epingle {
  return {
    html: `<div class="epingle epingle--${etat}" aria-label="${echappe(nom)}"><span class="epingle__pastille">${MONTAGNE}</span></div>`,
    taille: [EPINGLE.taille, EPINGLE.taille],
    ancre: [EPINGLE.taille / 2, EPINGLE.taille / 2],
  };
}

/** Le repère de la station retenue, sur la carte des logements : même boîte,
 *  même géométrie, un état de plus. Il n'est ni survolable ni cliquable. */
export function epingleRepere(nom: string): Epingle {
  return epingleStation(nom, "repere");
}

/**
 * La pastille au prix d'une annonce.
 *
 * Ce n'est pas une pastille de station : c'est une étiquette, et son texte est
 * son objet. Elle partage la hauteur, la bordure et le `box-sizing` de la
 * famille ; sa largeur suit le prix, comme dans la maquette. La boîte du
 * marqueur reste d'un pixel : la pastille se centre elle-même, comme un
 * libellé posé sur un point.
 */
export function epinglePrix(prix: string, nom: string, etat: "normale" | "retenue" | "vue"): Epingle {
  return {
    html: `<div class="epingle-prix epingle-prix--${etat}" aria-label="${echappe(nom)}, ${echappe(prix)}">${echappe(prix)}</div>`,
    taille: [1, 1],
    ancre: [0, 0],
  };
}

export function echappe(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
}
