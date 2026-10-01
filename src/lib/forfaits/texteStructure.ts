/**
 * Une page de tarifs ramenée à des lignes de texte structuré.
 *
 * Chaque station écrit sa grille autrement : tableaux, cartes, listes,
 * paragraphes. Plutôt qu'un lecteur par site, la page est d'abord réduite à
 * une suite de lignes qui gardent ce qui compte pour lire un tarif :
 *
 * - un titre commence par des `#`, autant que son niveau (`## Hiver 2026-2027`) ;
 * - une ligne de tableau s'écrit `| cellule | cellule |`, une cellule fusionnée
 *   sur plusieurs colonnes (`colspan`) étant répétée pour que les colonnes
 *   restent alignées ;
 * - un prix barré s'écrit `~~312 €~~` : c'est le prix public, l'autre étant la
 *   promotion ;
 * - tout le reste est une ligne de texte.
 *
 * Le même format sort d'une page servie telle quelle, d'une page rendue par un
 * navigateur (boutiques en JavaScript), ou d'un Markdown. Le lecteur de grilles
 * (`lecteurGrille.ts`) ne connaît que lui.
 *
 * Chargé tel quel par `node --experimental-strip-types` : aucun alias `@/`.
 */

const ENTITES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  euro: "€",
  rsquo: "'",
  lsquo: "'",
  ldquo: '"',
  rdquo: '"',
  laquo: "«",
  raquo: "»",
  ndash: "-",
  mdash: "-",
  hellip: "...",
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  agrave: "à",
  acirc: "â",
  ccedil: "ç",
  ocirc: "ô",
  ucirc: "û",
  icirc: "î",
  iuml: "ï",
  euml: "ë",
  Eacute: "É",
  deg: "°",
  times: "x",
};

export function decoderEntites(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (tout, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : tout;
    }
    return ENTITES[e] ?? ENTITES[e.toLowerCase()] ?? tout;
  });
}

/** Les éléments qui coupent une ligne. */
const BLOCS = new Set([
  "p",
  "div",
  "section",
  "article",
  "aside",
  "header",
  "footer",
  "main",
  "nav",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "blockquote",
  "figure",
  "figcaption",
  "form",
  "fieldset",
  "details",
  "summary",
  "caption",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "hr",
]);

const BARRES = new Set(["del", "s", "strike"]);

const espaces = (s: string) => s.replace(/[\s\u00a0\u202f]+/g, " ").trim();

/** Une page HTML en lignes structurées. */
export function lignesDepuisHtml(html: string): string[] {
  const propre = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      /<(script|style|noscript|svg|template|head|iframe|select|option)\b[\s\S]*?<\/\1\s*>/gi,
      " ",
    );
  const lignes: string[] = [];
  let courante = "";
  let titre = 0;
  let ligneTableau: string[] | null = null;
  let cellule: { texte: string; repeter: number } | null = null;
  let barre = 0;

  const couper = () => {
    const t = espaces(courante);
    if (t) lignes.push(titre ? `${"#".repeat(titre)} ${t}` : t);
    courante = "";
  };
  const ecrire = (texte: string) => {
    const t = barre ? `~~${texte.trim()}~~` : texte;
    if (cellule) cellule.texte += t;
    else courante += t;
  };
  const fermerCellule = () => {
    if (cellule && ligneTableau) {
      const t = espaces(cellule.texte.replace(/\|/g, "/"));
      for (let i = 0; i < cellule.repeter; i += 1) ligneTableau.push(t);
    }
    cellule = null;
  };
  const fermerLigne = () => {
    fermerCellule();
    if (ligneTableau && ligneTableau.some((c) => c)) lignes.push(`| ${ligneTableau.join(" | ")} |`);
    ligneTableau = null;
  };

  const balise = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let dernier = 0;
  let m: RegExpExecArray | null;
  while ((m = balise.exec(propre))) {
    const texte = decoderEntites(propre.slice(dernier, m.index));
    if (texte.trim()) ecrire(texte);
    else if (texte) ecrire(" ");
    dernier = m.index + m[0].length;
    const fin = m[1] === "/";
    const nom = m[2].toLowerCase();
    if (BARRES.has(nom)) {
      barre = Math.max(0, barre + (fin ? -1 : 1));
      continue;
    }
    if (/^h[1-6]$/.test(nom)) {
      if (cellule) {
        ecrire(" ");
        continue;
      }
      couper();
      titre = fin ? 0 : Number(nom[1]);
      continue;
    }
    if (nom === "tr") {
      if (fin) fermerLigne();
      else {
        couper();
        fermerLigne();
        ligneTableau = [];
      }
      continue;
    }
    if (nom === "td" || nom === "th") {
      if (fin) fermerCellule();
      else {
        fermerCellule();
        if (!ligneTableau) {
          couper();
          ligneTableau = [];
        }
        const span = /colspan\s*=\s*["']?(\d+)/i.exec(m[3]);
        cellule = { texte: "", repeter: Math.min(12, Math.max(1, span ? Number(span[1]) : 1)) };
      }
      continue;
    }
    if (nom === "table" && fin) {
      fermerLigne();
      continue;
    }
    if (nom === "br") {
      ecrire(" ");
      if (!cellule) couper();
      continue;
    }
    if (BLOCS.has(nom)) {
      if (cellule) ecrire(" ");
      else couper();
      continue;
    }
    // Élément en ligne (span, strong, a…) : un espace de sécurité, pour que
    // « Adulte<span>19 – 64 ans</span> » ne devienne pas « Adulte19 ».
    if (!fin && /^(span|a|strong|b|em|i|small|sup|sub|abbr|label|button)$/.test(nom)) ecrire("");
    else ecrire(" ");
  }
  const reste = decoderEntites(propre.slice(dernier));
  if (reste.trim()) ecrire(reste);
  fermerLigne();
  couper();
  return lignes;
}

/**
 * Un Markdown (celui d'un convertisseur de pages) dans le même format : liens
 * et images réduits à leur texte, gras et italiques retirés, `<br>` en espace.
 */
export function lignesDepuisMarkdown(md: string): string[] {
  const out: string[] = [];
  for (const brut of md.split(/\r?\n/)) {
    let l = brut
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/\\([*_\\|#~])/g, "$1")
      .replace(/\*\*|__/g, "")
      .replace(/(^|\s)_([^_]+)_(?=\s|$)/g, "$1$2");
    l = l.replace(/^>\s?/, "");
    if (/^\s*\|?\s*:?-{3,}/.test(l) && /^[\s|:-]+$/.test(l)) continue;
    const t = espaces(l);
    if (t) out.push(t);
  }
  return out;
}
