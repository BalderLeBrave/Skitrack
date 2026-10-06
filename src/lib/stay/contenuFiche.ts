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
 * Les autres hôtes ne rendent rien ici. Module pur, chargé tel quel par
 * `node --experimental-strip-types`.
 */

import { depuisListe, depuisTexte, equipements, fusionner, type Equipement } from "./equipements.ts";
import { decoderEntites, texteDeHtml } from "./texteHtml.ts";

export type ContenuDeFiche = { description: string | null; photos: string[] | null; amenities: Equipement[] | null };

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

/** Un panneau de la fiche Cimalpes (`pop-equipements`, `pop-services-inclus`), jusqu'au panneau suivant. */
function panneau(html: string, id: string): string {
  const i = html.indexOf(`id="${id}"`);
  if (i < 0) return "";
  const reste = html.slice(i + 4);
  const j = reste.search(/id="(?:pop|Modal)-/);
  return j < 0 ? reste : reste.slice(0, j);
}

/** Le « Descriptif » : le bloc `read-more-content`, sans le paragraphe de la station qui le suit. */
function descriptifCimalpes(html: string): string | null {
  const m = /<div id="manifest">\s*<div class="read-more-content"[^>]*>([\s\S]*?)(?:<p><a\b|<\/div>)/.exec(html);
  return m ? texteDeHtml(m[1]) : null;
}

export function contenuCimalpes(html: string): ContenuDeFiche | null {
  const description = descriptifCimalpes(html);
  // Les éléments des listes : un `<p>` nu par équipement ou service. Les
  // rubriques (« Distances », « Agencement ») ne sont pas dans ces panneaux.
  const items = [panneau(html, "pop-equipements"), panneau(html, "pop-services-inclus")].flatMap((p) =>
    [...p.matchAll(/<p>([^<]+)<\/p>/g)].map((m) => texte(m[1])),
  );
  const forts = [...html.matchAll(/<span class="bg-paille">([^<]+)<\/span>/g)].map((m) => texte(m[1]));
  const liste = [...items, ...forts].filter(Boolean);
  if (!description && liste.length === 0) return null;
  return {
    description,
    photos: null,
    amenities: equipements(fusionner(depuisListe(liste.map((t) => ({ texte: t }))), depuisTexte(description))),
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
  return { description: null, photos: null, amenities: equipements(depuisListe(items.map((t) => ({ texte: t })))) };
}

/** Le contenu d'une fiche lue, selon son hôte ; `null` pour un hôte qu'on ne sait pas lire. */
export function contenuDeFiche(url: string, html: string): ContenuDeFiche | null {
  const h = hote(url);
  if (!h) return null;
  if (/(^|\.)cimalpes\.com$/.test(h)) return contenuCimalpes(html);
  if (/(^|\.)abritel\.fr$/.test(h)) return contenuAbritel(html);
  return null;
}
