/**
 * Le moteur Ingénie, partie pure : construire l'URL, lire la réponse.
 *
 * Ingénie est le plus gros moteur du parc : vingt-huit centrales,
 * cinquante-quatre stations. Vingt-deux ferment la recherche datée par
 * `Disallow: /*booking?*`. On lit cette règle, on interroge quand même.
 *
 * **La première tentative échouait par notre faute.** Le formulaire porte
 * `action=searchAjax`, et c'est ce qu'on envoyait : le moteur répondait
 * « Une erreur s'est produite ». Le bouton « Afficher » n'envoie pas cette
 * action-là mais `action=result`, et celle-ci rend la liste complète en HTML.
 * Deux valeurs pour un même champ, et tout le moteur tenait à celle qu'on avait
 * lue en premier.
 *
 * **La requête la plus courte qui marche.** Elle a été réduite paramètre par
 * paramètre : `type_date` est inert — samedi, dimanche, dates libres ou vide
 * rendent la même page —, `redirectionUrl`, `target` et `reload` ne changent
 * rien, et aucune session n'est nécessaire. `type_prestataire=G`, en revanche,
 * est indispensable : sans lui la page revient vide. Cela vaut pour la
 * première page ; la suite de la liste, elle, vit dans la session
 * (`pageSuivanteIngenie`).
 *
 * **Ce que le prix vaut.** L'étiquette de la centrale dit « à partir de », et
 * elle est reprise telle quelle : une fiche couvre parfois plusieurs lots, et
 * le nombre est celui du moins cher. Mais ce nombre est daté, et il suit la
 * durée — relevé du 13 septembre 2026, sur quatorze nuits au lieu de sept :
 * « Deneb 25 » passe de 1 980 € à 3 960 € et « Chalet Les Oursons » de 4 959 €
 * à 9 918 €, soit exactement le double ; aux Contamines les cinq logements
 * doublent aussi. Sans dates, la page ne porte aucune fiche. Ce n'est donc pas
 * un tarif d'affichage, c'est le total d'un séjour réservable à ces dates-là.
 *
 * **Les coordonnées sont dans la page sur une partie des gabarits.** Ce
 * fichier disait « aucune coordonnée » pour tous ; c'est faux au moins pour
 * trois. Chaque fiche de leur liste ouvre sur un bloc JSON-LD
 * `LocalBusiness` : son `name`, son téléphone et son courriel sont ceux du
 * loueur, mais `location.address` est l'adresse du
 * logement et `location.geo` son point. Relevé du 20 septembre 2026 sur trois
 * gabarits (Arêches-Beaufort, Châtel, Valloire, 8 personnes du 6 au 13 février
 * 2027) : 39 fiches sur 40 portent un point, et les points sont distincts d'une
 * fiche à l'autre même quand le loueur est le même — sept fiches d'une même
 * agence à Châtel, sept points. C'est donc le logement, pas l'agence. Un `geo`
 * vide (`"latitude":""`) reste vide. Risoul, Les Contamines et Valmeinier
 * n'en montraient pas au relevé du 13 septembre, et Risoul et les
 * Contamines n'en montrent toujours pas au relevé du 25 : ni bloc par fiche,
 * ni capacité ni chambres affichées — Risoul publie seulement ses pièces en
 * critère (`GTYPAP-G3PIEC-G`, « 3 pièces »). Pour eux, le point reste à lire
 * sur la fiche, et la ligne de couverture du journal
 * (`centrales/couverture.ts`) dit, gabarit par gabarit, ce qu'il en est.
 *
 * **La capacité et les chambres aussi.** Sous le titre, la fiche affiche
 * « 55 m² · 10 personnes · 3 chambres » (Arêches), « 8 personnes · 96 m² »
 * (Valloire) ; Châtel range ses chambres dans ses critères, « 4 chambre(s) ».
 * Les noms de classe changent d'une centrale à l'autre (`NBPERS-10PERS-G`,
 * `GCAPACITE-8PERS-I`, `INBCHAMBRE-ICHAMBRES-I`) ; ce qui ne change pas, c'est
 * un élément dont tout le texte est « N personnes » ou « N chambres ». C'est
 * lui qu'on lit, et rien d'autre : ni la description libre, où « 1 lit
 * 2 personnes » n'est pas une capacité, ni le texte des photos.
 *
 * À Valloire, ce nombre suit la demande : 8 sur la fiche du 20 septembre que
 * les tests figent, pour huit personnes ; 4 sur les dix fiches de la page du
 * 25, pour quatre. Ce n'est pas un écho. Les dix fiches du 25 sont des
 * studios cabine et des deux-pièces, la description de chacune détaille des
 * couchages qui font quatre places (« 1 lit double » et « 2 lits
 * superposés », par exemple), et le filtre « Capacité » de la même page
 * compte, sur les 359 annoncés, 159 logements à 4 personnes et 200 plus
 * grands : la première page n'en montre que dix, tous à quatre.
 *
 * **Le titre, quand le gabarit n'en marque pas.** Ces trois gabarits n'ont ni
 * `itemprop="name"` ni lien `ga4-fiche-link` : le titre retombait sur le texte
 * de la première photo, « _clients_227327001_photos_59a_6393990 ». Le nom est
 * dans le `<h2>` du bloc `nom`, et c'est là qu'on le prend avant la photo.
 *
 * **La capacité du titre reste un recours.** « Demi chalet de gauche
 * 8 personnes » est une annonce. « 2 appartements de 6 personnes face à face »
 * n'en est pas une : six ou douze, choisir c'est inventer, et le filtre
 * écarterait un logement que la centrale vient de proposer. Dans ce cas
 * `guests` reste vide, et l'écran dit « capacité non annoncée ».
 */

/** Une fiche telle que la centrale l'écrit, avant traduction en `Listing`. */
export type FicheIngenie = {
  /** Identifiant de prestation, stable d'une requête à l'autre. */
  id: string;
  titre: string;
  /**
   * Total du séjour, en euros.
   *
   * **`0` veut dire « la centrale n'a pas de tarif à ces dates »** — elle
   * l'écrit « à partir de 0 € » —, jamais « gratuit ». La fiche sort quand
   * même : c'est l'écran qui dira « listée sans prix ».
   */
  total: number;
  /** L'étiquette au-dessus du prix, par exemple « à partir de ». */
  etiquette: string | null;
  /**
   * Le bloc de prix tel qu'il se lit, ses trois morceaux dans l'ordre :
   * « À partir de 2 090 € pour la location ».
   *
   * Le troisième, `nature_prix_en_cours`, dit ce que le prix couvre et n'était
   * pas lu — or c'est la seule chose qui distingue « pour la location » d'un
   * prix par personne ou par nuit.
   */
  libelle: string | null;
  photo: string | null;
  /** Chemin de la fiche, relatif à la centrale. */
  chemin: string | null;
  /** Point du logement, `location.geo` du JSON-LD de la fiche. */
  lat: number | null;
  lon: number | null;
  /** Rue du logement, même bloc. Recours d'un géocodage quand le point manque. */
  adresse: string | null;
  /** Commune du logement, `addressLocality`. */
  commune: string | null;
  /** « 10 personnes » affiché comme tel. */
  capacite: number | null;
  /** « 3 chambres », « 4 chambre(s) » affiché comme tel. */
  chambres: number | null;
  /** « 4 pièces » affiché comme critère. Le titre en porte souvent aussi. */
  pieces: number | null;
};

export type DemandeIngenie = {
  checkIn: string;
  checkOut: string;
  guests: number;
};

/** Nombre de nuits entre deux dates ISO. Zéro ou moins n'a pas de sens. */
export function nuitsEntre(checkIn: string, checkOut: string): number {
  const a = Date.parse(`${checkIn}T00:00:00Z`);
  const b = Date.parse(`${checkOut}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** Une date ISO en `jj/mm/aaaa`, la seule forme que le moteur accepte. */
export function dateIngenie(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/**
 * L'URL d'une recherche datée.
 *
 * `cid` est le numéro de configuration du moteur, propre à chaque centrale ; il
 * se lit sur sa page d'accueil.
 */
/**
 * La catégorie d'hébergement par défaut.
 *
 * Elle marche sur douze hôtes et pas sur treize : `www.valloire.com` ne la
 * propose pas et son moteur répond « Une erreur s'est produite ». Voir
 * `typesPrestataireDepuisPage`, qui lit les valeurs que l'hôte publie.
 */
export const TYPE_PRESTATAIRE_DEFAUT = "G";

/**
 * Le vocabulaire des catégories de location, pour les hôtes qui ne le
 * publient pas.
 *
 * `reservation.courchevel.com` ne sert aucun formulaire — sa recherche est
 * entièrement peinte en JavaScript —, donc rien à y lire. Mais son moteur
 * emploie le même vocabulaire que les autres : interrogé sur `I`, il rend
 * 115 résultats, et 5 sur `H`.
 *
 * **Seulement la location.** Consigne du propriétaire : maisons,
 * appartements, chalets, gîtes meublés, résidences de location ; ni hôtel,
 * ni hébergement insolite, ni camping, ni refuge, ni chambre d'hôtes, ni gîte
 * d'étape. Le formulaire de `www.valloire.com` nomme les quatre catégories du
 * moteur (relevé du 25 septembre 2026) : `I` « Appartement, Chalet »,
 * `I_RESID` « Résidence de Tourisme », `H` « Hôtel, Village Club »,
 * `H_INSOLITE` « Hébergement insolite ». Les deux premières restent ; les
 * deux autres ne sont plus jamais demandées (`TYPES_PRESTATAIRE_ECARTES`).
 *
 * À l'intérieur des catégories retenues, rien à écarter au même relevé : les
 * filtres « Type de logement » de la liste ne comptent que des appartements,
 * des chalets et des résidences — Arêches-Beaufort (`G`) 18 chalets et
 * 18 appartements, Risoul (`G`) 8 appartements en résidence, 2 en chalet et
 * 1 chalet, Valloire (`I`) 267 appartements en résidence, 48 en chalet ou
 * maison, 23 chalets individuels et 16 en résidence de tourisme.
 *
 * L'ordre est celui de l'usage : les appartements et chalets d'abord, qui
 * font le gros de la location de séjour, les résidences ensuite. On s'arrête
 * au premier qui répond — un hôte ne se sonde pas cinq fois pour le plaisir.
 */
export const TYPES_PRESTATAIRE_CONNUS: readonly string[] = ["I", "I_RESID"];

/** Hôtels et villages clubs, hébergements insolites : jamais demandés. */
export const TYPES_PRESTATAIRE_ECARTES: readonly string[] = ["H", "H_INSOLITE"];

/**
 * Ce qu'un libellé de catégorie nomme quand ce n'est pas de la location.
 *
 * Pour un hôte qui emploierait une autre lettre que `H` : le libellé est ce
 * que le visiteur lit, et c'est lui qui dit « Hôtel, Village Club ».
 */
const LIBELLE_HORS_LOCATION =
  /h[oô]tel|village club|insolite|camping|refuge|chambres? d['’]h[oô]tes?|g[iî]tes? d['’][ée]tape/i;

export function urlIngenie(
  base: string,
  cid: number | string,
  d: DemandeIngenie,
  typePrestataire: string = TYPE_PRESTATAIRE_DEFAUT,
): string {
  const p = new URLSearchParams();
  p.set("action", "result");
  p.set("cid", String(cid));
  p.set("MOTEUR_TYPES_PRESTATAIRE", "MOTEUR_HEBERGEMENT");
  p.set("type_prestataire", typePrestataire);
  p.set("datedeb", dateIngenie(d.checkIn));
  p.set("duree", String(nuitsEntre(d.checkIn, d.checkOut)));
  p.set("personnes", String(Math.max(1, Math.trunc(d.guests))));
  return `${base.replace(/\/+$/, "")}/booking?${p.toString()}`;
}

/**
 * Les catégories d'hébergement que cet hôte propose, dans son ordre.
 *
 * Le connecteur envoyait `type_prestataire=G` partout. Douze hôtes
 * l'acceptent ; treize ne le connaissent pas et leur moteur rend
 * « Une erreur s'est produite ». `www.valloire.com` publie `I`
 * (Appartement, Chalet), `I_RESID` (Résidence de Tourisme), `H` (Hôtel,
 * Village Club) et `H_INSOLITE` — et répond 65 résultats sur `I`.
 *
 * Trois choses ont été essayées le 20 septembre 2026 et écartées : omettre le
 * paramètre rend « aucun type de prestataire défini », le passer en liste
 * `I,H` rend une erreur, et `type_date` n'y change rien.
 *
 * La page qui refuse `G` est celle qui porte le formulaire, donc ces valeurs :
 * le remède est dans le symptôme, et aucune requête n'est dépensée à le
 * chercher ailleurs.
 */
export function typesPrestataireDepuisPage(page: string): string[] {
  return categoriesDepuisPage(page).map((c) => c.code);
}

/** Les options du sélecteur `type_prestataire` : code et libellé, sans doublon. */
function categoriesDepuisPage(page: string): { code: string; libelle: string }[] {
  const bloc = /name="type_prestataire"(.{0,2000}?)<\/select>/s.exec(page);
  if (!bloc) return [];
  const out: { code: string; libelle: string }[] = [];
  for (const m of bloc[1].matchAll(/<option[^>]*value="([^"]+)"[^>]*>([^<]*)/g)) {
    const code = m[1] ?? "";
    if (!code || out.some((c) => c.code === code)) continue;
    out.push({ code, libelle: desechapper(m[2] ?? "") });
  }
  return out;
}

/**
 * Les catégories **de location** que cet hôte publie, dans son ordre.
 *
 * Celles de `typesPrestataireDepuisPage`, moins les catégories écartées : par
 * leur code (`H`, `H_INSOLITE`), ou par leur libellé quand l'hôte emploie une
 * autre lettre. Une lettre inconnue au libellé neutre reste, comme avant :
 * c'est peut-être la location de cet hôte-là.
 */
export function typesLocationDepuisPage(page: string): string[] {
  return categoriesDepuisPage(page)
    .filter(
      (c) => !TYPES_PRESTATAIRE_ECARTES.includes(c.code) && !LIBELLE_HORS_LOCATION.test(c.libelle),
    )
    .map((c) => c.code);
}

/**
 * Les catégories à essayer quand `G` n'a pas rendu de résultats : deux au
 * plus, dans l'ordre de l'hôte.
 *
 * Un hôte qui publie ses catégories est pris au mot : on n'essaie que celles
 * de location, et aucune s'il n'en publie pas — il n'est pas sondé au hasard.
 * Un hôte qui ne publie rien, ou seulement `G`, reçoit le vocabulaire commun
 * (`TYPES_PRESTATAIRE_CONNUS`), comme avant.
 */
export function categoriesDeRepli(page: string): string[] {
  const publiees = typesPrestataireDepuisPage(page).filter((t) => t !== TYPE_PRESTATAIRE_DEFAUT);
  if (publiees.length === 0) return TYPES_PRESTATAIRE_CONNUS.slice(0, 2);
  return typesLocationDepuisPage(page)
    .filter((t) => t !== TYPE_PRESTATAIRE_DEFAUT)
    .slice(0, 2);
}

/**
 * Le `cid` publié par une page d'accueil Ingénie.
 *
 * Trois formes vues le 13 septembre 2026 : l'appel
 * `new IngenieMenuEngine.Client({ cid: N })`, un champ caché `name="cid"`,
 * un paramètre d'URL `cid=`. Sans lui la recherche revient vide.
 */
export function cidDepuisPage(html: string): string | null {
  const client = /IngenieMenuEngine\.Client\(\s*\{[^}]*\bcid\s*:\s*['"]?(\d+)/i.exec(html);
  if (client?.[1]) return client[1];
  const champ =
    /name=["']cid["'][^>]*value=["'](\d+)["']/i.exec(html) ??
    /value=["'](\d+)["'][^>]*name=["']cid["']/i.exec(html);
  if (champ?.[1]) return champ[1];
  // `www.lesrousses.com` configure son widget sans passer par
  // `IngenieMenuEngine.Client` : le `cid` vit dans un objet quelconque —
  // `{ idWidget: 'widget-resa', target: "_blank", cid: 2, codeSite: "RESA" }` —
  // ou dans un `params.set('cid', '2')`. Les deux se lisent sans supposer le
  // nom du constructeur, qui change d'un site à l'autre.
  const objet = /\bcid\s*:\s*['"]?(\d+)/i.exec(html);
  if (objet?.[1]) return objet[1];
  const pose = /\bset\(\s*['"]cid['"]\s*,\s*['"]?(\d+)/i.exec(html);
  if (pose?.[1]) return pose[1];
  const url = /\bcid=(\d+)/i.exec(html);
  return url?.[1] ?? null;
}

/**
 * Ce que le widget de réservation déclare sur la page d'accueil.
 *
 * `www.lesrousses.com` l'a montré : la page d'accueil configure son widget en
 * clair, et cette configuration fait autorité mieux que nos suppositions.
 *
 * ```
 * var params = { typePrestataire: 'S', moteurTypePrestataire: 'MOTEUR_HEBERGEMENT',
 *                urlSite: 'https://www.lesrousses-reservation.com/',
 *                idWidget: 'widget-resa', cid: 2, codeSite: "RESA" }
 * ```
 *
 * Trois choses en sortent, et chacune corrige une erreur que nous faisions :
 *
 * - **`urlSite`** est l'hôte qui vend. Le registre visait `www.lesrousses.com`,
 *   qui rend 404 sur `/booking` — la centrale est sur un autre domaine.
 * - **`typePrestataire`** est la catégorie que ce site emploie. Les Rousses
 *   emploie `S`, que ni `G` ni la liste connue ne contenaient : sur le bon
 *   hôte, `S` rend dix résultats et `G` une erreur.
 * - **`cid`**, déjà lu par ailleurs, confirmé ici.
 *
 * Lire cette configuration vaut mieux qu'essayer des valeurs l'une après
 * l'autre : c'est le site qui dit ce qu'il attend, et ça évite autant de
 * requêtes que de suppositions.
 */
export type ConfigWidgetIngenie = {
  cid: string | null;
  urlSite: string | null;
  typePrestataire: string | null;
};

/**
 * L'adresse de réservation vers laquelle un site d'office renvoie.
 *
 * `www.chatel.com` ne configure aucun widget sur son accueil — son `cid` vit
 * dans un paquet JavaScript minifié — mais il porte un lien clair vers
 * `https://www.chatelreservation.com`, qui publie tout : `cid` 5, `urlSite` et
 * `typePrestataire` `I`.
 *
 * On ne retient qu'un hôte **différent** de celui d'où l'on vient : un lien
 * vers sa propre page de réservation ne mène nulle part de nouveau, et la
 * suivre coûterait une requête pour rien.
 */
export function lienReservationDepuisPage(html: string, hoteCourant: string): string | null {
  for (const m of html.matchAll(/href="(https?:\/\/[^"]+)"/g)) {
    let hote: string;
    try {
      hote = new URL(m[1]).host;
    } catch {
      continue;
    }
    if (hote === hoteCourant) continue;
    if (!/reserv|booking|resa/i.test(hote)) continue;
    return `https://${hote}`;
  }
  return null;
}

export function configWidgetIngenie(html: string): ConfigWidgetIngenie {
  const champ = (nom: string): string | null => {
    const m = new RegExp(`\\b${nom}\\s*:\\s*['"]([^'"]+)['"]`, "i").exec(html);
    return m?.[1] ?? null;
  };
  return {
    cid: cidDepuisPage(html),
    urlSite: champ("urlSite"),
    typePrestataire: champ("typePrestataire"),
  };
}

const ENTITES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  // Espace insécable, écrite en échappement : un caractère invisible dans le
  // source se relit mal. C'est elle qui groupe les milliers, « 1 300 € ».
  nbsp: "\u00a0",
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  agrave: "à",
  acirc: "â",
  ccedil: "ç",
  ocirc: "ô",
  ugrave: "ù",
  ucirc: "û",
  icirc: "î",
  iuml: "ï",
  euml: "ë",
  sup2: "²",
  euro: "\u20ac",
};

function desechapper(s: string): string {
  return s
    .replace(/&#0*(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (m, n: string) => ENTITES[n.toLowerCase()] ?? m);
}

/** Texte visible d'un fragment : scripts et balises retirés, espaces repliés. */
export function texteIngenie(fragment: string): string {
  const sans = fragment
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  return desechapper(sans.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Découpe la page en fiches.
 *
 * Le nom de la classe change d'une centrale à l'autre —
 * `fiche_liste_immobilier_agen_loueur_resid_prestation_RESA_v3` à Risoul,
 * `fiche_liste_appartements_chalets_prestation_v2` aux Contamines. Seul le
 * préfixe `fiche_liste` leur est commun, et c'est donc lui qu'on suit.
 */
/**
 * La page rendue est-elle une page de résultats ?
 *
 * La question n'est pas rhétorique : treize centrales Ingénie sur vingt-huit
 * répondent aujourd'hui à l'URL de recherche par autre chose qu'un résultat,
 * avec un `200` et sans rien vendre. Sans ce contrôle, zéro fiche se lisait
 * « rien de disponible à ces dates », et l'écran annonçait Courchevel complet
 * un an à l'avance.
 *
 * Quatre états ont été relevés le 20 septembre 2026, et il faut les quatre
 * pour choisir le marqueur — les deux premiers sont de vraies réponses, les
 * deux derniers des pannes :
 *
 * | État | `nb_result` | `critere` | `datedeb` | fiches |
 * | --- | ---: | ---: | ---: | ---: |
 * | Arêches-Beaufort, 8 personnes | 41 | 180 | 38 | 10 |
 * | Arêches-Beaufort, 40 personnes | 41 | 128 | 7 | 0 |
 * | Valloire — formulaire de recherche | **0** | **0** | 1 | 0 |
 * | Courchevel — accueil de réservation | **0** | **0** | 0 | 0 |
 *
 * `nb_result` est le compteur de résultats du gabarit : il est là que le
 * compte vaille dix ou zéro, et **quarante et une fois dans les deux cas**.
 * C'est ce qui en fait le marqueur, et non `datedeb` ni `action=result` :
 * ceux-là, un formulaire de recherche les porte aussi, puisqu'il les pose.
 * S'y fier aurait laissé passer Valloire.
 *
 * `fiche_liste` complète le compte pour un cas qui n'est pas une page : un
 * extrait de fiches, comme le gabarit des tests. Une suite de fiches vient
 * forcément d'une page de résultats, et n'a pas à être refusée parce qu'on
 * l'a découpée.
 */
export function estPageResultat(page: string): boolean {
  return /nb_result|critere|fiche_liste/.test(page);
}

/**
 * Le nombre de résultats que la centrale annonce, `nb-resultats`.
 *
 * La première page n'en montre qu'une partie, et le reste arrive par
 * défilement. Relevé du 25 septembre 2026, pour la semaine du 6 au
 * 13 février 2027 : Arêches-Beaufort en annonce 37 et en montre 10 à huit
 * personnes, Risoul 11 pour 10, Valloire 359 pour 10 à quatre personnes ; les
 * Contamines, 9 pour 9, ne portent pas de suite.
 */
export function resultatsAnnonces(page: string): number | null {
  const m = /class="nb-resultats"[^>]*>\s*<span>(\d+)<\/span>/.exec(page);
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * Le lien « Plus de résultats » que le défilement infini suit, `#lasuite a`.
 *
 * C'est la page elle-même qui le désigne à son script (`nextSelector :
 * '#lasuite a'`). Il ne porte ni les dates ni le groupe : la centrale les
 * retient dans la session ouverte par la première page.
 *
 * **La session n'est pas un détail.** Relevé du 25 septembre 2026 à
 * Arêches-Beaufort, huit personnes : la page 2 demandée avec le cookie de la
 * page 1 rend dix fiches neuves, et la page 2 demandée sans cookie, sur
 * l'URL complète suivie de `&page=2`, en rend dix aussi — mais pas les
 * mêmes : trois en commun seulement, aux mêmes prix. Sans la session, la
 * page 2 est celle d'un autre classement que la page 1, et suivre la liste
 * ainsi donnerait des doublons et des trous.
 */
export function pageSuivanteIngenie(page: string): string | null {
  const m = /id="lasuite"[^>]*>\s*<a[^>]+href="([^"]+)"/.exec(page);
  return m ? desechapper(m[1] ?? "") : null;
}

/**
 * Les cookies d'une session, mis à jour par ceux qu'une réponse vient de poser.
 *
 * Chaque page de la suite repose des cookies (relevé du 25 septembre 2026 :
 * la page 2 d'Arêches en pose, comme la page 1). Remplacer toute la chaîne
 * par la dernière réponse perdrait un cookie qu'elle n'a pas reposé — celui
 * de la session, par exemple —, et la page d'après viendrait d'un autre
 * classement. On fusionne donc par nom : le plus récent l'emporte, les
 * autres restent.
 */
export function fusionnerCookies(avant: string, apres: string): string {
  const par = new Map<string, string>();
  for (const chaine of [avant, apres]) {
    for (const morceau of chaine.split(";")) {
      const paire = morceau.trim();
      const egal = paire.indexOf("=");
      if (egal <= 0) continue;
      par.set(paire.slice(0, egal), paire);
    }
  }
  return [...par.values()].join("; ");
}

export function fragmentsIngenie(page: string): string[] {
  const debuts: number[] = [];
  // Pas de frontière de mot avant `fiche_liste` : `www.chatelreservation.com`
  // nomme ses fiches `RESA_fiche_liste_appartement_chalet_prestation`, et entre
  // le tiret bas et le `f` il n'y a pas de frontière — les deux sont des
  // caractères de mot. La règle rendait donc zéro fragment sur une page qui en
  // portait vingt, et quatre-vingt-cinq logements se perdaient là.
  const re = /class="[^"]*fiche_liste[^"]*"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(page)) !== null) debuts.push(m.index);
  return debuts.map((d, i) => page.slice(d, i + 1 < debuts.length ? debuts[i + 1] : finDeListe(page, d)));
}

/**
 * Où s'arrête la dernière fiche : à la pagination, sinon au bout de la page.
 *
 * Elle courait jusqu'au pied de page. Rien n'y trompait le prix, mais la
 * capacité se lit maintenant sur « N personnes » affiché, et un formulaire de
 * recherche en pied de page en affiche une liste entière. Le bloc
 * `pagination` et le lien `#lasuite` du défilement suivent la dernière fiche
 * sur les trois gabarits relevés le 20 septembre 2026.
 */
function finDeListe(page: string, depuis: number): number {
  const bornes = ['class="pagination"', 'id="lasuite"']
    .map((marque) => page.indexOf(marque, depuis))
    .filter((i) => i > depuis);
  return bornes.length > 0 ? Math.min(...bornes) : page.length;
}

function titreDe(fragment: string): string {
  // `itemprop="name"` est le plus fiable : les deux gabarits connus le portent.
  const nom = /itemprop="name"[^>]*>([\s\S]{0,220}?)</.exec(fragment);
  const t1 = nom ? texteIngenie(nom[1] ?? "") : "";
  if (t1) return t1;
  const lien = /class="[^"]*ga4-fiche-link[^"]*"[^>]*>([\s\S]{0,220}?)<\/a>/.exec(fragment);
  const t2 = lien ? texteIngenie(lien[1] ?? "") : "";
  if (t2) return t2;
  // Arêches, Châtel, Valloire : le nom vit dans `div.nom > h2`, derrière un
  // lien commenté. Sans cette lecture, le titre était le texte d'une photo.
  const h2 = /class="nom"[^>]*>\s*<h2[^>]*>([\s\S]{0,600}?)<\/h2>/.exec(fragment);
  const t3 = h2 ? texteIngenie(h2[1] ?? "") : "";
  if (t3) return t3;
  const alt = /<img[^>]+alt="([^"]{2,120})"/.exec(fragment);
  return alt ? desechapper(alt[1] ?? "").trim() : "";
}

/** Un point en France métropolitaine et ses marges, comme pour les autres moteurs. */
function pointFrance(lat: number, lon: number): { lat: number | null; lon: number | null } {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { lat: null, lon: null };
  if (lat < 41 || lat > 52 || lon < -6 || lon > 10) return { lat: null, lon: null };
  return { lat, lon };
}

/** Une coordonnée écrite en chaîne ou en nombre. La chaîne vide n'en est pas une. */
function coordonnee(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim()) return Number(v.trim().replace(",", "."));
  return NaN;
}

type LieuIngenie = { lat: number | null; lon: number | null; adresse: string | null; commune: string | null };

/** Ce qu'on lit du bloc JSON-LD d'une fiche : `location`, et rien du loueur. */
type BlocLd = {
  location?: {
    geo?: { latitude?: unknown; longitude?: unknown } | null;
    address?: Record<string, unknown> | null;
  } | null;
};

/**
 * Le lieu du logement, lu dans le JSON-LD que la fiche porte.
 *
 * `location` est le logement ; `name`, `telephone` et `email` sont le loueur.
 * On ne prend donc que `location`. Si le bloc ne se lit pas en JSON — un
 * retour chariot brut dans une description suffit —, le point se lit encore
 * par motif, dans ce bloc-là et nulle part ailleurs.
 */
export function lieuIngenie(fragment: string): LieuIngenie {
  const vide: LieuIngenie = { lat: null, lon: null, adresse: null, commune: null };
  for (const m of fragment.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    const brut = m[1] ?? "";
    let bloc: BlocLd | null;
    try {
      bloc = JSON.parse(brut) as BlocLd | null;
    } catch {
      const g = /"geo"\s*:\s*\{\s*"latitude"\s*:\s*"(-?\d+(?:\.\d+)?)"\s*,\s*"longitude"\s*:\s*"(-?\d+(?:\.\d+)?)"/.exec(brut);
      if (g) return { ...vide, ...pointFrance(Number(g[1]), Number(g[2])) };
      continue;
    }
    const lieu = bloc?.location ?? null;
    if (!lieu) continue;
    const point = pointFrance(coordonnee(lieu.geo?.latitude), coordonnee(lieu.geo?.longitude));
    const a = lieu.address ?? {};
    const rue = typeof a.streetAddress === "string" ? a.streetAddress.replace(/[\s,]+$/, "").trim() : "";
    const ville = typeof a.addressLocality === "string" ? a.addressLocality.trim() : "";
    return { ...point, adresse: rue || null, commune: ville || null };
  }
  return vide;
}

/**
 * « N personnes », « N chambres », « N pièces » : un élément dont c'est tout le
 * texte, ou le couple `quantite` / `libelle` que certains gabarits emploient.
 *
 * Un titre qui contient « 8 personnes » ne passe pas ici — il a son propre
 * recours —, ni une description, ni le texte d'une photo : le chevron
 * ouvrant doit précéder le nombre. Les scripts sont ôtés d'abord : le widget
 * de disponibilité y répète le nombre de voyageurs **demandé**.
 */
const AFFICHE_PERSONNES = />\s*(\d{1,2})\s*(?:<\/span>\s*<span[^>]*>\s*)?personnes?\s*</i;
const AFFICHE_CHAMBRES = />\s*(\d{1,2})\s*(?:<\/span>\s*<span[^>]*>\s*)?chambres?(?:\(s\))?\s*</i;
const AFFICHE_PIECES = />\s*(\d{1,2})\s*(?:<\/span>\s*<span[^>]*>\s*)?pi(?:è|&egrave;|&#232;)ces?(?:\(s\))?\s*</i;

function affiche(sansScript: string, motif: RegExp, min: number): number | null {
  const m = motif.exec(sansScript);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n >= min && n <= 50 ? n : null;
}

export function occupationAfficheeIngenie(fragment: string): {
  capacite: number | null;
  chambres: number | null;
  pieces: number | null;
} {
  const sans = fragment.replace(/<script\b[\s\S]*?<\/script>/gi, " ");
  return {
    capacite: affiche(sans, AFFICHE_PERSONNES, 1),
    chambres: affiche(sans, AFFICHE_CHAMBRES, 0),
    pieces: affiche(sans, AFFICHE_PIECES, 1),
  };
}

function photoDe(fragment: string): string | null {
  const m = /<img[^>]+(?:src|data-src)="(https?:\/\/[^"]+)"/.exec(fragment);
  return m?.[1] ?? null;
}

/** Le bloc de tarif : le montant lu, et le montant tel qu'il est écrit. */
type TarifIngenie = { total: number; montant: string | null };

/**
 * Lit le bloc de tarif.
 *
 * `null` quand il n'y en a pas : sans dates la page n'en porte aucun, et c'est
 * ainsi que la centrale dit qu'elle ne vend pas cette fiche à ces dates-là.
 *
 * Un zéro n'est pas un prix — plusieurs centrales affichent « à partir de 0 € »
 * pour un logement dont elles n'ont pas le tarif — mais ce n'est pas non plus
 * une raison de supprimer l'annonce : le total vaut alors zéro, ce qui se lit
 * « listée sans prix » partout ailleurs dans le dépôt, et l'écran sait le dire.
 */
function tarifDe(fragment: string): TarifIngenie | null {
  const m = /class="prix_en_cours"[^>]*>([\s\S]{0,160}?)<\/div>/.exec(fragment);
  if (!m) return null;
  // Le texte est décodé d'abord : certaines centrales écrivent la monnaie en
  // entité, « 700 &euro; », et couper sur le signe littéral les manquerait.
  // Le montant peut porter une virgule décimale et des espaces de groupement,
  // ici écrites en échappement pour rester visibles dans le source.
  const texte = texteIngenie(m[1] ?? "");
  const montant = texte || null;
  const p = /([0-9][0-9\u00a0\u202f .]*)(?:,(\d{1,2}))?\s*\u20ac/.exec(texte);
  if (!p) return { total: 0, montant };
  const entiere = (p[1] ?? "").replace(/\D/g, "");
  if (!entiere) return { total: 0, montant };
  const v = Number(`${entiere}.${(p[2] ?? "0").padEnd(2, "0")}`);
  return { total: Number.isFinite(v) && v > 0 ? v : 0, montant };
}

/**
 * Lit une page de résultats.
 *
 * Une fiche **sans bloc de tarif** n'est pas rendue : la centrale la connaît,
 * mais elle ne la vend pas à ces dates-là. Sans dates, la page n'en porte
 * aucun, et c'est ainsi qu'on sait que ces prix sont datés. Une fiche dont le
 * bloc est là mais dit « à partir de 0 € » sort, elle, avec un total de zéro :
 * la centrale la liste sans en publier le tarif, et c'est un renseignement.
 */
export function lireIngenie(page: string): FicheIngenie[] {
  const par = new Map<string, FicheIngenie>();
  for (const fragment of fragmentsIngenie(page)) {
    const tarif = tarifDe(fragment);
    if (tarif == null) continue;
    const ident =
      /id="(PRESTATION-[^"]+)"/.exec(fragment)?.[1] ??
      /data-ga-item-id="([^"]+)"/.exec(fragment)?.[1] ??
      null;
    if (!ident) continue;
    const titre = titreDe(fragment);
    if (!titre) continue;
    // Une fiche paraît parfois deux fois dans la même page : le moins cher
    // l'emporte. Zéro n'est pas moins cher, c'est l'absence de prix.
    const deja = par.get(ident);
    if (deja && !(tarif.total > 0 && (deja.total <= 0 || tarif.total < deja.total))) continue;
    const etiq = /class="libelle_a_partir_de"[^>]*>([\s\S]{0,80}?)<\/div>/.exec(fragment);
    // Ce que le prix couvre, écrit à sa droite : « pour la location ». Publié
    // par les deux gabarits connus, et lu par aucun des deux jusqu'ici.
    const nat = /class="nature_prix_en_cours"[^>]*>([\s\S]{0,80}?)<\/div>/.exec(fragment);
    const lien = /class="lien_plus_info_resa[^"]*"\s*>\s*<a[^>]+href="([^"]+)"/.exec(fragment);
    const etiquette = etiq ? texteIngenie(etiq[1] ?? "") || null : null;
    const nature = nat ? texteIngenie(nat[1] ?? "") || null : null;
    par.set(ident, {
      id: ident,
      titre,
      total: tarif.total,
      etiquette,
      // Les trois morceaux du bloc, dans l'ordre où la centrale les écrit :
      // c'est sa phrase, pas la nôtre.
      libelle: [etiquette, tarif.montant, nature].filter(Boolean).join(" ") || null,
      photo: photoDe(fragment),
      chemin: lien ? desechapper(lien[1] ?? "") : null,
      ...lieuIngenie(fragment),
      ...occupationAfficheeIngenie(fragment),
    });
  }
  return [...par.values()];
}

/** Pages lues au plus, première comprise : cent fiches, à dix par page. */
export const PAGES_MAX_INGENIE = 10;

/**
 * Au moins une seconde entre deux pages d'un même hôte, comptée depuis la fin
 * de la précédente. La centrale n'en fixe aucune : c'est notre politesse.
 */
export const PAUSE_PAGE_INGENIE_MS = 1_000;

/**
 * En deçà de ce qui reste avant l'échéance, aucun appel ne part : sa réponse
 * n'aurait pas le temps d'arriver.
 */
export const APPEL_MIN_INGENIE_MS = 3_000;

/** Une page lue, l'adresse qui l'a rendue, et les cookies qu'elle a posés. */
export type PageIngenie = { url: string; texte: string; cookies: string };

/**
 * Ce que la suite demande au dehors : `lire` est l'appel réseau, qui lève sur
 * un refus, une panne ou un délai ; `maintenant` et `attendre` sont
 * l'horloge. Les tests les remplacent, et la boucle se mène sans réseau.
 */
export type OutilsSuiteIngenie = {
  lire: (url: string, cookies: string, referer: string) => Promise<PageIngenie>;
  maintenant: () => number;
  attendre: (ms: number) => Promise<void>;
};

export type SuiteIngenie = {
  /** Les fiches neuves des pages suivantes, dans l'ordre de la centrale. */
  fiches: FicheIngenie[];
  /** Pourquoi la suite s'est arrêtée. */
  arret: "fin de liste" | "compte atteint" | "rien de neuf" | "pages max" | "échéance" | "échec";
  /** La page où elle s'est arrêtée : non demandée, en échec, ou sans rien de neuf. */
  page: number;
  /** Le message de l'échec, quand c'en est un. */
  erreur: string | null;
};

/**
 * Les pages suivantes, comme le défilement de la centrale les demande.
 *
 * On suit `#lasuite a` depuis la première page, une page à la fois, une
 * seconde au moins entre deux. Les cookies de la session sont fusionnés page
 * après page ; la première page reste le `Referer`, et c'est contre elle que
 * le lien se lit : le défilement ne la quitte pas.
 *
 * On s'arrête dès que le compte annoncé est atteint, que la centrale ne
 * propose plus de suite, qu'une page n'apporte aucune fiche neuve, que
 * `PAGES_MAX_INGENIE` pages sont lues, ou que l'échéance approche.
 * L'échéance est celle de toute la recherche, comptée dès son entrée : la
 * première page et ce qui l'a précédée ont déjà pris leur part.
 *
 * **Ce qui a été lu est gardé.** Une page en échec — un refus (429, 403…),
 * une panne, un délai — arrête la suite sans reprise, et les fiches des pages
 * précédentes restent. Cette fonction ne lève donc pas.
 */
export async function pagesSuivantesIngenie(
  premiere: PageIngenie,
  deja: Iterable<string>,
  echeance: number,
  o: OutilsSuiteIngenie,
): Promise<SuiteIngenie> {
  const annonce = resultatsAnnonces(premiere.texte);
  const vues = new Set(deja);
  const fiches: FicheIngenie[] = [];
  const arret = (
    motif: SuiteIngenie["arret"],
    page: number,
    erreur: string | null = null,
  ): SuiteIngenie => ({ fiches, arret: motif, page, erreur });
  let courante = premiere;
  let cookies = premiere.cookies;
  for (let n = 2; ; n += 1) {
    if (annonce != null && vues.size >= annonce) return arret("compte atteint", n);
    const lien = pageSuivanteIngenie(courante.texte);
    if (!lien) return arret("fin de liste", n);
    if (n > PAGES_MAX_INGENIE) return arret("pages max", n);
    // La pause compte : la page doit encore avoir son temps une fois attendue.
    const reste = echeance - o.maintenant();
    if (reste < PAUSE_PAGE_INGENIE_MS + APPEL_MIN_INGENIE_MS) return arret("échéance", n);
    await o.attendre(PAUSE_PAGE_INGENIE_MS);
    let suivante: PageIngenie;
    try {
      suivante = await o.lire(new URL(lien, premiere.url).toString(), cookies, premiere.url);
    } catch (err) {
      return arret("échec", n, err instanceof Error ? err.message : String(err));
    }
    const neuves = lireIngenie(suivante.texte).filter((f) => !vues.has(f.id));
    if (neuves.length === 0) return arret("rien de neuf", n);
    for (const f of neuves) vues.add(f.id);
    fiches.push(...neuves);
    // Fusionnés par nom : une page qui ne repose qu'une partie des cookies ne
    // doit pas faire perdre la session.
    cookies = fusionnerCookies(cookies, suivante.cookies);
    courante = suivante;
  }
}
