/**
 * Une fourchette sur une échelle : deux poignées sur un rail, et les deux mêmes
 * bornes à taper dans deux champs. « Prix par station » en pose quatre
 * (médiane, km de pistes, sommet, altitude du village).
 *
 * Le dépôt n'avait qu'un seuil, l'`input type="range"` de Comparer, qui n'a
 * qu'une poignée. `@radix-ui/react-slider` est installé mais n'était employé
 * nulle part, et il s'écarte de la maquette : il tient ses poignées à
 * l'intérieur du rail là où la maquette les centre sur leur valeur, et il les
 * laisse s'échanger quand elles se croisent là où la maquette garde la même
 * poignée tout le glissé. D'où ce composant, écrit d'après la maquette.
 *
 * Il ne décide rien : il dit quelle poignée bouge et vers quelle valeur brute,
 * et le parent arrondit au pas, borne et empêche le croisement (`poserBorne`).
 */

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { fmt } from "@/lib/parcours";
import { lireSaisie, poigneeProche } from "@/lib/prix/calcul";

const COTES = [0, 1] as const;
const NOMS = ["minimum", "maximum"] as const;

/** L'écart, en pas, qu'une touche fait faire à une poignée. */
function ecartTouche(key: string): number | null {
  switch (key) {
    case "ArrowLeft":
    case "ArrowDown":
      return -1;
    case "ArrowRight":
    case "ArrowUp":
      return 1;
    case "PageDown":
      return -10;
    case "PageUp":
      return 10;
    default:
      return null;
  }
}

export function Fourchette({
  lbl,
  bornes,
  valeur,
  pas,
  unite,
  resume,
  onPoser,
}: {
  lbl: string;
  bornes: readonly [number, number];
  /** Nulle : toute l'échelle, le filtre ne filtre pas et le rail passe au gris. */
  valeur: readonly [number, number] | null;
  pas: number;
  unite: string;
  /** En haut à droite : `plageLbl(...)`. */
  resume: string;
  /** Valeur brute : le parent arrondit, borne et empêche le croisement. */
  onPoser: (which: 0 | 1, v: number) => void;
}) {
  const [b0, b1] = bornes;
  const cur = valeur ?? bornes;
  const part = (v: number) => ((v - b0) / (b1 - b0 || 1)) * 100;
  const bas = useRef<HTMLSpanElement>(null);
  const haut = useRef<HTMLSpanElement>(null);
  const glisse = useRef<{ id: number; which: 0 | 1; cran: number } | null>(null);
  const [brouillon, setBrouillon] = useState<readonly [string | null, string | null]>([null, null]);

  const versValeur = (el: HTMLElement, x: number) => {
    const r = el.getBoundingClientRect();
    const p = r.width > 0 ? Math.min(1, Math.max(0, (x - r.left) / r.width)) : 0;
    return b0 + p * (b1 - b0);
  };
  // Le parent arrondit au pas : tant que le pointeur reste dans le même cran,
  // lui renvoyer la valeur ne ferait que redessiner l'écran pour rien.
  const cranDe = (v: number) => (pas > 0 ? Math.round(v / pas) : v);

  const saisir = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !e.isPrimary) return;
    e.preventDefault();
    const el = e.currentTarget;
    const v = versValeur(el, e.clientX);
    const which = poigneeProche(v, cur);
    // Le rail ne prend pas le focus : la poignée qui bouge le prend, pour que
    // les flèches reprennent là où le pointeur l'a laissée.
    (which === 0 ? bas : haut).current?.focus();
    onPoser(which, v);
    glisse.current = { id: e.pointerId, which, cran: cranDe(v) };
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Sans capture, le glissé s'arrêterait au bord du rail : on s'en tient au clic.
      glisse.current = null;
    }
  };
  const suivre = (e: PointerEvent<HTMLDivElement>) => {
    const g = glisse.current;
    if (!g || e.pointerId !== g.id) return;
    const v = versValeur(e.currentTarget, e.clientX);
    const cran = cranDe(v);
    if (cran === g.cran) return;
    g.cran = cran;
    onPoser(g.which, v);
  };
  const lacher = (e: PointerEvent<HTMLDivElement>) => {
    if (glisse.current?.id === e.pointerId) glisse.current = null;
  };

  const clavier = (which: 0 | 1) => (e: KeyboardEvent<HTMLSpanElement>) => {
    const d = ecartTouche(e.key);
    const v =
      d != null ? cur[which] + d * pas : e.key === "Home" ? b0 : e.key === "End" ? b1 : null;
    if (v == null) return;
    e.preventDefault();
    onPoser(which, v);
  };

  const brouiller = (which: 0 | 1, t: string | null) =>
    setBrouillon((d) => (which === 0 ? [t, d[1]] : [d[0], t]));
  const valider = (which: 0 | 1) => {
    const t = brouillon[which];
    if (t == null) return;
    brouiller(which, null);
    // Un texte qui n'est pas un nombre rend simplement la valeur d'avant.
    const n = lireSaisie(t);
    if (n != null) onPoser(which, n);
  };
  const touche = (which: 0 | 1) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      valider(which);
    } else if (e.key === "Escape") {
      brouiller(which, null);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      // La maquette gardait le brouillon à l'écran : le pas part de la valeur
      // posée, le champ doit donc la montrer.
      brouiller(which, null);
      onPoser(which, cur[which] + (e.key === "ArrowUp" ? pas : -pas));
    }
  };

  const champ = (which: 0 | 1) => (
    <label className="fourchette7__champ">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={`${lbl}, ${NOMS[which]}`}
        value={brouillon[which] ?? String(cur[which])}
        onChange={(e) => brouiller(which, e.target.value)}
        onBlur={() => valider(which)}
        onKeyDown={touche(which)}
      />
      <span className="fourchette7__unite">{unite}</span>
    </label>
  );

  return (
    <div className={`fourchette7${valeur != null ? " fourchette7--actif" : ""}`}>
      <div className="fourchette7__tete">
        <span className="fourchette7__lbl">{lbl}</span>
        <span className="fourchette7__resume">{resume}</span>
      </div>
      <div
        className="fourchette7__piste"
        onPointerDown={saisir}
        onPointerMove={suivre}
        onPointerUp={lacher}
        onPointerCancel={lacher}
        onLostPointerCapture={lacher}
      >
        <i className="fourchette7__rail" />
        <i
          className="fourchette7__plage"
          style={{ left: `${part(cur[0])}%`, width: `${part(cur[1]) - part(cur[0])}%` }}
        />
        {COTES.map((which) => (
          <span
            key={which}
            ref={which === 0 ? bas : haut}
            className="fourchette7__poignee"
            style={{ left: `${part(cur[which])}%` }}
            role="slider"
            tabIndex={0}
            aria-label={`${lbl}, ${NOMS[which]}`}
            aria-orientation="horizontal"
            aria-valuemin={which === 0 ? b0 : cur[0]}
            aria-valuemax={which === 0 ? cur[1] : b1}
            aria-valuenow={cur[which]}
            aria-valuetext={`${fmt(cur[which])} ${unite}`}
            onKeyDown={clavier(which)}
          />
        ))}
      </div>
      <div className="fourchette7__champs">
        {champ(0)}
        <span className="fourchette7__a">à</span>
        {champ(1)}
      </div>
    </div>
  );
}
