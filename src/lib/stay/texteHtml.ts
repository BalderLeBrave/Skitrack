/**
 * Un texte publié en HTML (une description d'annonce), rendu en texte :
 * balises ôtées, `<br>` et fins de paragraphe en sauts de ligne, entités
 * décodées, accents compris (« am&eacute;nag&eacute; » → « aménagé »).
 *
 * Module pur, chargé tel quel par `node --experimental-strip-types`.
 */

const MARQUES: Record<string, string> = {
  acute: "́",
  grave: "̀",
  circ: "̂",
  uml: "̈",
  cedil: "̧",
  tilde: "̃",
  ring: "̊",
};

const NOMMEES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  deg: "°",
  sup2: "²",
  sup3: "³",
  euro: "€",
  laquo: "«",
  raquo: "»",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  ndash: "–",
  middot: "·",
  times: "×",
  oelig: "œ",
  OElig: "Œ",
  aelig: "æ",
  AElig: "Æ",
  szlig: "ß",
};

/** Décode les entités en une seule passe : un `&` rendu n'en ouvre pas une autre. */
export function decoderEntites(s: string): string {
  return s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([A-Za-z][A-Za-z0-9]*));/gi, (brut, dec?: string, hex?: string, nom?: string) => {
    if (nom) {
      if (NOMMEES[nom] != null) return NOMMEES[nom];
      const m = /^([A-Za-z])(acute|grave|circ|uml|cedil|tilde|ring)$/.exec(nom);
      if (m) return `${m[1]}${MARQUES[m[2]!]}`.normalize("NFC");
      return NOMMEES[nom.toLowerCase()] ?? brut;
    }
    const code = dec != null ? Number(dec) : Number.parseInt(hex ?? "", 16);
    if (!Number.isFinite(code)) return brut;
    return code === 160 ? " " : String.fromCodePoint(code);
  });
}

/**
 * Le texte d'un fragment HTML : une ligne par `<br>` ou paragraphe, espaces
 * repliées. Les balises à préfixe comptent comme les autres : Feratel écrit
 * `<d:p>`, `<d:br>`, `<d:h2>` (balisage Deskline).
 */
export function texteDeHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const t = decoderEntites(
    html
      .replace(/<(?:[a-z]+:)?br\s*\/?>|<\/(?:[a-z]+:)?(?:p|li|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\r/g, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return t || null;
}
