/**
 * Le nom de l'annonce, pas le nom d'un fichier photo.
 *
 * Les centrales Ingénie (Les 2 Alpes) n'écrivent pas `itemprop="name"`
 * sur la tuile : le collecteur retombait sur l'`alt` de l'image, souvent
 * `_clients_…_photos_…`. Le nom véritable est le texte du lien, l'`h1`
 * de la fiche, ou à défaut le slug de l'URL.
 */

export function titreEstFichier(t: string | null | undefined): boolean {
  const s = (t ?? "").trim();
  if (!s) return true;
  if (/_clients_/i.test(s)) return true;
  if (/photos_[a-z0-9]+_\d+/i.test(s)) return true;
  if (/\.(jpe?g|png|webp|gif)(?:\b|$)/i.test(s)) return true;
  if (/^img[-_]/i.test(s) && !/\s/.test(s)) return true;
  // Un nom réel a des mots. Un fichier n'en a pas, et porte un numéro long.
  if (!/\s/.test(s) && /\d{4,}/.test(s)) return true;
  return false;
}

function decoder(s: string): string {
  return s
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&deg;|&#176;/gi, "°")
    .replace(/&/gi, "&")
    .replace(/"/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^-->/, "")
    .trim();
}

/** Ce qu'une page a publié comme nom, une fois les commentaires et entités ôtés. */
export function titrePublie(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let t = decoder(raw);
  if (t.length < 4 || t.length > 160) return null;
  if (/r[eé]sultat de ma recherche|^accueil$|^r[eé]servation$/i.test(t)) return null;
  if (titreEstFichier(t)) return null;
  const tete = t.split(/\s+[–—-]\s+/)[0]?.trim() ?? t;
  if (tete.length >= 4 && !titreEstFichier(tete)) t = tete;
  return t;
}

/** Le slug de la fiche, en mots, quand le titre actuel est un fichier. */
export function titreDepuisUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const last = (u.pathname.split("/").filter(Boolean).pop() ?? "").replace(/\.html?$/i, "");
    if (!last || /^(booking|resa|index|fiche|result)$/i.test(last)) return null;
    const mots = last.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
    if (mots.length < 8) return null;
    if (titreEstFichier(mots)) return null;
    return mots;
  } catch {
    return null;
  }
}
