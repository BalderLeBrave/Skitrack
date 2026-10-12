/**
 * La carte Airbnb de la maquette (`Carte.dc.html`), commune aux stations et
 * aux logements : photo 20/19 arrondie de 18 px qui défile au survol (flèches
 * rondes et points), cœur en haut à droite **ou** rond « comparer », badge
 * facultatif en haut à gauche, puis quatre lignes : titre (et note étoilée),
 * deux lignes grises, prix gras suivi d'une mention grise, et un lien souligné
 * à droite du prix.
 *
 * Elle n'invente rien : chaque texte arrive déjà formaté et traduit. Les
 * photos viennent du dépôt (`stationPhoto`, photos d'annonce).
 */

import { memo, useState, type MouseEvent } from "react";
import { tr } from "@/lib/i18n";
import { IconeCoche, IconeCoeur, IconeDroite, IconeEtoile, IconeGauche, IconePlus } from "./traces";

export type PhotoCarte = {
  src: string;
  /** `object-position` CSS (« center 35% ») ; défaut : centre. */
  pos?: string;
};

export type CarteAnnonceProps = {
  /** Vide : le cadre garde son fond bleu clair, sans flèches ni points. */
  photos: readonly PhotoCarte[];
  title: string;
  /** Note déjà formatée (« 4,8 ») ; absente : pas d'étoile. */
  note?: string | null;
  l2: string;
  l3: string;
  /** Prix en gras (« 1 240 € »). */
  price: string;
  /** Mention grise après le prix (« pour 7 nuits », « forfait 6 j »). */
  priceSub?: string;
  /** Photo et titre ouvrent la fiche. */
  onOpen: () => void;
  /** Le cœur des favoris (voir `useEnregistrement`). Exclusif de `cmp`. */
  heart?: { saved: boolean; onToggle: () => void };
  /** Le rond « comparer » : + éteint, coche sur fond bleu allumé. */
  cmp?: { on: boolean; title: string; onToggle: () => void };
  /** Badge en haut à gauche de la photo (« 3 offres », nom de la source). */
  badge?: string | null;
  /** Lien souligné à droite du prix (« Retenir » / « Retenu », « Logements »). */
  link?: { label: string; on?: boolean; onClick: () => void };
  /** Mise en avant (épingle de carte survolée) : la photo s'entoure d'un anneau. */
  vif?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  className?: string;
};

const arreter = (e: MouseEvent) => e.stopPropagation();

export const CarteAnnonce = memo(function CarteAnnonce({
  photos,
  title,
  note,
  l2,
  l3,
  price,
  priceSub,
  onOpen,
  heart,
  cmp,
  badge,
  link,
  vif = false,
  onMouseEnter,
  onMouseLeave,
  className = "",
}: CarteAnnonceProps) {
  const n = photos.length;
  const [rang, setRang] = useState(0);
  const [ratees, setRatees] = useState<ReadonlySet<string>>(() => new Set());
  const i = Math.max(0, Math.min(rang, n - 1));
  const cur = n > 0 ? photos[i] : null;
  const montrer = cur && !ratees.has(cur.src) ? cur : null;

  return (
    <article
      className={`m8-carte${vif ? " m8-carte--vif" : ""} ${className}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="m8-carte__photo">
        <button type="button" className="m8-carte__ouvrir" aria-label={title} onClick={onOpen}>
          {montrer ? (
            <img
              src={montrer.src}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              style={montrer.pos ? { objectPosition: montrer.pos } : undefined}
              onError={() => setRatees((s) => new Set(s).add(montrer.src))}
            />
          ) : null}
        </button>
        {badge ? <span className="m8-carte__badge">{badge}</span> : null}
        {i > 0 ? (
          <button
            type="button"
            className="m8-carte__fleche m8-carte__fleche--g"
            aria-label={tr("Photo précédente")}
            onClick={(e) => {
              arreter(e);
              setRang(i - 1);
            }}
          >
            <IconeGauche />
          </button>
        ) : null}
        {i < n - 1 ? (
          <button
            type="button"
            className="m8-carte__fleche m8-carte__fleche--d"
            aria-label={tr("Photo suivante")}
            onClick={(e) => {
              arreter(e);
              setRang(i + 1);
            }}
          >
            <IconeDroite />
          </button>
        ) : null}
        {n > 1 ? (
          <div className="m8-carte__points" aria-hidden>
            {photos.map((p, k) => (
              <i key={k} className={k === i ? "m8-carte__point--on" : undefined} />
            ))}
          </div>
        ) : null}
        {heart ? (
          <button
            type="button"
            className={`m8-coeur${heart.saved ? " m8-coeur--on" : ""}`}
            aria-pressed={heart.saved}
            aria-label={heart.saved ? tr("Retirer des favoris") : tr("Enregistrer")}
            title={heart.saved ? tr("Retirer des favoris") : tr("Enregistrer")}
            onClick={(e) => {
              arreter(e);
              heart.onToggle();
            }}
          >
            <IconeCoeur />
          </button>
        ) : cmp ? (
          <button
            type="button"
            className={`m8-cmp${cmp.on ? " m8-cmp--on" : ""}`}
            aria-pressed={cmp.on}
            aria-label={cmp.title}
            title={cmp.title}
            onClick={(e) => {
              arreter(e);
              cmp.onToggle();
            }}
          >
            {cmp.on ? <IconeCoche /> : <IconePlus />}
          </button>
        ) : null}
      </div>
      <div className="m8-carte__texte">
        <div className="m8-carte__ligne1">
          <button type="button" className="m8-carte__titre" onClick={onOpen}>
            {title}
          </button>
          {note ? (
            <span className="m8-carte__note">
              <IconeEtoile />
              {note}
            </span>
          ) : null}
        </div>
        <span className="m8-carte__gris">{l2}</span>
        <span className="m8-carte__gris m8-carte__chiffres">{l3}</span>
        <div className="m8-carte__prix">
          <span className="m8-carte__chiffres">
            <b>{price}</b>
            {priceSub ? (
              <>
                {" "}
                <span className="m8-carte__sous">{priceSub}</span>
              </>
            ) : null}
          </span>
          {link ? (
            <button
              type="button"
              className={`m8-carte__lien${link.on ? " m8-carte__lien--on" : ""}`}
              aria-pressed={link.on ?? undefined}
              onClick={link.onClick}
            >
              {link.label}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
});
