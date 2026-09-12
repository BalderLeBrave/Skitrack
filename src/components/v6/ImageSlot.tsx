/** Portage de design/v6/image-slot.js (hash e30189ba…) vers le pipeline photo
 *  du dépôt : mêmes attributs, même DOM interne, mêmes états.
 *
 *  Deux chaînes anglaises du composant d'origine sont parties : « or browse
 *  files », qui vivait dans un bloc jamais affiché hors du runtime d'édition, et
 *  « This photo needs attribution », devenue française. Aucune n'était visible à
 *  l'écran, toutes deux l'étaient dans le DOM, à une règle de style près.
 *
 *  Hors du runtime « omelette », le composant d'origine est en lecture seule
 *  (`editable = !!(window.omelette && window.omelette.writeFile)`, l. 1088) :
 *  ni dépôt de fichier, ni recadrage, ni sidecar. C'est ce comportement-là
 *  qui est porté. Ce qui reste : le dimensionnement, l'état vide, l'état
 *  rempli (`fit` cover/contain, cadrage neutre s=1 x=0 y=0), la tuile
 *  d'erreur d'attribution Unsplash et le crédit avec ses paramètres de
 *  référence. Le shadow DOM devient des classes `.islot__*` (v6.css). */

import type { CSSProperties } from "react";

type Shape = "rect" | "rounded" | "circle" | "pill";

export type ImageSlotProps = {
  /** Clé de persistance de l'original ; ici, l'`id` du DOM. */
  id: string;
  placeholder?: string;
  src?: string | null;
  credit?: string;
  creditHref?: string;
  shape?: Shape;
  radius?: number;
  mask?: string;
  fit?: "cover" | "contain";
  className?: string;
  style?: CSSProperties;
};

const UNSPLASH_HOMEPAGE_HREF = "https://unsplash.com/?utm_source=claude_design&utm_medium=referral";

/** l. 118–126 : apex ou sous-domaine d'unsplash.com, point final retiré. */
function isUnsplashHost(u: string): boolean {
  try {
    const base = typeof document !== "undefined" ? document.baseURI : "http://localhost/";
    return /(^|\.)unsplash\.com$/.test(new URL(u, base).hostname.replace(/\.$/, ""));
  } catch {
    return false;
  }
}

/** l. 131–148 : ajoute utm_source / utm_medium aux liens vers unsplash.com. */
function withReferral(href: string): string {
  try {
    const u = new URL(href);
    if (!/(^|\.)unsplash\.com$/.test(u.hostname.replace(/\.$/, ""))) return href;
    if (!u.searchParams.has("utm_source")) u.searchParams.set("utm_source", "claude_design");
    if (!u.searchParams.has("utm_medium")) u.searchParams.set("utm_medium", "referral");
    return u.toString();
  } catch {
    return href;
  }
}

/** l. 1073–1084 : rayon selon `shape`, `mask` prime et masque l'anneau. */
function frameRadius(shape: Shape, radius: number | undefined): string {
  if (shape === "circle") return "50%";
  if (shape === "pill") return "9999px";
  if (shape === "rounded") return (Number.isFinite(radius) ? (radius as number) : 12) + "px";
  return "";
}

const Icon = () => (
  <svg
    width="28"
    height="28"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="m21 15-5-5L5 21" />
  </svg>
);

const WarnIcon = () => (
  <svg
    width="28"
    height="28"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </svg>
);

export function ImageSlot({
  id,
  placeholder = "Aucune photo",
  src,
  credit,
  creditHref,
  shape = "rounded",
  radius,
  mask,
  fit = "cover",
  className,
  style,
}: ImageSlotProps) {
  const srcAttr = src ?? "";
  const creditText = (credit ?? "").trim();
  // l. 1120–1124 : un src Unsplash sans crédit ne se rend pas.
  const attrError = !creditText && !!srcAttr && isUnsplashHost(srcAttr);
  const url = srcAttr;
  const filled = !!url && !attrError;
  const showCredit = !!(url && creditText && !attrError);

  let href = "";
  if (showCredit && creditHref) {
    try {
      const base = typeof document !== "undefined" ? document.baseURI : "http://localhost/";
      const u = new URL(creditHref, base);
      if (u.protocol === "http:" || u.protocol === "https:") href = withReferral(u.href);
    } catch {
      href = "";
    }
  }
  const unsplashForm = /^Photo by (.+) on Unsplash$/.exec(creditText);
  const link = (text: string, linkHref: string) => (
    <a target="_blank" rel="noopener noreferrer" href={linkHref}>
      {text}
    </a>
  );

  const rad = mask ? "" : frameRadius(shape, radius);

  return (
    <div
      id={id}
      className={`islot${className ? " " + className : ""}`}
      style={style}
      data-fit={fit}
      data-filled={filled ? "" : undefined}
      data-credit={showCredit ? "" : undefined}
      data-attribution-error={attrError ? "" : undefined}
    >
      <div className="islot__frame" style={{ borderRadius: rad, clipPath: mask || undefined }}>
        {/* Pas de photo, pas d'`img` : un `<img>` sans `src`, même masqué, reste
            une image cassée pour le navigateur et pour tout outil qui l'audite. */}
        {filled ? <img className="islot__img" alt="" draggable={false} src={url} /> : null}
        <div className="islot__empty" style={{ display: filled || attrError ? "none" : "flex" }}>
          <Icon />
          <div className="islot__cap">{placeholder}</div>
        </div>
        <div className="islot__attr">
          <WarnIcon />
          <div className="islot__cap">Photo sans crédit : elle ne s’affiche pas.</div>
        </div>
        <div
          className="islot__ring"
          style={{ borderRadius: rad, display: mask ? "none" : undefined }}
        />
      </div>
      <span className="islot__credit">
        {showCredit
          ? unsplashForm
            ? [
                "Photo by ",
                href ? link(unsplashForm[1], href) : unsplashForm[1],
                " on ",
                link("Unsplash", UNSPLASH_HOMEPAGE_HREF),
              ]
            : href
              ? link(creditText, href)
              : creditText
          : null}
      </span>
    </div>
  );
}
