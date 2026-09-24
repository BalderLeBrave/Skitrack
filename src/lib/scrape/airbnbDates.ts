/**
 * Le total d'une tuile Airbnb porte-t-il sur le séjour demandé ?
 *
 * Une recherche datée ne renvoie pas que des biens libres à ces dates : quand
 * ils manquent, Airbnb complète sa grille avec des biens libres **à d'autres
 * dates**, et la tuile affiche leur total pour ces autres dates (« 1 850 €
 * pour 5 nuits », « 20–27 déc. »). Lu comme un total pour le séjour demandé,
 * ce prix faisait passer pour disponible un logement qui ne l'est pas.
 *
 * Trois indices, chacun suffisant, tous lus sur la tuile :
 * - le libellé compte un autre nombre de nuits que le séjour ;
 * - la tuile porte des paramètres de dates (`listingParamOverrides`) autres
 *   que ceux de la recherche ;
 * - une ligne de la tuile écrit une plage de dates autre que le séjour.
 *
 * Aucun indice lisible : on garde le total. Rien n'est supposé.
 */

const MOIS: Record<string, number> = {
  janv: 1,
  jan: 1,
  janvier: 1,
  fevr: 2,
  fev: 2,
  fevrier: 2,
  mars: 3,
  avr: 4,
  avril: 4,
  mai: 5,
  juin: 6,
  juil: 7,
  juillet: 7,
  aout: 8,
  sept: 9,
  sep: 9,
  septembre: 9,
  oct: 10,
  octobre: 10,
  nov: 11,
  novembre: 11,
  dec: 12,
  decembre: 12,
};

function sansAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function iso(s: string): { m: number; j: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? { m: Number(m[2]), j: Number(m[3]) } : null;
}

/** Nuits entre deux dates ISO, ou null. */
export function nuitsEntre(checkIn: string, checkOut: string): number | null {
  const a = Date.parse(`${checkIn}T00:00:00Z`);
  const b = Date.parse(`${checkOut}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return Math.round((b - a) / 86_400_000);
}

/** « 1 850 € pour 5 nuits » → 5. */
export function nuitsDuLibelle(label: string | null | undefined): number | null {
  const m = label ? /pour\s+(\d+)\s+nuits?/i.exec(label) : null;
  return m ? Number(m[1]) : null;
}

/** Dates de `listingParamOverrides`, sous forme d'objet ou de liste `{ key, value }`. */
export function datesSurchargees(record: unknown): { checkIn?: string; checkOut?: string } {
  const out: { checkIn?: string; checkOut?: string } = {};
  const poser = (k: string, v: unknown) => {
    if (typeof v !== "string") return;
    const cle = k.toLowerCase().replace(/_/g, "");
    if (cle === "checkin") out.checkIn = v;
    else if (cle === "checkout") out.checkOut = v;
  };
  const walk = (value: unknown, depth: number, dansSurcharge: boolean): void => {
    if (depth > 8 || value == null || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const x of value) walk(x, depth + 1, dansSurcharge);
      return;
    }
    const rec = value as Record<string, unknown>;
    if (dansSurcharge) {
      if (typeof rec.key === "string") poser(rec.key, rec.value);
      for (const [k, v] of Object.entries(rec)) poser(k, v);
    }
    for (const [k, v] of Object.entries(rec)) {
      walk(v, depth + 1, dansSurcharge || /paramoverrides/i.test(k));
    }
  };
  walk(record, 0, false);
  return out;
}

/**
 * Plages écrites sur la tuile : « 20–27 déc. », « 28 déc. – 4 janv. ».
 * Jours et mois seulement : la tuile n'écrit pas l'année.
 */
export function plagesEcrites(lines: string[]): { de: { j: number; m: number }; a: { j: number; m: number } }[] {
  const out: { de: { j: number; m: number }; a: { j: number; m: number } }[] = [];
  const re = /(\d{1,2})(?:\s+([a-z]+)\.?)?\s*[–—-]\s*(\d{1,2})\s+([a-z]+)\.?/g;
  for (const line of lines) {
    const t = sansAccents(line);
    for (const m of t.matchAll(re)) {
      const moisFin = MOIS[m[4]];
      if (!moisFin) continue;
      const moisDebut = m[2] ? MOIS[m[2]] : moisFin;
      if (!moisDebut) continue;
      out.push({ de: { j: Number(m[1]), m: moisDebut }, a: { j: Number(m[3]), m: moisFin } });
    }
  }
  return out;
}

/**
 * Vrai quand la tuile dit elle-même que son prix porte sur d'autres dates que
 * `checkIn` → `checkOut`.
 */
export function prixHorsSejour(
  record: unknown,
  label: string | null | undefined,
  lines: string[],
  checkIn: string,
  checkOut: string,
): boolean {
  const nuits = nuitsEntre(checkIn, checkOut);
  const nuitsLibelle = nuitsDuLibelle(label);
  if (nuits != null && nuitsLibelle != null && nuitsLibelle !== nuits) return true;

  const sur = datesSurchargees(record);
  if (sur.checkIn && sur.checkIn.slice(0, 10) !== checkIn) return true;
  if (sur.checkOut && sur.checkOut.slice(0, 10) !== checkOut) return true;

  const de = iso(checkIn);
  const a = iso(checkOut);
  if (de && a) {
    for (const p of plagesEcrites(lines)) {
      if (p.de.j !== de.j || p.de.m !== de.m || p.a.j !== a.j || p.a.m !== a.m) return true;
    }
  }
  return false;
}
