/**
 * Les webcams d'une fiche station : une caméra à la fois, sur toute la largeur
 * de la carte, et en grand par-dessus la page.
 *
 * Le flux reste chez l'exploitant. Un lecteur s'affiche dans un `iframe`, une
 * image fixe que l'exploitant rafraîchit dans un `img` : ni copie ni
 * réencodage.
 *
 * Le lecteur d'un fournisseur pèse plusieurs mégaoctets et met plusieurs
 * secondes à s'afficher. Chez Skaping et Webcam-HD, la fiche montre d'abord la
 * dernière image publiée (`webcamApercu.ts`), quelques centaines de kilo-octets,
 * qu'on fait défiler ; le lecteur ne se charge qu'à la demande. Passer d'une
 * caméra à l'autre ne charge plus qu'une image.
 *
 * Un `iframe` d'un autre domaine ne signale pas son échec : `onerror` ne se
 * déclenche pas et son contenu est illisible. On l'attend donc, et faute de
 * `onload` dans le délai on propose de l'ouvrir chez l'exploitant. Le délai ne
 * court qu'une fois le cadre à l'écran : le lecteur se charge à la demande
 * (`loading="lazy"`), et un délai parti au montage de la fiche déclarait muette
 * une caméra que personne n'avait encore fait défiler jusqu'à elle.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { useEchap } from "@/components/v7/fermeture";
import { aStation } from "@/lib/v7";
import type { Webcam } from "@/lib/webcams";
import { fournisseurApercu, type Apercu } from "@/lib/webcamApercu";
import { getApercuWebcam } from "@/lib/webcamApercu.api";

const DELAI_MS = 10_000;

type Etat = "attente" | "ok" | "echec";

/** Vrai dès que l'élément a paru à l'écran, et le reste. */
function useParu(ref: React.RefObject<HTMLElement | null>, cle: string): boolean {
  const [paru, setParu] = useState(false);
  useEffect(() => {
    setParu(false);
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setParu(true);
      return;
    }
    const io = new IntersectionObserver((entrees) => {
      if (entrees.some((e) => e.isIntersecting)) {
        setParu(true);
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, cle]);
  return paru;
}

/** Les aperçus déjà lus, pour revenir à une caméra sans redemander. */
const APERCUS = new Map<string, { fin: number; valeur: Promise<Apercu> }>();
function lireApercu(url: string): Promise<Apercu> {
  const deja = APERCUS.get(url);
  if (deja && deja.fin > Date.now()) return deja.valeur;
  const valeur = getApercuWebcam({ data: { url } }).catch((): Apercu => ({ image: null, prise: null }));
  APERCUS.set(url, { fin: Date.now() + 5 * 60_000, valeur });
  return valeur;
}

/** « aujourd'hui à 14 h 50 », « le 29 sept. à 8 h 10 ». */
function datePrise(p: NonNullable<Apercu["prise"]>): string {
  const [h, m] = p.heure.split(":");
  const heure = `${Number(h)}\u00a0h\u00a0${m}`;
  const aujourdhui = new Date().toLocaleDateString("sv-SE");
  if (p.jour === aujourdhui) return `aujourd’hui à ${heure}`;
  const jour = new Date(`${p.jour}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return `le ${jour} à ${heure}`;
}

/** Le flux d'une caméra et ce qu'on sait de son chargement. */
function Flux({ cam, grand = false }: { cam: Webcam; grand?: boolean }) {
  const cadre = useRef<HTMLDivElement>(null);
  const [etat, setEtat] = useState<Etat>("attente");
  const paru = useParu(cadre, cam.url);
  // L'aperçu d'abord, le lecteur à la demande (voir l'en-tête du fichier).
  const avecApercu = cam.kind !== "image" && fournisseurApercu(cam.url) != null;
  const [lecteur, setLecteur] = useState<string | null>(null);
  const [apercu, setApercu] = useState<{ url: string; a: Apercu } | null>(null);
  const [imageKo, setImageKo] = useState<string | null>(null);
  // Le lecteur n'est monté qu'une fois la page hydratée. Rendu par le serveur,
  // il pouvait se charger avant que React n'écoute `onLoad` : l'événement
  // était perdu, et au bout du délai l'avis d'échec recouvrait une caméra qui
  // marchait.
  const [monte, setMonte] = useState(false);
  useEffect(() => setMonte(true), []);

  useEffect(() => {
    setEtat("attente");
  }, [cam.url]);
  useEffect(() => {
    if (!avecApercu || !monte) return;
    let vivant = true;
    void lireApercu(cam.url).then((a) => vivant && setApercu({ url: cam.url, a }));
    return () => {
      vivant = false;
    };
  }, [cam.url, avecApercu, monte]);
  const a = apercu?.url === cam.url ? apercu.a : null;
  // Sans image lisible, ou si elle ne se charge pas, le lecteur comme avant.
  const enApercu = avecApercu && lecteur !== cam.url && !(a && !a.image) && imageKo !== cam.url;

  useEffect(() => {
    // Une image dit elle-même si elle a échoué ; seul le lecteur s'attend.
    if (cam.kind === "image" || enApercu || !paru || !monte) return;
    const t = setTimeout(() => setEtat((e) => (e === "attente" ? "echec" : e)), DELAI_MS);
    return () => clearTimeout(t);
  }, [cam.url, cam.kind, enApercu, paru, monte]);

  return (
    <div ref={cadre} className={grand ? "webcam7 webcam7--grand" : "webcam7"}>
      {!monte ? null : enApercu ? (
        a?.image ? (
          <>
            <div
              className="webcam7__pano"
              tabIndex={0}
              role="region"
              aria-label={`Dernière image : ${cam.label}, panorama à faire défiler`}
            >
              <img
                key={a.image}
                src={a.image}
                alt={`Webcam : ${cam.label}, dernière image`}
                referrerPolicy="no-referrer"
                decoding="async"
                onLoad={(e) => {
                  // Le panorama s'ouvre au milieu, comme le lecteur.
                  const pano = e.currentTarget.parentElement!;
                  pano.scrollLeft = (pano.scrollWidth - pano.clientWidth) / 2;
                }}
                onError={() => setImageKo(cam.url)}
              />
            </div>
            <div className="webcam7__apercu">
              <span>{a.prise ? `Image prise ${datePrise(a.prise)}` : "Dernière image publiée"}</span>
              <button type="button" className="btn7 btn7--fantome" onClick={() => setLecteur(cam.url)}>
                <Icon name="lecture" taille={14} />
                Lancer le lecteur
              </button>
            </div>
          </>
        ) : (
          <div className="webcam7__attente">Chargement de la dernière image…</div>
        )
      ) : cam.kind === "image" ? (
        <img
          key={cam.url}
          src={cam.url}
          alt={`Webcam : ${cam.label}`}
          referrerPolicy="no-referrer"
          loading={grand ? "eager" : "lazy"}
          onLoad={() => setEtat("ok")}
          onError={() => setEtat("echec")}
        />
      ) : (
        <iframe
          key={cam.url}
          src={cam.url}
          title={`Webcam : ${cam.label}`}
          loading={grand ? "eager" : "lazy"}
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin"
          allowFullScreen
          onLoad={() => setEtat("ok")}
        />
      )}
      {etat === "echec" ? (
        <div className="webcam7__echec">
          <span>Le flux ne s’affiche pas ici.</span>
          <a href={cam.url} target="_blank" rel="noopener" className="btn7 btn7--fantome">
            Ouvrir chez l’exploitant
            <Icon name="externe" taille={12} />
          </a>
        </div>
      ) : null}
    </div>
  );
}

/** Une caméra du domaine posée dans un autre village le dit. La fiche de
 *  Brides-les-Bains montrait celle de Val Thorens sans le préciser. */
function NoteDomaine({ cam }: { cam: Webcam }) {
  if (!cam.duDomaine || !cam.station) return null;
  return <span className="carte7-sect__texte carte7-sect__texte--petit">Caméra du domaine, située {aStation(cam.station)}.</span>;
}

export function Webcams({ cams }: { cams: Webcam[] }) {
  const [camId, setCamId] = useState<string | null>(null);
  const [grand, setGrand] = useState(false);
  const ouvrir = useRef<HTMLButtonElement>(null);
  const index = Math.max(0, cams.findIndex((c) => c.id === camId));
  const cam = cams[index] ?? null;

  const fermer = useCallback(() => {
    setGrand(false);
    // Le focus revient au bouton qui a ouvert, pas au haut de la page.
    requestAnimationFrame(() => ouvrir.current?.focus());
  }, []);

  return (
    <section className="carte7-sect carte7-sect--serre">
      <div className="carte7-sect__tete">
        <h2>Webcams</h2>
        {cams.length > 1 ? (
          <span className="carte7-sect__texte carte7-sect__texte--petit">{cams.length} caméras</span>
        ) : null}
      </div>
      {cam ? (
        <>
          {/* Le menu reste affiché même pour une seule caméra : il dit
              laquelle on regarde, au même endroit sur toutes les fiches. */}
          <div className="webcam7__barre">
            <select
              className="select7 select7--champ"
              value={cam.id}
              onChange={(e) => setCamId(e.target.value)}
              disabled={cams.length < 2}
              aria-label="Choisir une webcam"
            >
              {cams.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <button ref={ouvrir} type="button" className="btn7 btn7--fantome" onClick={() => setGrand(true)}>
              <Icon name="agrandir" taille={14} />
              Agrandir
            </button>
          </div>
          <NoteDomaine cam={cam} />
          {/* En grand, le cadre de la fiche se démonte : deux lecteurs du même
              flux ne tournent pas en même temps. */}
          {grand ? <div className="webcam7 webcam7--reserve" aria-hidden="true" /> : <Flux cam={cam} />}
          <p className="carte7-sect__texte carte7-sect__texte--petit">
            Flux diffusé par l’exploitant, affiché tel quel.
          </p>
          {grand ? (
            <WebcamEnGrand cams={cams} index={index} onIndex={(i) => setCamId(cams[i]!.id)} onFermer={fermer} />
          ) : null}
        </>
      ) : (
        <p className="carte7-sect__texte carte7-sect__texte--petit">Aucune webcam connue pour cette station.</p>
      )}
    </section>
  );
}

/**
 * La caméra en grand, par-dessus la page.
 *
 * Posée sur `document.body` : un ancêtre à `transform` ou à `backdrop-filter`
 * ferait de `position: fixed` une position relative à lui. Fermeture par la
 * croix, Échap ou un clic sur le fond ; les flèches passent d'une caméra à
 * l'autre quand la fiche en a plusieurs.
 */
function WebcamEnGrand({
  cams,
  index,
  onIndex,
  onFermer,
}: {
  cams: Webcam[];
  index: number;
  onIndex: (i: number) => void;
  onFermer: () => void;
}) {
  const croix = useRef<HTMLButtonElement>(null);
  const cam = cams[index]!;
  const n = cams.length;
  useEchap(true, onFermer);

  useEffect(() => {
    croix.current?.focus();
    // La page ne défile pas sous la caméra.
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = avant;
    };
  }, []);

  useEffect(() => {
    if (n < 2) return;
    const fleches = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") onIndex((index - 1 + n) % n);
      else if (e.key === "ArrowRight") onIndex((index + 1) % n);
    };
    document.addEventListener("keydown", fleches);
    return () => document.removeEventListener("keydown", fleches);
  }, [index, n, onIndex]);

  return createPortal(
    <div
      className="webcam7-grand"
      role="dialog"
      aria-modal="true"
      aria-label={`Webcam : ${cam.label}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onFermer();
      }}
    >
      <div className="webcam7-grand__boite">
        <div className="webcam7-grand__tete">
          <div className="webcam7-grand__titre">
            <strong>{cam.label}</strong>
            {n > 1 ? (
              <span>
                {index + 1} sur {n}
              </span>
            ) : null}
          </div>
          <div className="webcam7-grand__actions">
            {n > 1 ? (
              <>
                <button
                  type="button"
                  className="webcam7-grand__bouton"
                  aria-label="Caméra précédente"
                  onClick={() => onIndex((index - 1 + n) % n)}
                >
                  <Icon name="chevron-gauche" taille={18} />
                </button>
                <button
                  type="button"
                  className="webcam7-grand__bouton"
                  aria-label="Caméra suivante"
                  onClick={() => onIndex((index + 1) % n)}
                >
                  <Icon name="chevron-droite" taille={18} />
                </button>
              </>
            ) : null}
            <a href={cam.url} target="_blank" rel="noopener" className="webcam7-grand__lien">
              Ouvrir chez l’exploitant
              <Icon name="externe" taille={12} />
            </a>
            <button ref={croix} type="button" className="webcam7-grand__bouton" aria-label="Fermer" onClick={onFermer}>
              <Icon name="croix" taille={18} />
            </button>
          </div>
        </div>
        <Flux cam={cam} grand />
        {cam.duDomaine && cam.station ? (
          <p className="webcam7-grand__note">Caméra du domaine, située {aStation(cam.station)}.</p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
