/**
 * La visionneuse de photos de la fiche d'annonce : une grande photo, un ruban
 * de vignettes dessous, et le plein écran. La fiche (`VoletAnnonce`) tient
 * l'état de la galerie (`useGalerie`) : la fenêtre et le plein écran montrent
 * la même photo, et le clavier passe par la fiche.
 *
 * On change de photo par les flèches, le clavier, la molette ou le trackpad
 * horizontal, et le glissé (souris et doigt), en boucle. La précédente et les
 * deux suivantes se chargent d'avance. Une photo qui ne se charge pas sort de
 * la galerie, comme elle était masquée dans la bande de la fiche plein écran.
 */

import { useEffect, useRef, type RefObject } from "react";
import { Icon } from "@/components/Icon";
import { tr } from "@/lib/i18n";
import { TAILLE_FENETRE, TAILLE_PLEIN, type Galerie } from "@/components/v7/useGalerie";
import { photoVignette } from "@/lib/stay/photoHd";
import { defilementRuban, lireMolette, MOLETTE0, sensGlisse, type Molette } from "@/lib/stay/visionneuse";

/** Un appui qui bouge moins que cela est un clic, pas un glissé. */
const CLIC_PX = 6;

/**
 * La photo affichée, ses flèches et son compteur ; elle suit le glissé et la
 * molette. `plein` : la scène du plein écran (photo entière, molette
 * verticale comprise).
 */
function Scene({
  g,
  source,
  plein,
  ouvrirPlein,
  boutonPlein,
}: {
  g: Galerie;
  source: string;
  plein: boolean;
  ouvrirPlein?: () => void;
  boutonPlein?: RefObject<HTMLButtonElement | null>;
}) {
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
      const r = lireMolette(molette.current, e.deltaX * k, e.deltaY * k, e.timeStamp, plein);
      molette.current = r.m;
      if (r.pris) e.preventDefault();
      if (r.pas) aller(r.pas);
    };
    el.addEventListener("wheel", roule, { passive: false });
    return () => el.removeEventListener("wheel", roule);
  }, [aller, n, plein]);

  const deplacer = (dx: number) => {
    if (image.current) image.current.style.transform = dx ? `translateX(${dx}px)` : "";
  };

  return (
    <div
      ref={scene}
      className={`fiche7__scene${plein ? " fiche7__scene--plein" : ""}${n > 1 ? " fiche7__scene--glisse" : ""}`}
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
        const dx = e.clientX - a.x;
        const dy = e.clientY - a.y;
        const sens = n > 1 ? sensGlisse(dx, dy) : 0;
        if (sens) g.aller(sens);
        else if (Math.abs(dx) < CLIC_PX && Math.abs(dy) < CLIC_PX && ouvrirPlein && u) ouvrirPlein();
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
          sizes={vue.srcset ? (plein ? TAILLE_PLEIN : TAILLE_FENETRE) : undefined}
          alt={tr("Photo {n} sur {total}", { n: g.i + 1, total: n })}
          draggable={false}
          onError={() => g.echec(u, vue.etape)}
        />
      ) : (
        <span className="fiche7__sansphoto">{tr("Pas de photo dans l’annonce {source}", { source })}</span>
      )}
      {!plein ? <span className="fiche7__plateforme">{source}</span> : null}
      {ouvrirPlein && u ? (
        <button
          ref={boutonPlein}
          type="button"
          className="fiche7__surphoto fiche7__agrandir"
          aria-label={tr("Afficher les photos en plein écran")}
          title={tr("Afficher les photos en plein écran")}
          onClick={ouvrirPlein}
        >
          <Icon name="agrandir" taille={16} />
        </button>
      ) : null}
      {n > 1 ? (
        <>
          <span className="fiche7__compteur" aria-hidden>
            {g.i + 1} / {n}
          </span>
          <span className="lecteur7" aria-live="polite">
            {tr("Photo {n} sur {total}", { n: g.i + 1, total: n })}
          </span>
          <button
            type="button"
            className="fiche7__surphoto fiche7__fleche fiche7__fleche--prec"
            aria-label={tr("Photo précédente")}
            onClick={() => g.aller(-1)}
          >
            <Icon name="chevron-gauche" taille={18} />
          </button>
          <button
            type="button"
            className="fiche7__surphoto fiche7__fleche fiche7__fleche--suiv"
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

/** La grande photo et le ruban de vignettes, dans la fenêtre. */
export function Visionneuse({
  g,
  source,
  ouvrirPlein,
  boutonPlein,
}: {
  g: Galerie;
  source: string;
  ouvrirPlein: () => void;
  boutonPlein: RefObject<HTMLButtonElement | null>;
}) {
  const ruban = useRef<HTMLDivElement>(null);
  const n = g.photos.length;

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
    <div className="fiche7__visionneuse">
      <Scene g={g} source={source} plein={false} ouvrirPlein={ouvrirPlein} boutonPlein={boutonPlein} />
      {n > 1 ? (
        <div ref={ruban} className="fiche7__ruban" aria-label={tr("Photos de l’annonce")}>
          {g.photos.map((u, j) => (
            <button
              key={u}
              type="button"
              className="fiche7__vignette"
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
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Le plein écran : la photo entière sur le voile, la même navigation. */
export function PleinEcran({
  g,
  source,
  fermer,
}: {
  g: Galerie;
  source: string;
  fermer: () => void;
}) {
  const croix = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    croix.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="fiche7__plein" role="dialog" aria-modal="true" aria-label={tr("Photos en plein écran")}>
      <Scene g={g} source={source} plein />
      <button
        ref={croix}
        type="button"
        className="fiche7__surphoto fiche7__plein-fermer"
        aria-label={tr("Quitter le plein écran")}
        title={tr("Quitter le plein écran")}
        onClick={fermer}
      >
        <Icon name="croix" taille={18} />
      </button>
    </div>
  );
}
