import { usePisteFilter } from "@/lib/pisteFilter";
import { pisteMax, type PistePreset, type PisteUnit } from "@/lib/pistes";

const COLORS = [
  ["minGreen", "Vertes", "#22A34A"],
  ["minBlue", "Bleues", "#2B6CB0"],
  ["minRed", "Rouges", "#C53030"],
  ["minBlack", "Noires", "#1A1A1A"],
] as const;

const PRESETS: { id: PistePreset; label: string; hint: string }[] = [
  { id: "all", label: "Toutes", hint: "aucun profil" },
  { id: "famille", label: "Famille", hint: "≥ 60 % vertes+bleues, ≤ 15 % noires" },
  { id: "mixte", label: "Mixte", hint: "aucune couleur > 50 %" },
  { id: "engage", label: "Engagé", hint: "dénivelé ≥ 1 800 m ou ≥ 40 % rouges+noires" },
  { id: "expert", label: "Expert", hint: "sommet ≥ 3 000 m ou ≥ 12 noires" },
  { id: "haut", label: "Haut", hint: "sommet France Montagnes ≥ 3 000 m" },
  { id: "glacier", label: "Glacier", hint: "glacier déclaré au catalogue du domaine" },
  { id: "lie", label: "Forfait lié", hint: "forfait multi-stations publié au catalogue" },
  { id: "itineraires", label: "Itinéraires", hint: "≥ 4 tracés OSM hors vert/bleu/rouge/noir" },
];

export function PisteFilterBar() {
  const unit = usePisteFilter((s) => s.unit);
  const preset = usePisteFilter((s) => s.preset);
  const setUnit = usePisteFilter((s) => s.setUnit);
  const setPreset = usePisteFilter((s) => s.setPreset);
  const setMin = usePisteFilter((s) => s.setMin);
  const reset = usePisteFilter((s) => s.reset);
  const mins = {
    minGreen: usePisteFilter((s) => s.minGreen),
    minBlue: usePisteFilter((s) => s.minBlue),
    minRed: usePisteFilter((s) => s.minRed),
    minBlack: usePisteFilter((s) => s.minBlack),
  };
  const suffix = unit === "km" ? "km" : unit === "pct" ? "%" : "pistes";
  const max = pisteMax(unit);
  const active = COLORS.some(([k]) => mins[k] > 0) || preset !== "all";

  return (
    <div className="piste-filter" data-testid="piste-filter">
      <p className="piste-filter__lead">
        Filtrer par pistes OSM, sommet, dénivelé, glacier, forfait lié et itinéraires — rien n’est
        inventé.
      </p>
      <div className="piste-filter__row" role="radiogroup" aria-label="Unité">
        {(["count", "km", "pct"] as PisteUnit[]).map((u) => (
          <button
            key={u}
            type="button"
            role="radio"
            aria-checked={unit === u}
            className={`piste-filter__pill${unit === u ? " piste-filter__pill--on" : ""}`}
            onClick={() => setUnit(u)}
            data-testid={`piste-unit-${u}`}
          >
            {u === "count" ? "Nombre" : u === "km" ? "Kilomètres" : "Pourcentage"}
          </button>
        ))}
      </div>
      <div className="piste-filter__row" role="radiogroup" aria-label="Profil">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={preset === p.id}
            title={p.hint}
            className={`piste-filter__pill${preset === p.id ? " piste-filter__pill--on" : ""}`}
            onClick={() => setPreset(p.id)}
            data-testid={`piste-preset-${p.id}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="piste-filter__sliders">
        {COLORS.map(([key, label, color]) => (
          <label key={key} className="piste-filter__slider">
            <span className="piste-filter__slider-label">
              <i style={{ background: color }} />
              {label} min.
            </span>
            <input
              type="range"
              min={0}
              max={max}
              value={mins[key]}
              data-testid={`piste-${key}`}
              suppressHydrationWarning
              onChange={(e) => setMin(key, Math.min(max, Math.max(0, Number(e.target.value) || 0)))}
            />
            <input
              type="number"
              min={0}
              max={max}
              value={mins[key]}
              className="piste-filter__num"
              suppressHydrationWarning
              onChange={(e) => setMin(key, Math.min(max, Math.max(0, Number(e.target.value) || 0)))}
            />
            <span className="text-muted">{suffix}</span>
          </label>
        ))}
      </div>
      {active && (
        <button type="button" className="piste-filter__reset" onClick={reset}>
          Réinitialiser les pistes
        </button>
      )}
    </div>
  );
}
