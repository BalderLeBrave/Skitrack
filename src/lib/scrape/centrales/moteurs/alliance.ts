/**
 * Open System, génération ancienne : la recherche que le widget publie.
 *
 * L'accueil ne rend pas de prix. Le widget Alliance Réseaux qu'il charge, lui,
 * publie deux adresses. Le catalogue est un `vueinfo.js` sur
 * `map-jsonp.open-system.fr`, chemin `osform/{formulaire}/{moteur}/vueinfo.js`,
 * lu dans le fichier d'intégration du widget (`idIntegration`, onglet
 * « Tous les hébergements »). La recherche datée est
 * `etape-rest.for-system.com/index.aspx?ref=json-catalogue-etape16v5`, avec le
 * `loginAPI` du même fichier et l'`id` que le catalogue annonce.
 *
 * **Ce que le prix vaut.** Mesuré le 9 octobre 2026 sur Valmorel, vue 1423,
 * `loginAPI` « valmorel », du 6 février 2027. Le même logement `OSMB-58385-2`
 * vaut 594 € sur trois nuits et 1 386 € sur sept : le rapport est 7/3, au
 * centime. Ce n'est pas un « à partir de ». Le résumé dit toujours « 2 adultes »
 * quel que soit le nombre envoyé dans les deux champs que le widget remplit
 * (`usePax` vide, donc un zéro puis le nombre). Le montant suit la durée, pas
 * les personnes : c'est le total du logement pour ces nuits.
 *
 * Un article `dispo` autre que 1, ou un prix nul, n'est pas un séjour vendu.
 */
import { jugerLogement } from "../regleTypes.ts";

export type ArticleCatalogue = {
  cle: string;
  titre: string;
  lat: number | null;
  lon: number | null;
};

export type CatalogueAlliance = {
  /** L'identifiant de vue que la recherche datée attend. */
  id: number;
  articles: ArticleCatalogue[];
};

export type DispoAlliance = {
  cle: string;
  prix: number;
  dispo: number;
};

export type ReponseAlliance = {
  total: number | null;
  /** Nuits que la réponse dit avoir chiffrées. */
  nuits: number | null;
  /** Jour annoncé, tel que la réponse l'écrit. */
  dateAnnoncee: string | null;
  conversation: string;
  /** Bloc suivant, ou -1 quand la réponse est complète. */
  rs: number;
  dispos: DispoAlliance[];
};

export type LogementAlliance = {
  cle: string;
  titre: string;
  lat: number | null;
  lon: number | null;
  total: number;
};

/** La requête `q` du widget, telle qu'il l'assemble quand `usePax` est vrai. */
export function requeteAlliance(p: {
  login: string;
  vue: number;
  arrivee: string;
  nuits: number;
  personnes: number;
  conversation?: string;
  bloc?: number;
}): string {
  const bloc = p.bloc ?? 0;
  const personnes = Math.max(1, Math.trunc(p.personnes));
  const nuits = Math.max(1, Math.trunc(p.nuits));
  // Métier 1 : celui qui a répondu un total de séjour le 9 octobre 2026,
  // sur les cinq login mesurés. Le 20 est la taille de page écrite dans le widget.
  return [
    p.conversation ?? "",
    String(bloc),
    "20",
    p.login,
    "",
    "",
    String(p.vue),
    String(bloc),
    "0",
    "",
    "1",
    String(nuits),
    p.arrivee,
    "0",
    "",
    "*",
    "0",
    String(personnes),
    "",
    "*",
  ].join("|");
}

export function urlRechercheAlliance(requete: string): string {
  return `https://etape-rest.for-system.com/index.aspx?ref=json-catalogue-etape16v5&q=${encodeURIComponent(requete)}`;
}

/** Le bloc suivant, ou `null` quand la page est la dernière ou ne progresse pas. */
export function blocSuivant(bloc: number, rs: number): number | null {
  if (!Number.isFinite(rs) || rs < 0 || rs <= bloc) return null;
  return rs;
}

function objetJson(source: string): unknown {
  const texte = source.trim().replace(/^\uFEFF/, "");
  const appel = texte.match(/^[^(]*\(/);
  const corps = appel && !texte.includes("return") ? texte.slice(appel[0].length).replace(/\);?\s*$/, "") : texte;
  const retour = /return\s*\{/.exec(corps);
  const debut = retour ? retour.index + retour[0].length - 1 : corps.indexOf("{");
  if (debut < 0) throw new Error("réponse sans objet");
  let niveau = 0;
  let dans = false;
  let echappe = false;
  for (let i = debut; i < corps.length; i++) {
    const c = corps[i] ?? "";
    if (dans) {
      if (echappe) echappe = false;
      else if (c === "\\") echappe = true;
      else if (c === '"') dans = false;
      continue;
    }
    if (c === '"') dans = true;
    else if (c === "{") niveau += 1;
    else if (c === "}") {
      niveau -= 1;
      if (niveau === 0) return JSON.parse(corps.slice(debut, i + 1));
    }
  }
  throw new Error("réponse illisible");
}

function nombre(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Le catalogue publié par `vueinfo.js`. Lève si l'id de vue manque. */
export function lireCatalogueAlliance(source: string): CatalogueAlliance {
  const brut = objetJson(source);
  if (!brut || typeof brut !== "object") throw new Error("catalogue illisible");
  const o = brut as { id?: unknown; items?: unknown };
  const id = nombre(o.id);
  if (id == null) throw new Error("le catalogue n'a pas publié d'identifiant de vue");
  const items = Array.isArray(o.items) ? o.items : [];
  const articles: ArticleCatalogue[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const f = item as { cle?: unknown; titre?: unknown; lat?: unknown; lng?: unknown };
    if (typeof f.cle !== "string" || !f.cle || typeof f.titre !== "string" || !f.titre.trim()) continue;
    const lat = nombre(f.lat);
    const lon = nombre(f.lng);
    const nul = lat === 0 && lon === 0;
    articles.push({
      cle: f.cle,
      titre: f.titre.trim(),
      lat: lat != null && !nul && Math.abs(lat) <= 90 ? lat : null,
      lon: lon != null && !nul && Math.abs(lon) <= 180 ? lon : null,
    });
  }
  return { id, articles };
}

/** La page de disponibilités. Lève si ce n'est pas l'objet attendu. */
export function lireDisposAlliance(source: string): ReponseAlliance {
  const brut = objetJson(source);
  if (!brut || typeof brut !== "object") throw new Error("réponse illisible");
  const o = brut as {
    total?: unknown;
    resume?: { nbnuitees?: unknown; daterech?: unknown };
    ConversationId?: unknown;
    rsBlockIndex?: unknown;
    items?: unknown;
  };
  const items = Array.isArray(o.items) ? o.items : null;
  if (!items) throw new Error("réponse illisible");
  const dispos: DispoAlliance[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const f = item as { cle?: unknown; prix?: unknown; dispo?: unknown };
    if (typeof f.cle !== "string" || !f.cle) continue;
    const prix = nombre(f.prix);
    const dispo = nombre(f.dispo);
    if (prix == null || dispo == null) continue;
    dispos.push({ cle: f.cle, prix, dispo });
  }
  const resume = o.resume && typeof o.resume === "object" ? o.resume : {};
  return {
    total: nombre(o.total),
    nuits: nombre(resume.nbnuitees),
    dateAnnoncee: typeof resume.daterech === "string" ? resume.daterech : null,
    conversation: typeof o.ConversationId === "string" ? o.ConversationId : "",
    rs: nombre(o.rsBlockIndex) ?? -1,
    dispos,
  };
}

/**
 * Les logements vendus : prix positif, `dispo` 1, nom publié par le catalogue.
 *
 * Un titre qui commence par « Hôtel » est le type, et la règle du propriétaire
 * l'écarte. Le camping dans le titre aussi. Le reste du titre n'est pas un type :
 * un chalet peut porter un nom qui dirait autre chose.
 */
export function logementsAlliance(
  catalogue: CatalogueAlliance,
  reponse: ReponseAlliance,
): { gardes: LogementAlliance[]; ecartes: Map<string, number> } {
  const parCle = new Map(catalogue.articles.map((a) => [a.cle, a]));
  const gardes: LogementAlliance[] = [];
  const ecartes = new Map<string, number>();
  const vus = new Set<string>();
  for (const d of reponse.dispos) {
    if (d.dispo !== 1 || d.prix <= 0) continue;
    if (vus.has(d.cle)) continue;
    const article = parCle.get(d.cle);
    if (!article) continue;
    const type = /^\s*h[oô]tels?\b/i.test(article.titre) ? article.titre : null;
    const verdict = jugerLogement({ type, titre: article.titre, chemin: d.cle });
    if (verdict.motif) {
      ecartes.set(verdict.motif, (ecartes.get(verdict.motif) ?? 0) + 1);
      continue;
    }
    vus.add(d.cle);
    gardes.push({
      cle: d.cle,
      titre: article.titre,
      lat: article.lat,
      lon: article.lon,
      total: d.prix,
    });
  }
  return { gardes, ecartes };
}
