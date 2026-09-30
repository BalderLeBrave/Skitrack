/**
 * L'aperçu d'une webcam : la dernière image publiée par l'exploitant, affichée
 * avant son lecteur.
 *
 * Le lecteur d'un fournisseur (panorama Skaping, lecteur Webcam-HD) pèse
 * plusieurs mégaoctets et met plusieurs secondes à s'afficher ; sa dernière
 * image en pèse quelques centaines de kilo-octets. La fiche montre d'abord
 * l'image, et ne charge le lecteur qu'à la demande.
 *
 * - **Skaping** publie l'adresse de sa dernière image dans la page de la
 *   caméra (`og:image`) ; elle change à chaque prise de vue et porte sa date :
 *   `…/2026/09/30/large/14-50.jpg`.
 * - **Webcam-HD** range ses caméras par groupe
 *   (`smr/json/webcam_display_group/<groupe>.json`) ; chacune y a une clé
 *   d'image (`webcam_display_str_image`), dont la dernière vue est
 *   `www.trinum.com/ibox/ftpcam/<clé>.jpg`, l'adresse que lit leur lecteur.
 *
 * Les autres fournisseurs n'ont pas d'aperçu : leur lecteur s'affiche comme
 * avant.
 */

export type Apercu = {
  /** L'adresse de la dernière image, ou `null` si elle n'a pas pu être lue. */
  image: string | null;
  /** L'heure de la prise de vue quand l'adresse la porte (Skaping), en heure locale de la station. */
  prise: { jour: string; heure: string } | null;
};

/** Le fournisseur dont on sait lire l'aperçu, d'après l'adresse du lecteur. */
export function fournisseurApercu(url: string): "skaping" | "webcam-hd" | null {
  if (/^https:\/\/(www\.)?skaping\.com\//.test(url)) return "skaping";
  if (/^https:\/\/app\.webcam-hd\.com\/[^/]+\/[^/]+/.test(url)) return "webcam-hd";
  return null;
}

/** L'image d'une page Skaping : son `og:image`. */
export function imageSkaping(html: string): string | null {
  const m =
    html.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  const url = m?.[1]?.trim();
  return url && /^https:\/\/[^\s]+\.(jpe?g|webp|png)(\?.*)?$/i.test(url) ? url : null;
}

/** La date d'une image Skaping, lue dans son adresse : `…/2026/09/30/large/14-50.jpg`. */
export function priseSkaping(image: string): Apercu["prise"] {
  const m = image.match(/\/(\d{4})\/(\d{2})\/(\d{2})\/[a-z]+\/(\d{2})-(\d{2})\.jpe?g/i);
  if (!m) return null;
  return { jour: `${m[1]}-${m[2]}-${m[3]}`, heure: `${m[4]}:${m[5]}` };
}

/** Le groupe et la caméra d'une adresse Webcam-HD : `app.webcam-hd.com/<groupe>/<camera>`. */
export function cameraWebcamHd(url: string): { groupe: string; camera: string } | null {
  const m = url.match(/^https:\/\/app\.webcam-hd\.com\/([^/?#]+)\/([^/?#]+)/);
  return m ? { groupe: m[1]!, camera: m[2]! } : null;
}

/** L'image d'une caméra Webcam-HD, d'après le fichier de son groupe. */
export function imageWebcamHd(groupe: unknown, camera: string): string | null {
  if (!Array.isArray(groupe)) return null;
  const c = groupe.find(
    (x): x is { url_part_2: string; webcam_display_str_image: string } =>
      !!x && typeof x === "object" && (x as { url_part_2?: unknown }).url_part_2 === camera,
  );
  const cle = c?.webcam_display_str_image;
  return typeof cle === "string" && /^[\w-]+$/.test(cle) ? `https://www.trinum.com/ibox/ftpcam/${cle}.jpg` : null;
}
