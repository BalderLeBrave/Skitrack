/**
 * La lecture des aperçus de webcam chez l'exploitant (voir `webcamApercu.ts`).
 *
 * Une requête par caméra et par prise de vue au plus : l'aperçu d'une caméra
 * Skaping est gardé cinq minutes (une prise de vue toutes les dix environ), le
 * fichier d'un groupe Webcam-HD une journée (l'adresse de l'image ne change
 * pas, son contenu si). Deux fiches qui demandent la même caméra en même temps
 * partagent la requête.
 */

import { UA_NAVIGATEUR } from "./scrape/navigateur";
import {
  cameraWebcamHd,
  fournisseurApercu,
  imageSkaping,
  imageWebcamHd,
  priseSkaping,
  type Apercu,
} from "./webcamApercu";

const DELAI_MS = 8_000;
const DUREE_SKAPING_MS = 5 * 60_000;
const DUREE_GROUPE_MS = 24 * 3_600_000;

const cache = new Map<string, { fin: number; valeur: Promise<unknown> }>();

function memo<T>(cle: string, duree: number, lire: () => Promise<T>): Promise<T> {
  const deja = cache.get(cle);
  if (deja && deja.fin > Date.now()) return deja.valeur as Promise<T>;
  const valeur = lire();
  cache.set(cle, { fin: Date.now() + duree, valeur });
  // Un échec ne reste pas en cache : la demande suivante réessaie.
  valeur.catch(() => cache.delete(cle));
  return valeur;
}

async function lire(url: string, accept: string): Promise<Response> {
  const r = await fetch(url, {
    headers: { "user-agent": UA_NAVIGATEUR, accept },
    signal: AbortSignal.timeout(DELAI_MS),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} sur ${url}`);
  return r;
}

export async function apercuWebcam(url: string): Promise<Apercu> {
  const f = fournisseurApercu(url);
  if (f === "skaping") {
    return memo(`skaping ${url}`, DUREE_SKAPING_MS, async () => {
      const html = await (await lire(url, "text/html")).text();
      const image = imageSkaping(html);
      return { image, prise: image ? priseSkaping(image) : null };
    });
  }
  if (f === "webcam-hd") {
    const cam = cameraWebcamHd(url)!;
    const groupe = await memo(`webcam-hd ${cam.groupe}`, DUREE_GROUPE_MS, async () =>
      (await lire(`https://app.webcam-hd.com/smr/json/webcam_display_group/${cam.groupe}.json`, "application/json")).json(),
    );
    return { image: imageWebcamHd(groupe, cam.camera), prise: null };
  }
  return { image: null, prise: null };
}
