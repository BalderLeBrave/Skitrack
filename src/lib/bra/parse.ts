/** Parseur XML du BRA Météo-France. Fixture uniquement dans les tests. */

export type BraBulletin = {
  ok: boolean;
  massifCode: number;
  risk: number | null;
  risk1: number | null;
  risk2: number | null;
  loc1: string | null;
  loc2: string | null;
  altitude: number | null;
  issuedAt: string | null;
  message: string | null;
  error: string | null;
  source?: "meteofrance" | "interne";
};

export function emptyBulletin(massifCode: number, patch: Partial<BraBulletin> = {}): BraBulletin {
  return {
    ok: false,
    massifCode,
    risk: null,
    risk1: null,
    risk2: null,
    loc1: null,
    loc2: null,
    altitude: null,
    issuedAt: null,
    message: null,
    error: null,
    ...patch,
  };
}

function attr(xml: string, name: string): string | null {
  const m = new RegExp(`[\\s<]${name}\\s*=\\s*"([^"]*)"`, "i").exec(xml);
  return m && m[1] !== "" ? m[1] : null;
}

function level(value: string | null): number | null {
  if (value == null) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
}

function seasonMessage(xml: string): string | null {
  const m = /<message>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/message>/i.exec(xml);
  return m ? m[1].trim() : null;
}

export function parseBulletin(massifCode: number, xml: string): BraBulletin {
  const closed = seasonMessage(xml);
  if (closed) return emptyBulletin(massifCode, { ok: true, message: closed, source: "meteofrance" });

  const risk1 = level(attr(xml, "RISQUE1"));
  const risk2 = level(attr(xml, "RISQUE2"));
  const maxi = level(attr(xml, "RISQUEMAXI"));
  const risk = maxi ?? (risk1 != null || risk2 != null ? Math.max(risk1 ?? 0, risk2 ?? 0) : null);
  const alt = attr(xml, "ALTITUDE");
  const altitude = alt == null ? null : Number.parseInt(alt.replace(/\D+/g, ""), 10) || null;

  if (risk == null) {
    return emptyBulletin(massifCode, {
      error: "Bulletin illisible : aucun niveau de risque trouvé dans la réponse.",
    });
  }

  return {
    ok: true,
    massifCode,
    risk,
    risk1,
    risk2,
    loc1: attr(xml, "LOC1"),
    loc2: attr(xml, "LOC2"),
    altitude,
    issuedAt: attr(xml, "DATEBULLETIN") ?? attr(xml, "DATEVALIDITE"),
    message: null,
    error: null,
    source: "meteofrance",
  };
}

export const BRA_LABELS: Record<number, { fr: string; en: string }> = {
  1: { fr: "faible", en: "low" },
  2: { fr: "limité", en: "moderate" },
  3: { fr: "marqué", en: "considerable" },
  4: { fr: "fort", en: "high" },
  5: { fr: "très fort", en: "very high" },
};
