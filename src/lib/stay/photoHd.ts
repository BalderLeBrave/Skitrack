/**
 * La taille d'une photo d'annonce à l'affichage : la plus grande que la
 * plateforme publie pour la visionneuse, une légère pour le ruban de
 * vignettes. Seule l'adresse change ; la photo est celle du relevé.
 *
 * Une règle par hôte, éprouvée le 6 oct. 2026 sur des adresses réelles
 * (inventaire de la phase 0 et `photoHd.test.ts`). Une adresse inconnue est
 * rendue telle quelle. Si la grande taille ne se charge pas, la visionneuse
 * revient à l'adresse relevée (`useGalerie`).
 *
 * Deux hôtes agrandissent sans limite ce qu'on leur demande : Airbnb
 * (`im_w=2560` rend 2 560 px quel que soit l'original) et imgix chez OVO
 * (`w=6000` rend 6 000 px). Une image agrandie n'a pas plus de détail : chez
 * Airbnb on s'arrête à la taille que sert l'adresse sans paramètre (1 200 px),
 * chez imgix `fit=max` interdit l'agrandissement.
 */

/** Une photo prête pour `<img>` : l'adresse, et les tailles quand la
 *  plateforme en publie plusieurs à largeur connue. */
export type TaillesPhoto = { src: string; srcset: string | null };

/** Largeur que sert Airbnb à l'adresse sans paramètre `im_w`. */
const AIRBNB_MAX = 1200;
/** Largeur la plus grande demandée à imgix (OVO), sans agrandissement. */
const IMGIX_MAX = 2400;

function lire(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function avecParams(u: URL, params: Record<string, string>, garder = false): string {
  const v = new URL(u.toString());
  if (!garder) v.search = "";
  for (const [k, val] of Object.entries(params)) v.searchParams.set(k, val);
  return v.toString();
}

function sansParams(u: URL): string {
  const v = new URL(u.toString());
  v.search = "";
  return v.toString();
}

const AIRBNB = /(^|\.)muscache\.com$/;
const BOOKING = /(^|\.)bstatic\.com$/;
const BOOKING_TAILLE = /(\/xdata\/images\/hotel\/)(?:max\d+(?:x\d+)?|square\d+)(\/)/;
const VRBO = /^(media\.vrbo\.com|images\.trvl-media\.com)$/;
const IMGIX_OVO = /^ovo-img\.imgix\.net$/;
const MAEVA = /^static\d*\.maeva\.com$/;
const GITES = /^(www\.)?gites-de-france\.com$/;
const GITES_STYLE = /\/sites\/default\/files\/styles\/[^/]+\/public\//;
// Ingénie : un hôte par station (reservation.legrandbornand.com, risoul.com…),
// un même chemin de tailles.
const INGENIE_TAILLE = /(\/medias\/images\/prestations\/)multitailles\/\d+x\d+_/;
const MSEM = /^images\.msem\.tech$/;
const MSEM_TAILLE = /-(?:small|medium|large)(\.[a-z]+)$/i;
const SKIPLANET = /^docs\.ski-planet\.com$/;
const SKIPLANET_TAILLE = /\/photo\/([^/]+)\/(?:small|medium|large)\//;
const MV = /^(www\.)?madamevacances\.com$/;
const MV_TAILLE = /(\/photos\/etab(?:_room)?\/\d+\/)\d+x\d+(\/)/;
const LOCVACANCES = /(^|\.)locvacances\.com$/;
// Travelski : quatre tailles par photo, S (320), M (640), L et O (800 px, la plus grande).
const TRAVELSKI = /^d1wek41qnoimq7\.cloudfront\.net$/;
const TRAVELSKI_TAILLE = /(\/product\/\d+\/[^/]+\/)[SMLO](\/)/;
const LOCVACANCES_VIGNETTE = /(\/lv\/images\/lot\/[^/?]+?)_s(\.[a-z]+)$/i;

/** L'adresse de la plus grande taille publiée. */
export function photoGrande(url: string): string {
  const u = lire(url);
  if (!u) return url;
  const h = u.hostname;
  if (AIRBNB.test(h) && u.pathname.startsWith("/im/")) return avecParams(u, { im_w: String(AIRBNB_MAX) });
  if (BOOKING.test(h) && BOOKING_TAILLE.test(u.pathname)) {
    const v = new URL(url);
    v.pathname = u.pathname.replace(BOOKING_TAILLE, "$1max3000$2");
    return v.toString();
  }
  if (VRBO.test(h)) return sansParams(u);
  if (IMGIX_OVO.test(h)) return avecParams(u, { auto: "format", fit: "max", q: "75", w: String(IMGIX_MAX) });
  if (MAEVA.test(h)) return sansParams(u);
  if (GITES.test(h) && GITES_STYLE.test(u.pathname)) {
    return sansParams(Object.assign(new URL(url), { pathname: u.pathname.replace(GITES_STYLE, "/sites/default/files/") }));
  }
  if (INGENIE_TAILLE.test(u.pathname)) {
    return Object.assign(new URL(url), { pathname: u.pathname.replace(INGENIE_TAILLE, "$1") }).toString();
  }
  if (MSEM.test(h) && MSEM_TAILLE.test(u.pathname)) {
    return Object.assign(new URL(url), { pathname: u.pathname.replace(MSEM_TAILLE, "$1") }).toString();
  }
  if (SKIPLANET.test(h) && SKIPLANET_TAILLE.test(u.pathname)) {
    return Object.assign(new URL(url), { pathname: u.pathname.replace(SKIPLANET_TAILLE, "/photo/$1/large/") }).toString();
  }
  if (MV.test(h) && MV_TAILLE.test(u.pathname)) {
    return Object.assign(new URL(url), { pathname: u.pathname.replace(MV_TAILLE, "$11000x1000$2") }).toString();
  }
  if (LOCVACANCES.test(h) && LOCVACANCES_VIGNETTE.test(u.pathname)) {
    return Object.assign(new URL(url), { pathname: u.pathname.replace(LOCVACANCES_VIGNETTE, "$1$2") }).toString();
  }
  return url;
}

/** L'adresse d'une taille légère, pour le ruban de vignettes. */
export function photoVignette(url: string): string {
  const u = lire(url);
  if (!u) return url;
  const h = u.hostname;
  if (AIRBNB.test(h) && u.pathname.startsWith("/im/")) return avecParams(u, { im_w: "240" });
  if (BOOKING.test(h) && BOOKING_TAILLE.test(u.pathname)) {
    return Object.assign(new URL(url), { pathname: u.pathname.replace(BOOKING_TAILLE, "$1max300$2") }).toString();
  }
  if (IMGIX_OVO.test(h)) return avecParams(u, { auto: "format", fit: "crop", q: "60", w: "240", h: "160" });
  if (MAEVA.test(h)) return avecParams(u, { w: "240", h: "160", crop: "1", nw: "1" });
  if (INGENIE_TAILLE.test(u.pathname)) {
    return Object.assign(new URL(url), { pathname: u.pathname.replace(INGENIE_TAILLE, "$1multitailles/320x240_") }).toString();
  }
  if (SKIPLANET.test(h) && SKIPLANET_TAILLE.test(u.pathname)) {
    return Object.assign(new URL(url), { pathname: u.pathname.replace(SKIPLANET_TAILLE, "/photo/$1/small/") }).toString();
  }
  if (MV.test(h) && MV_TAILLE.test(u.pathname)) {
    return Object.assign(new URL(url), { pathname: u.pathname.replace(MV_TAILLE, "$1160x90$2") }).toString();
  }
  if (LOCVACANCES.test(h) && /\/lv\/images\/lot\//.test(u.pathname) && !LOCVACANCES_VIGNETTE.test(u.pathname)) {
    return Object.assign(new URL(url), { pathname: u.pathname.replace(/(\.[a-z]+)$/i, "_s$1") }).toString();
  }
  if (TRAVELSKI.test(h) && TRAVELSKI_TAILLE.test(u.pathname)) {
    return Object.assign(new URL(url), { pathname: u.pathname.replace(TRAVELSKI_TAILLE, "$1S$2") }).toString();
  }
  // Les autres servent déjà une vignette légère (Abritel, MSEM « medium »,
  // Gîtes de France), ou une seule taille.
  return url;
}

/**
 * La grande photo, avec ses tailles intermédiaires quand la plateforme les
 * publie à largeur connue : le navigateur prend celle qu'il faut pour
 * l'écran. Sinon, la grande seule.
 */
export function photoTailles(url: string): TaillesPhoto {
  const src = photoGrande(url);
  const u = lire(url);
  if (!u) return { src, srcset: null };
  const h = u.hostname;
  if (AIRBNB.test(h) && u.pathname.startsWith("/im/")) {
    return { src, srcset: [720, AIRBNB_MAX].map((w) => `${avecParams(u, { im_w: String(w) })} ${w}w`).join(", ") };
  }
  if (IMGIX_OVO.test(h)) {
    return {
      src,
      srcset: [800, 1200, 1600, IMGIX_MAX]
        .map((w) => `${avecParams(u, { auto: "format", fit: "max", q: "75", w: String(w) })} ${w}w`)
        .join(", "),
    };
  }
  return { src, srcset: null };
}
