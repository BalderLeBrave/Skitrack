/**
 * Le moteur iResa, partie pure : bâtir la demande, lire la réponse.
 *
 * Une seule centrale du parc l'emploie, Les Arcs, et les prix ne viennent pas
 * de `lesarcs.com` mais de son site de réservation, `lesarcs-reservation.com`.
 * La vitrine est un Drupal ; iResa porte le stock, les disponibilités et les
 * prix, et imprime tout son résultat en JSON dans la page.
 *
 * **Le piège de ce moteur, et il est sérieux.** Quand la durée demandée n'est
 * pas vendue, il ne rend pas une liste vide : il rend son **catalogue non
 * daté**, six cent huit fiches aux prix unitaires — trente-neuf euros pour une
 * nuit en dortoir, quarante-cinq pour une chambre capsule. Prendre cela pour
 * une réponse datée mettrait des prix de nuitée dans une comparaison de
 * séjours, et les moins chers du parc par-dessus le marché.
 *
 * La parade est dans les données elles-mêmes : chaque fiche porte sa propre
 * `date_debut` et sa propre `duree`. Une fiche n'est retenue que si les deux
 * correspondent à ce qu'on a demandé. Sur le catalogue non daté, `duree` vaut
 * un, et tout tombe.
 *
 * **Ce que le prix vaut.** Relevé du 13 septembre 2026 : sept nuits à huit
 * personnes rendent vingt-six résultats, de 1 911 € à 3 398 €, chacun avec
 * `duree` 7 et `cap_max` 8 ; et la centrale écrit elle-même « à partir de
 * 1 911 € pour 7 nuit(s) », son filtre par personne descendant à 238,88, soit
 * 1 911 divisé par huit. Sur cette date, la centrale ne vend que des semaines :
 * son propre service de durées, interrogé, ne répond qu'une seule valeur. La
 * preuve de la durée a donc été faite sur une date qui en vend plusieurs, le
 * 17 octobre 2026, où le même hébergement passe de 478 € sur deux nuits à
 * 956 € sur quatre et 1 673 € sur sept.
 *
 * **Ce qu'il donne.** Le nom, le prix total, la durée, la capacité maximale, la
 * surface, les étoiles, le lieu et des photos. Pas de coordonnées.
 */

/** Une fiche telle que le moteur l'écrit, avant traduction en `Listing`. */
export type FicheIresa = {
  /** Identifiant d'hébergement, stable d'une requête à l'autre. */
  id: string;
  titre: string;
  /**
   * Total du séjour, en euros. **`0` veut dire « le moteur n'a pas publié de
   * prix »**, jamais « gratuit » : la fiche sort quand même.
   */
  total: number;
  capacite: number | null;
  /** Lieu tel que le moteur l'écrit : commune, hameau. */
  lieu: string | null;
  photo: string | null;
  /** Chemin de la fiche sur le site de la centrale, relatif. */
  chemin: string | null;
  /** Nombre de nuits de cette offre. Sert de garde-fou, pas d'affichage. */
  nuits: number;
};

export type DemandeIresa = {
  checkIn: string;
  checkOut: string;
  guests: number;
};

/** Nombre de nuits entre deux dates ISO. */
export function nuitsIresa(checkIn: string, checkOut: string): number {
  const a = Date.parse(`${checkIn}T00:00:00Z`);
  const b = Date.parse(`${checkOut}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** Une date ISO en `aaaa-m-j`, sans zéro de tête : c'est la forme qui commande. */
export function dateIresa(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${Number(m[1])}-${Number(m[2])}-${Number(m[3])}` : iso;
}

/**
 * Le corps du `POST` de recherche.
 *
 * `fakeDateDebut` et `fakeDuree` sont les champs qui commandent ; `filters[date]`
 * n'est que l'affichage du sélecteur, et le moteur ne s'en sert pas.
 * `form_build_id` vient du formulaire lui-même, comme pour toute soumission.
 */
export function corpsIresa(d: DemandeIresa, jeton: string): Record<string, string> {
  const nuits = nuitsIresa(d.checkIn, d.checkOut);
  return {
    "filters[tabs]": "search-stay",
    "filters[package]": String(nuits),
    "filters[hebergement]": "0",
    "filters[nombre_personne]": String(Math.max(1, Math.trunc(d.guests))),
    fakeDateDebut: dateIresa(d.checkIn),
    fakeDuree: String(nuits),
    fakeLieu: "",
    isHome: "1",
    isWidget: "1",
    op: "Voir les résultats",
    form_build_id: jeton,
    form_id: "search_form",
  };
}

/** Le jeton que le formulaire porte, à reprendre tel quel dans la soumission. */
export function jetonIresa(page: string): string | null {
  return (
    /name="form_build_id"[^>]+value="([^"]+)"/.exec(page)?.[1] ??
    /"form_build_id"\s*:\s*"([^"]+)"/.exec(page)?.[1] ??
    null
  );
}

type Datas = {
  id?: unknown;
  id_prestation_hebergement?: unknown;
  name?: unknown;
  prix_total?: unknown;
  prix_brut?: unknown;
  /**
   * Publié, et volontairement pas lu.
   *
   * Il vaut zéro sur tout le relevé du 13 septembre 2026, et rien dans la
   * charge ne dit de quoi il est le montant. Le connecteur en fabriquait un
   * prix barré — `prix_total + montant_valeur_promo` — puis écrivait
   * « remisé depuis X € » dans la preuve de l'annonce : une déduction présentée
   * comme une lecture, pour une remise que la centrale n'a jamais annoncée.
   * Entre deux lectures possibles, on n'en choisit aucune.
   */
  montant_valeur_promo?: unknown;
  cap_max?: unknown;
  duree?: unknown;
  date_debut?: unknown;
  lieu?: unknown;
  photos?: unknown;
};

/**
 * Le bloc JSON que la page porte, sous `script#__datasPrestations`.
 *
 * Chaque entrée a deux moitiés et il faut les deux : `datas` porte les nombres,
 * `template` le HTML rendu. La photo et le lien de la fiche ne vivent que dans
 * la seconde — celles de `datas.photos` sont des chemins bruts qui répondent
 * 404, le site ne servant que des dérivés signés.
 */
export function prestationsIresa(page: string): { datas: Datas; template: string }[] {
  const m = /<script[^>]+id="__datasPrestations"[^>]*>([\s\S]*?)<\/script>/.exec(page);
  if (!m) return [];
  try {
    const brut: unknown = JSON.parse(m[1] ?? "[]");
    if (!Array.isArray(brut)) return [];
    return brut.map((x) => {
      const o = (x ?? {}) as { datas?: unknown; template?: unknown };
      return {
        datas: (o.datas ?? x) as Datas,
        template: typeof o.template === "string" ? o.template : "",
      };
    });
  } catch {
    return [];
  }
}

function nombre(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * La vignette, prise dans le gabarit rendu.
 *
 * `datas.photos` donne des chemins bruts qui répondent 404 : le site ne sert
 * ses images que par des dérivés signés, dont le nom est un condensé et le
 * jeton une signature. Ni l'un ni l'autre ne se reconstruit ; ils se lisent.
 */
function vignette(template: string): string | null {
  const m = /(?:src|data-src)="(\/sites\/default\/files\/styles\/[^"]+)"/.exec(template);
  return m?.[1] ?? null;
}

/** Le chemin de la fiche, que le gabarit porte en clair. */
function cheminDe(template: string): string | null {
  const m = /href="(\/[a-z0-9-]{4,120}\?package=\d+)"/.exec(template);
  return m?.[1] ?? null;
}

/**
 * Lit une réponse de recherche, en n'en gardant que ce qui répond à la question
 * posée.
 *
 * Le filtre sur `duree` et `date_debut` n'est pas une précaution de style :
 * c'est la seule chose qui distingue une réponse datée du catalogue que le
 * moteur rend quand la durée demandée n'est pas vendue. Une fiche qui ne publie
 * pas sa durée ne peut pas prouver qu'elle couvre le séjour demandé ; elle sort
 * donc du relevé, et c'est le seul rejet de ce moteur.
 *
 * **Un prix manquant n'en est pas un second.** Une fiche datée sans montant est
 * rendue avec un total de zéro, qui se lit « listée sans prix ».
 *
 * **Pas de pagination, et ce n'est pas une borne posée au hasard.** Le moteur
 * imprime tout son résultat d'un coup dans `script#__datasPrestations` — six
 * cent huit fiches au relevé du 13 septembre 2026, quand il rend son catalogue
 * non daté. Il ne publie ni compteur de résultats ni numéro de page, et aucun
 * paramètre de page n'a été observé : il n'y a donc pas de suite à demander.
 */
export function lireIresa(page: string, d: DemandeIresa): FicheIresa[] {
  const nuits = nuitsIresa(d.checkIn, d.checkOut);
  const par = new Map<string, FicheIresa>();
  for (const { datas: x, template } of prestationsIresa(page)) {
    if (nombre(x.duree) !== nuits) continue;
    if (typeof x.date_debut === "string" && x.date_debut !== d.checkIn) continue;
    const id = String(x.id_prestation_hebergement ?? x.id ?? "");
    const titre = typeof x.name === "string" ? x.name.trim() : "";
    if (!id || !titre) continue;
    const lu = nombre(x.prix_total) ?? nombre(x.prix_brut);
    const total = lu != null && lu > 0 ? lu : 0;
    // Le même hébergement paraît sous plusieurs prestations : on garde le
    // moins cher. Un zéro n'est pas « moins cher », c'est l'absence de prix —
    // un montant publié l'emporte donc toujours sur une fiche muette.
    const deja = par.get(id);
    if (deja && !(total > 0 && (deja.total <= 0 || total < deja.total))) continue;
    par.set(id, {
      id,
      titre,
      total,
      capacite: nombre(x.cap_max),
      lieu: typeof x.lieu === "string" && x.lieu ? x.lieu : null,
      photo: vignette(template),
      chemin: cheminDe(template),
      nuits,
    });
  }
  return [...par.values()];
}
