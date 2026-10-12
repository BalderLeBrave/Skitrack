/**
 * Les photos de la fiche d'annonce : la mosaïque de la fenêtre (une grande
 * photo et quatre petites, « Voir toutes les photos »), et la visionneuse
 * plein écran, avec ses vignettes. La fiche (`VoletAnnonce`) tient l'état de
 * la galerie (`useGalerie`) et le clavier : flèches pour changer de photo,
 * Échap pour revenir à la fiche.
 *
 * Dans la visionneuse, on change aussi de photo par la molette ou le trackpad
 * horizontal, et le glissé (souris et doigt), en boucle. La précédente et les
 * deux suivantes se chargent d'avance. Une photo qui ne se charge pas sort de
 * la galerie.
 */

import { useEffect, useRef } from "react";
import { Icon } from "@/components/Icon";
import { PictoGrille } from "@/components/v7/fiche/PictoFiche";
import { tr } from "@/lib/i18n";
import { TAILLE_MOSAIQUE, TAILLE_PLEIN, type Galerie } from "@/components/v7/useGalerie";
import { photoVignette } from "@/lib/stay/photoHd";
import {
  defilementRuban,
  lireMolette,
  MOLETTE0,
  sensGlisse,
  type Molette,
} from "@/lib/stay/visionneuse";

/** Les cases de la mosaïque : une grande, quatre petites. */
const CASES = 5;

/** La photo plein écran ; elle suit le glissé et la molette. */
function Scene({ g }: { g: Galerie }) {
  const scene = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const molette = useRef<Molette>(MOLETTE0);
  const appui = useRef<{ x: number; y: number; id: number } | null>(null);
  const n = g.photos.length;
  const u = g.photos[g.i];
  const vue = u ? g.vue(u) : null;

  // La molette s'écoute en natif : React pose ses écouteurs en passif, et le
  // geste ne pourrait pas être retenu au navigateur.
  const aller = g.aller;
  useEffect(() => {
    const el = scene.current;
    if (!el || n < 2) return;
    const roule = (e: WheelEvent) => {
      const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
      const r = lireMolette(molette.current, e.deltaX * k, e.deltaY * k, e.timeStamp, true);
      molette.current = r.m;
      if (r.pris) e.preventDefault();
      if (r.pas) aller(r.pas);
    };
    el.addEventListener("wheel", roule, { passive: false });
    return () => el.removeEventListener("wheel", roule);
  }, [aller, n]);

  const deplacer = (dx: number) => {
    if (image.current) image.current.style.transform = dx ? `translateX(${dx}px)` : "";
  };

  return (
    <div
      ref={scene}
      className={`fl-scene${n > 1 ? " fl-scene--glisse" : ""}`}
      onPointerDown={(e) => {
        if (e.button !== 0 || (e.target as Element).closest("button")) return;
        appui.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const a = appui.current;
        if (!a || a.id !== e.pointerId || n < 2) return;
        const dx = e.clientX - a.x;
        if (Math.abs(dx) > Math.abs(e.clientY - a.y)) deplacer(dx);
      }}
      onPointerUp={(e) => {
        const a = appui.current;
        appui.current = null;
        deplacer(0);
        if (!a || a.id !== e.pointerId) return;
        const sens = n > 1 ? sensGlisse(e.clientX - a.x, e.clientY - a.y) : 0;
        if (sens) g.aller(sens);
      }}
      onPointerCancel={() => {
        appui.current = null;
        deplacer(0);
      }}
    >
      {u && vue ? (
        <img
          key={vue.src}
          ref={image}
          src={vue.src}
          srcSet={vue.srcset ?? undefined}
          sizes={vue.srcset ? TAILLE_PLEIN : undefined}
          alt={tr("Photo {n} sur {total}", { n: g.i + 1, total: n })}
          draggable={false}
          onError={() => g.echec(u, vue.etape)}
        />
      ) : null}
      {n > 1 ? (
        <>
          <span className="lecteur7" aria-live="polite">
            {tr("Photo {n} sur {total}", { n: g.i + 1, total: n })}
          </span>
          <button
            type="button"
            className="fl-scene__fleche fl-scene__fleche--prec"
            aria-label={tr("Photo précédente")}
            onClick={() => g.aller(-1)}
          >
            <Icon name="chevron-gauche" taille={18} />
          </button>
          <button
            type="button"
            className="fl-scene__fleche fl-scene__fleche--suiv"
            aria-label={tr("Photo suivante")}
            onClick={() => g.aller(1)}
          >
            <Icon name="chevron-droite" taille={18} />
          </button>
        </>
      ) : null}
    </div>
  );
}

/**
 * La mosaïque de la fenêtre : une grande photo à gauche, quatre petites à
 * droite (moins quand l'annonce en a moins). Chaque photo ouvre la
 * visionneuse sur elle-même.
 */
export function Mosaique({
  g,
  source,
  ouvrir,
}: {
  g: Galerie;
  source: string;
  /** Ouvre la visionneuse sur la photo `i`. */
  ouvrir: (i: number) => void;
}) {
  const n = g.photos.length;
  if (!n) {
    return (
      <section className="fl-mosaique fl-mosaique--vide">
        <span>{tr("Pas de photo dans l’annonce {source}", { source })}</span>
      </section>
    );
  }
  const cases = g.photos.slice(0, CASES);
  return (
    <section
      className={`fl-mosaique fl-mosaique--${cases.length}`}
      aria-label={tr("Photos de l’annonce")}
    >
      {cases.map((u, j) => {
        const vue = g.vue(u);
        return (
          <button
            key={u}
            type="button"
            className="fl-mosaique__case"
            aria-label={tr("Photo {n} sur {total}", { n: j + 1, total: n })}
            onClick={() => ouvrir(j)}
          >
            <img
              src={vue.src}
              srcSet={vue.srcset ?? undefined}
              sizes={
                vue.srcset ? (j === 0 ? TAILLE_MOSAIQUE.grande : TAILLE_MOSAIQUE.petite) : undefined
              }
              alt=""
              loading={j === 0 ? undefined : "lazy"}
              draggable={false}
              onError={() => g.echec(u, vue.etape)}
            />
          </button>
        );
      })}
      {n > 1 ? (
        <button type="button" className="fl-mosaique__toutes" onClick={() => ouvrir(0)}>
          <PictoGrille />
          {tr("Voir toutes les photos")}
        </button>
      ) : null}
    </section>
  );
}

/** La visionneuse plein écran : le titre et le compteur, la photo, les vignettes. */
export function PleinEcran({
  g,
  titre,
  fermer,
}: {
  g: Galerie;
  titre: string;
  fermer: () => void;
}) {
  const croix = useRef<HTMLButtonElement>(null);
  const ruban = useRef<HTMLDivElement>(null);
  const n = g.photos.length;
  useEffect(() => {
    croix.current?.focus({ preventScroll: true });
  }, []);

  // Le ruban défile pour garder la vignette active en vue.
  useEffect(() => {
    const r = ruban.current;
    const v = r?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!r || !v) return;
    const cible = defilementRuban(r.scrollLeft, r.clientWidth, v.offsetLeft, v.offsetWidth, 16);
    if (cible === r.scrollLeft) return;
    const reduit = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    r.scrollTo({ left: cible, behavior: reduit ? "auto" : "smooth" });
  }, [g.i, n]);

  return (
    <div
      className="fl-plein"
      role="dialog"
      aria-modal="true"
      aria-label={tr("Photos en plein écran")}
    >
      <div className="fl-plein__tete">
        <b>{titre}</b>
        {n > 1 ? (
          <span className="fl-plein__compteur" aria-hidden>
            {g.i + 1} / {n}
          </span>
        ) : null}
        <button
          ref={croix}
          type="button"
          className="fl-plein__fermer"
          aria-label={tr("Quitter le plein écran")}
          title={tr("Quitter le plein écran")}
          onClick={fermer}
        >
          <Icon name="croix" taille={16} />
        </button>
      </div>
      <Scene g={g} />
      <div ref={ruban} className="fl-plein__ruban" aria-label={tr("Photos de l’annonce")}>
        {n > 1
          ? g.photos.map((u, j) => (
              <button
                key={u}
                type="button"
                className="fl-plein__vignette"
                aria-current={j === g.i ? "true" : undefined}
                aria-label={tr("Photo {n} sur {total}", { n: j + 1, total: n })}
                onClick={() => g.choisir(j)}
              >
                <img
                  src={photoVignette(u)}
                  alt=""
                  loading="lazy"
                  draggable={false}
                  onError={(e) => {
                    // La vignette d'abord, puis l'adresse relevée, puis la photo sort.
                    const img = e.currentTarget;
                    if (img.dataset.repli) g.rater(u);
                    else if (photoVignette(u) !== u) {
                      img.dataset.repli = "1";
                      img.src = u;
                    } else g.rater(u);
                  }}
                />
              </button>
            ))
          : null}
      </div>
    </div>
  );
}
