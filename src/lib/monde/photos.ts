/**
 * Les photos de domaine : l'adresse relevée d'un côté, la vignette de l'autre.
 *
 * ## Deux choses distinctes, et c'est voulu
 *
 * `photosDomaines.json` porte **l'adresse que Skiinfo publie**, sans retouche :
 * c'est un relevé, et un relevé ne transforme pas. La mise à la taille de
 * l'écran est une décision d'affichage, elle vit ici.
 *
 * Mélanger les deux coûterait cher au prochain relevé : une adresse enregistrée
 * déjà réduite à 640 px ne pourrait plus servir une fiche pleine largeur.
 *
 * ## Ce que pèse une photo, mesuré
 *
 * La même image d'Aprica, le 21 septembre 2026, chez `cdn.bfldr.com` :
 *
 * | Demande | Poids |
 * | --- | ---: |
 * | `format=png` — ce que le site publie | 2 157 ko |
 * | `format=webp` | 312 ko |
 * | `format=webp&width=640` | 61 ko |
 * | `format=webp&width=400&height=300&fit=crop` | 29 ko |
 *
 * Servir l'adresse publiée telle quelle dans une liste de cent lignes ferait
 * deux cents mégaoctets. `vignette()` demande donc du WebP à la largeur utile.
 *
 * ## Là où on ne transforme pas
 *
 * Cinquante-deux photos sont sur `img1` à `img5.onthesnow.com`, dont on ne
 * sait pas s'ils acceptent des paramètres — et qui, au contrôle du
 * 21 septembre 2026, **ne répondaient pas du tout** : le chemin `/image/…`
 * reste sans réponse jusqu'au délai, en HTTPS comme en HTTP, alors que la
 * racine du même hôte rend un 404 normal.
 *
 * Ces photos portent `servi: false` dans le relevé, et `photoDuDomaine()` les
 * écarte : une absence assumée vaut mieux qu'une image cassée. L'adresse reste
 * écrite dans le fichier — c'est ce que le site publie — pour qu'un prochain
 * contrôle puisse la reprendre si l'hôte revient.
 */

export type PhotoDomaine = {
  /** Le slug Skiinfo d'où vient l'adresse, pour qu'un doute se vérifie. */
  cle: string;
  nom: string | null;
  /** Distance entre le domaine et la fiche, en kilomètres. */
  km: number;
  /** L'adresse publiée, sans retouche. */
  url: string;
  /** L'hôte a-t-il répondu au dernier contrôle ? */
  servi: boolean;
};

export type RelevePhotos = {
  calcule: string;
  quoi: string;
  regle: string;
  rayonKm: number;
  releve: string;
  domaines: number;
  rattaches: number;
  servis: number;
  nonServis: number;
  avertissement: string;
  photos: Record<string, PhotoDomaine>;
};

let enCours: Promise<RelevePhotos> | null = null;

/** Le relevé, chargé à la demande : un écran sans photo n'en paie pas le poids. */
export function relevePhotos(): Promise<RelevePhotos> {
  enCours ??= import("./data/photosDomaines.json", { with: { type: "json" } }).then(
    (m) => m.default as RelevePhotos,
  );
  return enCours;
}

/** Les hôtes dont on a vérifié qu'ils acceptent les paramètres de taille. */
const TRANSFORME = new Set(["cdn.bfldr.com"]);

/**
 * L'adresse à mettre dans un `src`, à la largeur voulue.
 *
 * Sur un hôte dont on n'a pas vérifié les paramètres, l'adresse sort
 * **inchangée** : inventer une transformation qu'il ignore rendrait au mieux
 * l'image entière, au pire une erreur.
 */
export function vignette(url: string, largeurPx: number): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  if (!TRANSFORME.has(u.host)) return url;
  u.searchParams.set("format", "webp");
  u.searchParams.set("width", String(Math.round(largeurPx)));
  // `auto=webp` est ce que le site demande lui-même ; on le garde pour ne pas
  // sortir du vocabulaire qu'il emploie.
  u.searchParams.set("auto", "webp");
  return u.toString();
}

/**
 * La photo d'un domaine, ou `null`.
 *
 * `null` couvre deux cas qu'il ne faut pas confondre à la lecture du code —
 * aucun rattachement, et un rattachement vers un hôte muet — mais qui se
 * disent de la même façon à l'écran : il n'y a pas de photo à montrer.
 */
export function photoDuDomaine(
  releve: RelevePhotos,
  id: string,
  largeurPx = 400,
): { src: string; source: PhotoDomaine } | null {
  const p = releve.photos[id];
  if (!p || !p.servi) return null;
  return { src: vignette(p.url, largeurPx), source: p };
}

/** Ce qu'on écrit sous une photo : d'où elle vient, et à quelle distance. */
export function mentionPhoto(p: PhotoDomaine): string {
  const d = p.km < 0.1 ? "au même point" : `à ${p.km.toFixed(1).replace(".", ",")} km`;
  return `Photo Skiinfo — fiche « ${p.nom ?? p.cle} », ${d}`;
}
