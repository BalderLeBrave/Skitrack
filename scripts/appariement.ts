/**
 * L'appariement d'un domaine du référentiel à la fiche d'une source, par la
 * position. **Une seule écriture de cette règle**, pour trois usages.
 *
 * ## Pourquoi elle existe
 *
 * Ni Skiinfo ni skiresort ne partage de clé avec le référentiel : les uns
 * rangent par slug, l'autre par identifiant construit, et les noms ne se
 * comparent pas — « Les Portes du Soleil » chez l'un,
 * « Portes du Soleil (Morzine/Avoriaz/…) » chez l'autre. Reste la position.
 *
 * ## Une source, un appariement
 *
 * Les photos et les prix d'une même source passent par **le même** couple
 * domaine-fiche. Deux appariements séparés laisseraient un domaine prendre sa
 * photo d'une fiche et son prix d'une autre, à quatre kilomètres de là : deux
 * stations différentes présentées comme une seule, sans que rien ne le dise.
 *
 * ## Ce que l'appariement affirme, et ce qu'il n'affirme pas
 *
 * Il affirme que deux points sont à moins de `rayonKm` l'un de l'autre. C'est
 * tout. D'où trois choses qui l'accompagnent toujours :
 *
 * 1. **La distance**, conservée et affichée : un rattachement à 4,8 km ne vaut
 *    pas un rattachement à 200 m.
 * 2. **La fiche nommée**, pour qu'un doute se lève à la main.
 * 3. **L'exclusivité** : une fiche ne sert qu'un domaine. Deux stations
 *    voisines n'ont ni la même photo ni le même forfait, et leur en prêter un
 *    reviendrait à inventer.
 *
 * L'appariement est glouton sur la distance croissante : chaque couple est
 * examiné du plus proche au plus lointain, et le premier qui trouve les deux
 * côtés libres l'emporte.
 */

export type Point = { lat: number; lon: number };

export function distanceKm(a: Point, b: Point): number {
  const r = Math.PI / 180;
  const p1 = a.lat * r;
  const p2 = b.lat * r;
  const dp = (b.lat - a.lat) * r;
  const dl = (b.lon - a.lon) * r;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * Une grille au degré : chaque fiche est rangée dans sa case et dans les huit
 * qui l'entourent, pour qu'une recherche n'ait qu'une case à lire. Le rayon
 * retenu étant très inférieur au degré, aucun voisin utile n'échappe à ce
 * voisinage.
 */
function grille<T extends Point>(points: readonly T[]): Map<string, T[]> {
  const g = new Map<string, T[]>();
  for (const p of points) {
    const la = Math.floor(p.lat);
    const lo = Math.floor(p.lon);
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const k = `${la + a}|${lo + b}`;
        const lot = g.get(k);
        if (lot) lot.push(p);
        else g.set(k, [p]);
      }
    }
  }
  return g;
}

export type Apparie<T> = { fiche: T; km: number };

/**
 * Apparie des domaines à des fiches, chacune ne servant qu'une fois.
 *
 * Rend une table `identifiant du domaine → { fiche, km }`. Les domaines sans
 * fiche dans le rayon **n'y figurent pas** : une clé absente se lit partout
 * ailleurs dans le dépôt comme une absence, et l'écran l'affiche au lieu de la
 * combler.
 */
export function apparier<D extends Point & { id: string }, F extends Point & { cle: string }>(
  domaines: readonly D[],
  fiches: readonly F[],
  rayonKm: number,
): Map<string, Apparie<F>> {
  const g = grille(fiches);
  const couples: { id: string; cle: string; km: number }[] = [];
  for (const d of domaines) {
    for (const f of g.get(`${Math.floor(d.lat)}|${Math.floor(d.lon)}`) ?? []) {
      const km = distanceKm(d, f);
      if (km <= rayonKm) couples.push({ id: d.id, cle: f.cle, km });
    }
  }
  couples.sort((a, b) => a.km - b.km);

  const parCle = new Map(fiches.map((f) => [f.cle, f]));
  const out = new Map<string, Apparie<F>>();
  const prises = new Set<string>();
  for (const c of couples) {
    if (out.has(c.id) || prises.has(c.cle)) continue;
    const f = parCle.get(c.cle);
    if (!f) continue;
    out.set(c.id, { fiche: f, km: Math.round(c.km * 100) / 100 });
    prises.add(c.cle);
  }
  return out;
}

/** Ce qu'on écrit au journal pour dire ce que l'appariement vaut. */
export function resume(table: Map<string, { km: number }>, total: number): string[] {
  const n = table.size;
  const d = [...table.values()].map((x) => x.km).sort((a, b) => a - b);
  const pct = (x: number) => `${((x / Math.max(1, total)) * 100).toFixed(1)} %`;
  return [
    `Rattachés        : ${n}   ${pct(n)}`,
    d.length ? `Distance médiane : ${d[Math.floor(d.length / 2)]?.toFixed(2)} km` : "",
    d.length ? `  à moins de 1 km : ${d.filter((x) => x <= 1).length}` : "",
    d.length ? `  entre 3 et 5 km : ${d.filter((x) => x > 3).length}` : "",
  ].filter(Boolean);
}
