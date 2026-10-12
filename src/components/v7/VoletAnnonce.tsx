/**
 * La fiche d'une annonce, dans une fenêtre flottante posée sur la page : la
 * page reste visible derrière, floutée et assombrie. Maquette « Fiche
 * Logement » du 12 oct. 2026 : en haut un en-tête collant (retour à la
 * station, séjour, commandes) ; la mosaïque de photos ; dessous, deux
 * colonnes : les informations à gauche, la carte de prix à droite, qui reste
 * en vue au défilement. Toute la fenêtre défile.
 *
 * Sous 940 px de large, les colonnes passent l'une sous l'autre et une barre
 * en bas porte le prix et « Retenir ».
 *
 * Hors de la route pour que l'onglet « Par budget » de Prix, les Favoris et
 * l'écran Traces ouvrent la même fiche que Logements.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { BoutonFavori } from "@/components/v7/BoutonFavori";
import { useEchap } from "@/components/v7/fermeture";
import {
  BlocAcces,
  BlocAnnonce,
  BlocAvis,
  BlocConditions,
  BlocEmplacement,
  BlocFaits,
  BlocNonIndique,
  BlocTitre,
  CartePrix,
} from "@/components/v7/FicheBlocs";
import { resumePrix } from "@/components/v7/fiche/resumePrix";
import { OffresLogement } from "@/components/v7/OffresLogement";
import { TAILLE_FENETRE, TAILLE_PLEIN, useGalerie } from "@/components/v7/useGalerie";
import { useTracesPistes } from "@/components/v7/useTracesPistes";
import { Mosaique, PleinEcran } from "@/components/v7/Visionneuse";
import type { BudgetForfaits } from "@/lib/forfaits/prixSejour";
import { useAltitudes } from "@/lib/altitude/store";
import { tr } from "@/lib/i18n";
import type { Listing } from "@/lib/listings";
import { datesCourtes, nuitsLbl } from "@/lib/parcours";
import { rangApresTab } from "@/lib/piegeFocus";
import { stationById } from "@/lib/stations";
import { galerieOf } from "@/lib/stay/completude";
import { stationDuLogement } from "@/lib/stay/parStation";
import type { Logement } from "@/lib/stay/regroupement";
import { persLbl } from "@/lib/v7";

/** Les commandes atteignables au clavier : hors des parties rendues inertes
 *  (la fiche derrière la visionneuse). */
const COMMANDES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), summary';

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
  complementsAcces,
}: {
  l: Listing;
  stay: { checkIn: string; checkOut: string };
  trav: number;
  nights: number;
  /** Le logement sur toutes ses plateformes, ou null. */
  groupe: Logement | null;
  /** Cette annonce est le logement retenu. */
  retenu: boolean;
  onRetenir: () => void;
  onFermer: () => void;
  /** Ouvre une autre offre du même logement. */
  onVoirOffre: (id: string) => void;
  /**
   * Une action de plus sous « Retenir » et « Réserver » (Prix y met
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
  /** Des mesures de plus sous le schéma d'accès (`<li>`) : la trace GPX de Traces. */
  complementsAcces?: ReactNode;
}) {
  useEchap(true, onFermer);
  const titreId = useId();
  const racine = useRef<HTMLDivElement>(null);
  const boite = useRef<HTMLDivElement>(null);
  const ouvreur = useRef<HTMLElement | null>(null);
  const appuiDehors = useRef(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const toutes = useMemo(() => galerieOf(l), [l.photo, l.photos]);
  const [plein, setPlein] = useState(false);
  const g = useGalerie(l.id, toutes, plein ? TAILLE_PLEIN : TAILLE_FENETRE);
  const { choisir } = g;
  const ouvrirPlein = useCallback(
    (i: number) => {
      ouvreur.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      choisir(i);
      setPlein(true);
    },
    [choisir],
  );
  const fermerPlein = useCallback(() => {
    setPlein(false);
    // Le focus revient à la photo ou au bouton qui a ouvert la visionneuse.
    requestAnimationFrame(() => ouvreur.current?.focus({ preventScroll: true }));
  }, []);
  // Une autre annonce ferme la visionneuse.
  useEffect(() => setPlein(false), [l.id]);

  const altDe = useAltitudes(useMemo(() => [l], [l]));
  const altitude = altDe(l);
  const stationId = stationDuLogement(l, l.stationId);
  const station = stationById(stationId);
  const traces = useTracesPistes(stationId);
  // Les forfaits ne s'ajoutent pas d'office : la case de la carte de prix les
  // ajoute, et la barre du bas suit.
  const [avecForfaits, setAvecForfaits] = useState(false);
  const [mode, setMode] = useState<"total" | "pers">("total");
  const barre = resumePrix(l, forfaits, avecForfaits, trav, nights, mode);

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
    const focusAvant =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    html.style.overflow = "hidden";
    boite.current?.focus({ preventScroll: true });
    return () => {
      html.style.overflow = avant;
      rendreFocus(offres.current, focusAvant);
    };
  }, []);

  // Le focus reste dans la fenêtre. Une fenêtre ouverte par-dessus (le choix
  // du dossier des favoris) tient le sien : on ne piège que la fenêtre du
  // dessus, visionneuse comprise.
  const dessus = useCallback(() => {
    const el = racine.current;
    const modales = document.querySelectorAll('[aria-modal="true"]');
    const haut = modales[modales.length - 1];
    return !!el && !!haut && el.contains(haut);
  }, []);
  useEffect(() => {
    const el = racine.current;
    if (!el) return;
    const tab = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !dessus()) return;
      const cs = commandes(el);
      const r = rangApresTab(
        cs.length,
        cs.indexOf(document.activeElement as HTMLElement),
        e.shiftKey,
      );
      if (r == null) return;
      e.preventDefault();
      (r < 0 ? (boite.current ?? el) : cs[r]).focus();
    };
    const entree = (e: FocusEvent) => {
      if (dessus() && e.target instanceof Node && !el.contains(e.target))
        boite.current?.focus({ preventScroll: true });
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
    boite.current?.scrollTo({ top: 0 });
  }, []);
  useEffect(() => {
    const el = boite.current;
    if (el && !racine.current?.contains(document.activeElement)) el.focus({ preventScroll: true });
  }, [l.id]);

  // Le clavier : dans la visionneuse, les flèches changent de photo ; dans la
  // fenêtre, Maj+flèches changent de logement. Un champ qui a le focus garde
  // ses flèches.
  const { aller } = g;
  useEffect(() => {
    const fleches = (e: KeyboardEvent) => {
      if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || e.altKey || e.ctrlKey || e.metaKey)
        return;
      if (!dessus() || (e.target instanceof Element && e.target.closest("input, select, textarea")))
        return;
      const sens = e.key === "ArrowRight" ? 1 : -1;
      if (plein) {
        e.preventDefault();
        aller(sens);
      } else if (e.shiftKey) {
        e.preventDefault();
        voisin(sens === 1 ? onSuivant : onPrecedent);
      }
    };
    document.addEventListener("keydown", fleches);
    return () => document.removeEventListener("keydown", fleches);
  }, [aller, dessus, plein, voisin, onPrecedent, onSuivant]);

  // Dans la visionneuse, Échap ramène à la fenêtre sans la fermer : l'écoute
  // passe avant celle de la fenêtre (`useEchap`, sur le document) et s'y arrête.
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

  const sejour = [datesCourtes(stay.checkIn, stay.checkOut), nuitsLbl(nights), persLbl(trav)].join(
    " · ",
  );

  return (
    // Le clic dans le flou ferme : il doit commencer et finir dehors, pour
    // qu'une sélection de texte lâchée hors de la fenêtre ne la ferme pas.
    <div
      ref={racine}
      className="fl"
      onMouseDown={(e) => {
        appuiDehors.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (appuiDehors.current && e.target === e.currentTarget) onFermer();
        appuiDehors.current = false;
      }}
    >
      <div
        ref={boite}
        className="fl-boite"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titreId}
        tabIndex={-1}
        inert={plein}
      >
        <header className="fl-tete">
          <button type="button" className="fl-retour" onClick={onFermer} title={tr("Fermer")}>
            <Icon name="chevron-gauche" taille={14} />
            <span>{station?.name ?? tr("Fermer")}</span>
          </button>
          <span className="fl-tete__sejour">{sejour}</span>
          <div className="fl-tete__outils">
            <span className="fl-message" role="status">
              {message?.texte ?? ""}
            </span>
            <button
              type="button"
              className="fl-rond"
              onClick={partager}
              disabled={!l.url}
              aria-label={tr("Partager")}
              title={l.url ? tr("Partager") : tr("Annonce sans lien")}
            >
              <Icon name="partager" taille={15} />
            </button>
            <BoutonFavori
              l={l}
              sejour={{ checkIn: stay.checkIn, checkOut: stay.checkOut, trav }}
              className="fl-rond fl-coeur"
            />
            <button
              type="button"
              className="fl-rond"
              aria-label={tr("Logement précédent")}
              title={tr("Logement précédent")}
              disabled={!onPrecedent}
              onClick={() => voisin(onPrecedent)}
            >
              <Icon name="chevron-gauche" taille={16} />
            </button>
            <button
              type="button"
              className="fl-rond"
              aria-label={tr("Logement suivant")}
              title={tr("Logement suivant")}
              disabled={!onSuivant}
              onClick={() => voisin(onSuivant)}
            >
              <Icon name="chevron-droite" taille={16} />
            </button>
            <button
              type="button"
              className="fl-rond"
              aria-label={tr("Fermer")}
              title={tr("Fermer")}
              onClick={onFermer}
            >
              <Icon name="croix" taille={14} />
            </button>
          </div>
        </header>

        <div className="fl-corps">
          <Mosaique g={g} source={l.source} ouvrir={ouvrirPlein} />
          <div className="fl-grille">
            <div className="fl-gauche">
              <BlocTitre l={l} station={station?.name ?? null} titreId={titreId} />
              <BlocFaits l={l} altitude={altitude} />
              <BlocAcces
                l={l}
                altitude={altitude}
                traces={traces}
                station={station}
                complements={complementsAcces}
              />
              <BlocAnnonce key={l.id} l={l} />
              <BlocNonIndique l={l} />
              {groupe && groupe.offres.length > 1 ? (
                <OffresLogement g={groupe} ici={l.id} voir={onVoirOffre} />
              ) : null}
              <BlocEmplacement l={l} />
              <BlocAvis l={l} />
              <BlocConditions l={l} />
            </div>

            <aside className="fl-cote" aria-label={tr("Prix du séjour")}>
              <CartePrix
                l={l}
                stay={stay}
                trav={trav}
                nights={nights}
                forfaits={forfaits}
                forfaitsMotif={forfaitsMotif}
                avecForfaits={avecForfaits}
                setAvecForfaits={setAvecForfaits}
                mode={mode}
                setMode={setMode}
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
        <div className="fl-barre">
          <div className="fl-barre__prix">
            <b>{barre.principal}</b>
            <span>{barre.detail}</span>
          </div>
          <button
            type="button"
            className={`fl-retenir${retenu ? " fl-retenir--on" : ""}`}
            aria-pressed={retenu}
            onClick={onRetenir}
          >
            {retenu ? tr("Retenu") : tr("Retenir")}
          </button>
        </div>
      </div>
      {plein ? <PleinEcran g={g} titre={l.title} fermer={fermerPlein} /> : null}
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
