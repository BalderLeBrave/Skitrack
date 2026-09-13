/**
 * Le moteur Orchestra, partie pure : lire le catalogue, lire le calendrier.
 *
 * Orchestra Platform, de Travelsoft, équipe La Plagne et Chamonix. C'est le
 * moteur le plus coûteux du parc à interroger, et il faut dire pourquoi.
 *
 * **Sa page de résultats est fermée, et le prix s'obtient un logement à la
 * fois.** Le `robots.txt` de la centrale ferme `/*serp?` et tout ce qui porte
 * `type=`, c'est-à-dire la recherche groupée. Ce qui reste ouvert, ce sont les
 * pages de destination, qui listent les logements sans leur prix, et un point
 * d'entrée de calendrier par logement. Couvrir un village coûte donc une page
 * plus sept à neuf appels ; couvrir La Plagne entière, onze pages et
 * quatre-vingt-quinze appels.
 *
 * **Ce qui rend cela tenable, c'est que rien de tout cela ne dépend des
 * dates.** La page de destination est un catalogue, et le calendrier d'un
 * logement porte d'un coup tous ses mois, toutes ses durées et toutes ses
 * bandes de capacité. Les deux se retiennent donc en mémoire, et une deuxième
 * recherche, à n'importe quelles dates, ne coûte plus rien. C'est
 * `orchestra.server.ts` qui tient ces caches.
 *
 * **Le prix se lit à quatre entrées.** `availabilities` est un dictionnaire
 * imbriqué : ville de départ, bande de capacité, durée, mois, jour. La ville
 * `XXX` est celle qui vend l'hébergement seul, sans transport — les autres,
 * `PAR`, `LON`, `LIL`, vendent un forfait avec le voyage, et leurs prix sont
 * sans rapport. La bande s'écrit « 1-8 », minimum et maximum de voyageurs ; la
 * durée « 8-7 », jours et nuits ; le jour sur deux chiffres. Se tromper d'une
 * seule de ces quatre entrées rend une liste vide sans rien signaler.
 *
 * **Ce que le prix vaut.** Relevé du 13 septembre 2026. Sans dates, la fiche
 * d'un logement annonce « À partir de 2 280 € » et la grille d'une destination
 * un prix d'appel : ce sont bien des « à partir de ». Avec dates, le même
 * logement rend un total qui suit la durée — 3 300 € sur sept nuits, 6 500 €
 * sur quatorze, 9 700 € sur vingt et une — et qui suit la saison à durée
 * constante : 900 € le 19 septembre, 1 500 € le 5 décembre, 3 300 € le
 * 6 février. Un tarif qui double avec la durée et triple avec la saison n'est
 * pas une grille.
 */

/** Un logement du catalogue, avant d'avoir son prix. */
export type CarteOrchestra = {
  /** Identifiant produit, celui qu'attend le calendrier. */
  id: string;
  titre: string;
  /** Chemin de la fiche, relatif à la centrale. */
  chemin: string | null;
  photo: string | null;
};

export type DemandeOrchestra = {
  checkIn: string;
  checkOut: string;
  guests: number;
};

/** Une offre datée, telle que le calendrier la porte. */
export type OffreOrchestra = {
  total: number;
  /** Capacité maximale de la bande qui a répondu. */
  capacite: number | null;
  /** Libellé de la catégorie, quand le calendrier en donne un. */
  categorie: string | null;
};

/** Nombre de nuits entre deux dates ISO. */
export function nuitsOrchestra(checkIn: string, checkOut: string): number {
  const a = Date.parse(`${checkIn}T00:00:00Z`);
  const b = Date.parse(`${checkOut}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** Une date ISO en `jj-mm-aaaa`, la forme que le calendrier attend. */
export function dateOrchestra(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
}

/** L'URL d'une page de destination. Elle ne porte aucun paramètre, donc rien que `robots.txt` ferme. */
export function urlCatalogueOrchestra(base: string, destination: string): string {
  return `${base.replace(/\/+$/, "")}/destinations/${encodeURIComponent(destination)}`;
}

/**
 * L'URL du calendrier d'un logement.
 *
 * `departureDate` ne restreint pas la réponse à cette date : elle oriente les
 * mois rendus. Le calendrier revient de toute façon avec plusieurs mois, ce qui
 * est précisément ce qui permet de le retenir.
 */
export function urlCalendrierOrchestra(base: string, id: string, d: DemandeOrchestra): string {
  const nuits = nuitsOrchestra(d.checkIn, d.checkOut);
  const p = new URLSearchParams();
  p.set("withCap", "true");
  p.set("minNight", String(nuits));
  p.set("minDay", String(nuits + 1));
  // La ville de départ `XXX` est celle qui vend l'hébergement seul.
  p.set("departureCity", "XXX");
  p.set("departureDate", dateOrchestra(d.checkIn));
  return `${base.replace(/\/+$/, "")}/ajax/bookingEngine/${encodeURIComponent(id)}?${p.toString()}`;
}

function desechapper(s: string): string {
  return s
    .replace(/&#0*(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, "\u00a0");
}

/**
 * Lit une page de destination.
 *
 * Le titre vient du texte de remplacement de la première image, qui porte le
 * nom du logement suivi du rang de la photo : « Studio - Résidence LICORNE -
 * ref LICO0314 - 1 ». Le rang est retiré.
 */
export function cartesOrchestra(page: string): CarteOrchestra[] {
  const debuts: number[] = [];
  const re = /class="[^"]*\bcpt-product-item\b[^"]*"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(page)) !== null) debuts.push(m.index);
  const out: CarteOrchestra[] = [];
  for (const [i, s] of debuts.entries()) {
    const f = page.slice(s, i + 1 < debuts.length ? debuts[i + 1] : page.length);
    const id = /data-product-id="(\d+)"/.exec(f)?.[1];
    if (!id) continue;
    const alt = /<img[^>]+alt="([^"]{2,160})"/.exec(f)?.[1] ?? "";
    const titre = desechapper(alt)
      .replace(/\s*-\s*\d+\s*$/, "")
      .trim();
    if (!titre) continue;
    const lien = /data-link="(\/[^"#]+)/.exec(f)?.[1] ?? null;
    const photo = /<img[^>]+(?:data-src|src)="(https?:\/\/[^"]+)"/.exec(f)?.[1] ?? null;
    out.push({ id, titre, chemin: lien ? desechapper(lien) : null, photo });
  }
  return out;
}

type Jour = {
  price?: unknown;
  maxPax?: unknown;
  status?: unknown;
  categories?: Record<string, { categoryLabel?: unknown }> | null;
};
type Calendrier = {
  availabilities?: Record<string, Record<string, Record<string, Record<string, Record<string, Jour>>>>> | null;
};

function nombre(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Cherche, dans un calendrier, le prix de la demande.
 *
 * On retient le moins cher parmi les bandes de capacité qui couvrent le groupe :
 * un même logement paraît sous plusieurs bandes, et c'est ce qu'il en coûte d'y
 * dormir qui compte. Un jour dont l'état n'est pas « Available » est écarté.
 */
export function prixOrchestra(calendrier: unknown, d: DemandeOrchestra): OffreOrchestra | null {
  const c = (calendrier ?? {}) as Calendrier;
  const sansTransport = c.availabilities?.XXX;
  if (!sansTransport) return null;
  const nuits = nuitsOrchestra(d.checkIn, d.checkOut);
  if (nuits <= 0) return null;
  const duree = `${nuits + 1}-${nuits}`;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.checkIn);
  if (!m) return null;
  const mois = `${m[2]}-${m[1]}`;
  const jour = m[3] ?? "";
  const groupe = Math.max(1, Math.trunc(d.guests));

  let meilleure: OffreOrchestra | null = null;
  for (const [bande, durees] of Object.entries(sansTransport)) {
    const [lo, hi] = bande.split("-");
    const min = nombre(lo);
    const max = nombre(hi);
    if (min == null || max == null || groupe < min || groupe > max) continue;
    const e = durees?.[duree]?.[mois]?.[jour];
    const total = nombre(e?.price);
    if (total == null || total <= 0) continue;
    if (typeof e?.status === "string" && e.status !== "Available") continue;
    if (meilleure && meilleure.total <= total) continue;
    // La clé de la catégorie n'est pas fixe : c'est « Housing » chez certains
    // logements et le code commercial du produit chez d'autres, « ccdt052 ».
    // On prend donc le premier libellé qui vient, sans en présumer le nom.
    const cat = Object.values(e?.categories ?? {}).find(
      (x) => typeof x?.categoryLabel === "string" && x.categoryLabel,
    )?.categoryLabel;
    meilleure = {
      total,
      capacite: nombre(e?.maxPax),
      categorie: typeof cat === "string" && cat ? cat : null,
    };
  }
  return meilleure;
}
