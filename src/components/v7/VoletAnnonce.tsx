/**
 * La fiche d'une annonce, dans une fenêtre posée sur la page : la page reste
 * visible derrière, floutée et assombrie. En haut un en-tête fixe (titre,
 * station, dates, voyageurs, et les commandes) ; dessous, le contenu défile
 * dans la fenêtre, en deux colonnes : les photos et les informations à
 * gauche, la carte de prix à droite, qui reste en vue au défilement.
 *
 * Demandée par le propriétaire le 6 oct. 2026 à la place de la fiche plein
 * écran du 5 oct. Sous 940 px de large, la fenêtre prend tout l'écran, les
 * colonnes passent l'une sous l'autre et une barre en bas porte le prix et
 * « Retenir ».
 *
 * Hors de la route pour que l'onglet « Par budget » de Prix et les Favoris
 * ouvrent la même fiche que Logements.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { BoutonFavori } from "@/components/v7/BoutonFavori";
import { useEchap } from "@/components/v7/fermeture";
import { BlocAcces, BlocAnnonce, BlocBadges, BlocEmplacement, BlocFaits, BlocNonIndique, CartePrix } from "@/components/v7/FicheBlocs";
import { OffresLogement } from "@/components/v7/OffresLogement";
import { TAILLE_FENETRE, TAILLE_PLEIN, useGalerie } from "@/components/v7/useGalerie";
import { useTracesPistes } from "@/components/v7/useTracesPistes";
import { PleinEcran, Visionneuse } from "@/components/v7/Visionneuse";
import type { BudgetForfaits } from "@/lib/forfaits/prixSejour";
import { useAltitudes } from "@/lib/altitude/store";
import { tr } from "@/lib/i18n";
import type { Listing } from "@/lib/listings";
import { datesCourtes, eurCents, nuitsLbl, travLbl } from "@/lib/parcours";
import { rangApresTab } from "@/lib/piegeFocus";
import { stationById } from "@/lib/stations";
import { galerieOf } from "@/lib/stay/completude";
import { stationDuLogement } from "@/lib/stay/parStation";
import type { Logement } from "@/lib/stay/regroupement";
import { parPersonne, totalSejour } from "@/lib/stay/totalSejour";
import { prixLbl } from "@/lib/v7";

/** Les commandes atteignables au clavier : hors des parties rendues inertes
 *  (la fiche derrière le plein écran). */
const COMMANDES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Durée du message « Lien de l'annonce copié ». */
const MESSAGE_MS = 2500;

export function VoletAnnonce({
  l,
  stay,
  trav,
  nights,
  groupe,
  retenu,
  onRetenir,
  onFermer,
  onVoirOffre,
  suite,
  onPrecedent,
  onSuivant,
  forfaits,
  forfaitsMotif,
}: {
  l: Listing;
  stay: { checkIn: string; checkOut: string };
  trav: number;
  nights: number;
  /** Le logement sur toutes ses plateformes, ou null : « Ce logement sur N plateformes ». */
  groupe: Logement | null;
  /** Cette annonce est le logement retenu. */
  retenu: boolean;
  onRetenir: () => void;
  onFermer: () => void;
  /** Ouvre une autre offre du même logement. */
  onVoirOffre: (id: string) => void;
  /**
   * Une action de plus sous « Retenir » et « Ouvrir sur … » (Prix y met
   * « Passer à la réservation »).
   */
  suite?: ReactNode;
  /** Le logement d'avant dans la liste affichée ; absent au premier, et le
   *  bouton se désactive. */
  onPrecedent?: (() => void) | null;
  /** Le logement d'après ; absent au dernier. */
  onSuivant?: (() => void) | null;
  /** Les forfaits du groupe pour ce séjour : `undefined` pendant le calcul,
   *  `null` quand ils ne se calculent pas (`forfaitsMotif` dit pourquoi). */
  forfaits?: BudgetForfaits | null;
  forfaitsMotif?: string | null;
}) {
  useEchap(true, onFermer);
  const titreId = useId();
  const boite = useRef<HTMLDivElement>(null);
  const corps = useRef<HTMLDivElement>(null);
  const boutonPlein = useRef<HTMLButtonElement>(null);
  const appuiDehors = useRef(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const toutes = useMemo(() => galerieOf(l), [l.photo, l.photos]);
  const [plein, setPlein] = useState(false);
  const g = useGalerie(l.id, toutes, plein ? TAILLE_PLEIN : TAILLE_FENETRE);
  const fermerPlein = useCallback(() => {
    setPlein(false);
    // Le focus revient au bouton qui a ouvert le plein écran.
    requestAnimationFrame(() => boutonPlein.current?.focus({ preventScroll: true }));
  }, []);
  const altDe = useAltitudes(useMemo(() => [l], [l]));
  const altitude = altDe(l);
  const stationId = stationDuLogement(l, l.stationId);
  const station = stationById(stationId)?.name ?? null;
  const traces = useTracesPistes(stationId);
  // Les forfaits s'ajoutent par défaut quand ils sont connus ; la case de la
  // carte de prix les retire, et la barre du bas suit.
  const [avecForfaits, setAvecForfaits] = useState(true);
  const barre = totalSejour(l, forfaits, avecForfaits);
  const barreParPers = parPersonne(barre.total, trav);

  // À la fermeture, le focus revient à la carte du logement : celle de
  // l'offre affichée, ou celle d'une autre offre du même logement (la liste ne
  // montre que la moins chère). Les identifiants se lisent au moment de
  // fermer, après un éventuel passage d'une offre à l'autre.
  const offres = useRef<string[]>([]);
  offres.current = [l.id, ...(groupe?.offres.map((o) => o.id) ?? [])];

  // La page ne défile plus sous la fenêtre, et le focus entre dans la fenêtre.
  useEffect(() => {
    const html = document.documentElement;
    const avant = html.style.overflow;
    const focusAvant = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    html.style.overflow = "hidden";
    boite.current?.focus({ preventScroll: true });
    return () => {
      html.style.overflow = avant;
      rendreFocus(offres.current, focusAvant);
    };
  }, []);

  // Le focus reste dans la fenêtre. Une fenêtre ouverte par-dessus (le choix
  // du dossier des favoris) tient le sien : on ne piège que la fenêtre du
  // dessus, plein écran compris (il vit dans la fenêtre).
  const dessus = useCallback(() => {
    const el = boite.current;
    const modales = document.querySelectorAll('[aria-modal="true"]');
    const haut = modales[modales.length - 1];
    return !!el && !!haut && el.contains(haut);
  }, []);
  useEffect(() => {
    const el = boite.current;
    if (!el) return;
    const tab = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !dessus()) return;
      const cs = commandes(el);
      const r = rangApresTab(cs.length, cs.indexOf(document.activeElement as HTMLElement), e.shiftKey);
      if (r == null) return;
      e.preventDefault();
      (r < 0 ? el : cs[r]).focus();
    };
    const entree = (e: FocusEvent) => {
      if (dessus() && e.target instanceof Node && !el.contains(e.target)) el.focus({ preventScroll: true });
    };
    document.addEventListener("keydown", tab);
    document.addEventListener("focusin", entree);
    return () => {
      document.removeEventListener("keydown", tab);
      document.removeEventListener("focusin", entree);
    };
  }, [dessus]);

  // Passer au logement voisin : la fiche repart du haut, et le focus reste
  // dans la fenêtre si le bouton se désactive au bout de la liste.
  const voisin = useCallback((aller: (() => void) | null | undefined) => {
    if (!aller) return;
    aller();
    corps.current?.scrollTo({ top: 0 });
  }, []);
  useEffect(() => {
    const el = boite.current;
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
  }, [l.id]);

  // Le clavier : les flèches seules changent de photo, Maj+flèches de
  // logement (pas en plein écran, où l'on regarde les photos d'une annonce).
  // Une liste ou un champ qui a le focus garde ses flèches.
  const { aller } = g;
  useEffect(() => {
    const fleches = (e: KeyboardEvent) => {
      if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || e.altKey || e.ctrlKey || e.metaKey) return;
      if (!dessus() || (e.target instanceof Element && e.target.closest("input, select, textarea"))) return;
      const sens = e.key === "ArrowRight" ? 1 : -1;
      e.preventDefault();
      if (!e.shiftKey) aller(sens);
      else if (!plein) voisin(sens === 1 ? onSuivant : onPrecedent);
    };
    document.addEventListener("keydown", fleches);
    return () => document.removeEventListener("keydown", fleches);
  }, [aller, dessus, plein, voisin, onPrecedent, onSuivant]);

  // En plein écran, Échap ramène à la fenêtre sans la fermer : l'écoute passe
  // avant celle de la fenêtre (`useEchap`, sur le document) et s'y arrête.
  useEffect(() => {
    if (!plein) return;
    const echap = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      fermerPlein();
    };
    window.addEventListener("keydown", echap, true);
    return () => window.removeEventListener("keydown", echap, true);
  }, [plein, fermerPlein]);

  // « Lien de l'annonce copié » : un message bref, qui s'efface seul.
  const [message, setMessage] = useState<{ texte: string; n: number } | null>(null);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), MESSAGE_MS);
    return () => clearTimeout(t);
  }, [message]);
  const partager = () => {
    if (!l.url) return;
    const dire = (texte: string) => setMessage((m) => ({ texte, n: (m?.n ?? 0) + 1 }));
    navigator.clipboard
      .writeText(l.url)
      .then(() => dire(tr("Lien de l’annonce copié")))
      .catch(() => dire(tr("Le lien n’a pas pu être copié")));
  };

  const boutonRetenir = (grand: boolean) => (
    <button
      type="button"
      className={`btn7${grand ? " btn7--grand btn7--pleine" : ""}${retenu ? " btn7--tenu" : " btn7--encre"}`}
      onClick={onRetenir}
    >
      {retenu ? tr("Retenu") : tr("Retenir")}
    </button>
  );

  return (
    // Le clic dans le flou ferme : il doit commencer et finir dehors, pour
    // qu'une sélection de texte lâchée hors de la fenêtre ne la ferme pas.
    <div
      className="fiche7"
      onMouseDown={(e) => {
        appuiDehors.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (appuiDehors.current && e.target === e.currentTarget) onFermer();
        appuiDehors.current = false;
      }}
    >
      <div ref={boite} className="fiche7__boite" role="dialog" aria-modal="true" aria-labelledby={titreId} tabIndex={-1}>
        <header className="fiche7__tete" inert={plein}>
          <div className="fiche7__titres">
            <h2 id={titreId}>{l.title}</h2>
            <p>{[station, datesCourtes(stay.checkIn, stay.checkOut), travLbl(trav)].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="fiche7__outils">
            <span className="fiche7__message" role="status">
              {message?.texte ?? ""}
            </span>
            <button
              type="button"
              className="fiche7__outil"
              onClick={partager}
              disabled={!l.url}
              aria-label={tr("Partager")}
              title={l.url ? tr("Partager") : tr("Annonce sans lien")}
            >
              <Icon name="partager" taille={16} />
              <span>{tr("Partager")}</span>
            </button>
            <BoutonFavori
              l={l}
              sejour={{ checkIn: stay.checkIn, checkOut: stay.checkOut, trav }}
              className="fiche7__outil fiche7__coeur"
              libelle
            />
            <span className="fiche7__sep" aria-hidden />
            <button
              type="button"
              className="fiche7__rond"
              aria-label={tr("Logement précédent")}
              title={tr("Logement précédent")}
              disabled={!onPrecedent}
              onClick={() => voisin(onPrecedent)}
            >
              <Icon name="chevron-gauche" taille={18} />
            </button>
            <button
              type="button"
              className="fiche7__rond"
              aria-label={tr("Logement suivant")}
              title={tr("Logement suivant")}
              disabled={!onSuivant}
              onClick={() => voisin(onSuivant)}
            >
              <Icon name="chevron-droite" taille={18} />
            </button>
          </div>
          <button type="button" className="fiche7__rond fiche7__fermer" aria-label={tr("Fermer")} title={tr("Fermer")} onClick={onFermer}>
            <Icon name="croix" taille={16} />
          </button>
        </header>

        <div ref={corps} className="fiche7__corps" inert={plein}>
          <div className="fiche7__grille">
            <div className="fiche7__gauche">
              <Visionneuse g={g} source={l.source} ouvrirPlein={() => setPlein(true)} boutonPlein={boutonPlein} />
              <BlocBadges l={l} stay={stay} />
              <BlocFaits l={l} altitude={altitude} />
              <BlocAcces l={l} altitude={altitude} traces={traces} />
              <BlocAnnonce l={l} />
              <BlocNonIndique l={l} />
              {groupe && groupe.offres.length > 1 ? (
                <OffresLogement g={groupe} ici={l.id} voir={onVoirOffre} />
              ) : null}
              <BlocEmplacement l={l} />
            </div>

            <aside className="fiche7__cote" aria-label={tr("Prix du séjour")}>
              <CartePrix
                l={l}
                stay={stay}
                trav={trav}
                nights={nights}
                forfaits={forfaits}
                forfaitsMotif={forfaitsMotif}
                avecForfaits={avecForfaits}
                setAvecForfaits={setAvecForfaits}
                groupe={groupe}
                retenu={retenu}
                onRetenir={onRetenir}
                onVoirOffre={onVoirOffre}
                suite={suite}
              />
            </aside>
          </div>
        </div>

        {/* Sous 940 px seulement : le prix et « Retenir » restent sous le pouce. */}
        <div className="fiche7__barre" inert={plein}>
          <div className="fiche7__barre-prix">
            <b>{barre.total != null ? eurCents(barre.total) : prixLbl(l)}</b>
            <span>
              {[
                barreParPers != null ? tr("{prix} par personne", { prix: eurCents(barreParPers) ?? "" }) : nuitsLbl(nights),
                barre.forfaitsAjoutes ? tr("avec les forfaits") : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          {boutonRetenir(false)}
        </div>
        {plein ? <PleinEcran g={g} source={l.source} fermer={fermerPlein} /> : null}
      </div>
    </div>
  );
}

/** Les commandes atteignables au clavier dans la fenêtre, dans l'ordre. */
function commandes(el: HTMLElement): HTMLElement[] {
  return [...el.querySelectorAll<HTMLElement>(COMMANDES)].filter(
    (c) => !c.closest("[inert]") && c.getClientRects().length > 0,
  );
}

/**
 * Rend le focus à la carte du logement dans la liste, sinon à ce qui l'avait
 * avant l'ouverture (un bouton « Voir l'annonce », une ligne de tableau).
 * La carte n'est pas une commande : elle reçoit un `tabindex` de -1 pour
 * pouvoir prendre le focus sans entrer dans l'ordre de tabulation.
 */
function rendreFocus(ids: readonly string[], avant: HTMLElement | null) {
  for (const id of ids) {
    const carte = document.querySelector<HTMLElement>(`[data-l="${CSS.escape(id)}"]`);
    if (!carte) continue;
    if (!carte.hasAttribute("tabindex")) carte.setAttribute("tabindex", "-1");
    carte.focus();
    return;
  }
  if (avant?.isConnected) avant.focus();
}
