/**
 * Le monde : 5 720 domaines, 73 pays, en trois niveaux.
 *
 * ## Pourquoi trois niveaux et non un filtre de plus
 *
 * `/carte` range 320 stations françaises et pose ses massifs en une rangée de
 * jetons, parce que dix massifs tiennent sur une ligne. Soixante-treize pays
 * n'y tiennent pas, et les aplatir en une liste unique de 5 720 domaines
 * demanderait de charger le monde entier pour en montrer vingt.
 *
 * D'où le parcours **continent → pays → domaines**, qui suit exactement la
 * forme du référentiel : `index.json` — six kilo-octets — sait compter les
 * domaines de chaque pays sans ouvrir aucun fichier de pays, et
 * `domainesPays()` n'ouvre que celui qu'on regarde. Les deux premiers niveaux
 * ne coûtent donc aucun chargement.
 *
 * ## Ce que l'écran ne fait pas
 *
 * Il ne comble rien. Un domaine sans kilomètres relevés écrit « non relevé »,
 * un domaine sans répartition le dit, et les fourchettes écartent le non
 * mesuré au lieu de le compter à zéro — c'est `dansPlage`, la même règle que
 * pour la France. Les deux pays du référentiel qu'aucun continent n'accueille sont
 * nommés en pied d'écran plutôt que rangés d'office quelque part.
 *
 * Il ne mélange pas non plus la France du classeur et la France d'OpenSkiMap :
 * `STATIONS` n'apparaît pas ici. Les 320 stations françaises ont leurs écrans,
 * celui-ci sert le référentiel mondial, et un renvoi les relie.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Coquille } from "@/components/Coquille";
import { Fourchette } from "@/components/v7/Fourchette";
import { SensTri } from "@/components/v7/SensTri";
import { COLOR_HEX } from "@/lib/carte";
import {
  getForecastPair,
  SKY_FR,
  type ForecastLevel,
  type ForecastPair,
} from "@/lib/meteo/forecast";
import { CONTINENTS, type ContinentId } from "@/lib/geo/continents";
import { paysByCode, paysDuContinent, type Pays } from "@/lib/geo/pays";
import { decimal, entier } from "@/lib/nombres";
import {
  mentionRattachement,
  mentionSource,
  releveRattachements,
  repartitionsDesDomaines,
  type Rattachement,
  type Repartition,
} from "@/lib/monde/couleurs";
import {
  altitudesDuDomaine,
  colonneAdulte,
  pistesDuDomaine,
  forfaitDuDomaine,
  LIBELLE_POSTE,
  mentionCase,
  POSTES,
  fourchetteJournee,
  journeeParPeriode,
  ligneJournee,
  mentionForfait,
  mentionPhoto,
  photoDuDomaine,
  prix,
  releveVues,
  type ReleveVues,
} from "@/lib/monde/vues";
import {
  AUCUN_FILTRE,
  chercher,
  denivele,
  filtresActifs,
  passeFiltres,
  SENS_MONDE,
  SEUILS_MONDE,
  TRIS_MONDE,
  trier,
  type CleMonde,
  type FiltresMonde,
  type TriMonde,
} from "@/lib/monde/filtres";
import { plageTexte, poserBorne } from "@/lib/plage";
import type { Sens } from "@/lib/tri";
import {
  demDuDomaine,
  DOMAINES_MONDE,
  domainesPays,
  indexPays,
  PAYS_AVEC_DOMAINES,
  PAYS_ECARTES,
  RELEVE_MONDE,
  SANS_PAYS,
  SEUIL_MONDE,
  type DomaineMonde,
} from "@/lib/monde/monde";
import { altitude, mesureDans, type Systeme } from "@/lib/unites";
import { langueIntl } from "@/lib/i18n/langue";
import { aTraduire, langue, tr, trN } from "@/lib/i18n";

export const Route = createFileRoute("/monde")({ component: PageMonde });

/** Le nom court d'une source de tarif, pour la légende du tableau. */
const NOM_SOURCE: Record<string, string> = {
  skiinfo: "Skiinfo",
  skiresort: "skiresort.fr",
  bergfex: "bergfex",
  officiel: aTraduire("site officiel"),
  proprietaire: aTraduire("relevé à la main"),
};

/** Les textes de `index.json` qui s'affichent tels quels : marqués ici pour
 *  leur traduction, rendus par `tr`. Un texte nouveau du relevé reste en
 *  français tant qu'il n'est pas ajouté. */
const TEXTES_RELEVE = new Set([
  aTraduire("en exploitation, mesuré, et nommé"),
  aTraduire("écartée du référentiel le 21 septembre 2026, sur décision du propriétaire"),
]);
const texteReleve = (x: string) => (TEXTES_RELEVE.has(x) ? tr(x) : x);

/** Le nom d'un continent ou d'un pays dans la langue de l'écran. */
const nomLocal = (x: { nomFr: string; nomEn: string }) => (langue() === "en" ? x.nomEn : x.nomFr);

/** Les pays du référentiel qu'aucun continent n'accueille, avec leurs domaines.
 *  Calculé une fois : ni `PAYS` ni l'index ne bougent au cours d'une session. */
const HORS_ONGLETS = PAYS_AVEC_DOMAINES.filter((cc) => !paysByCode(cc)).map((cc) => ({
  code: cc,
  domaines: indexPays(cc)?.domaines ?? 0,
}));

/** Ce qu'un continent porte, sans ouvrir un seul fichier de pays. */
type ResumeContinent = {
  id: ContinentId;
  nomFr: string;
  nomEn: string;
  pays: Pays[];
  domaines: number;
};

const RESUMES: ResumeContinent[] = CONTINENTS.map((c) => {
  const pays = paysDuContinent(c.id).filter((p) => indexPays(p.code));
  return {
    id: c.id,
    nomFr: c.nomFr,
    nomEn: c.nomEn,
    pays,
    domaines: pays.reduce((n, p) => n + (indexPays(p.code)?.domaines ?? 0), 0),
  };
}).filter((r) => r.pays.length > 0);

/** Les domaines rangés sous un continent, tous pays confondus. Sert le total
 *  affiché en tête, qui doit se retrouver en additionnant les onglets. */
const TOTAL_ONGLETS = RESUMES.reduce((n, r) => n + r.domaines, 0);

/** La date du relevé, écrite en français. Midi, pour qu'un relevé fait tard le
 *  soir en temps universel ne bascule pas au lendemain. */
const dateReleve = () =>
  new Date(`${RELEVE_MONDE.slice(0, 10)}T12:00:00`).toLocaleDateString(langueIntl(), {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function BarreCouleurs({ r }: { r: Repartition }) {
  const parts: [string, number][] = [
    [COLOR_HEX.green, r.pct.vert],
    [COLOR_HEX.blue, r.pct.bleu],
    [COLOR_HEX.red, r.pct.rouge],
    [COLOR_HEX.black, r.pct.noir],
  ];
  return (
    <span className="monde-bar" aria-hidden>
      {parts.map(([hex, pct], i) => (
        <i key={i} style={{ width: `${pct}%`, background: hex }} />
      ))}
    </span>
  );
}

/**
 * La météo du domaine, au bas et au haut des pistes.
 *
 * `fetchForecastPair` interroge Open-Meteo **deux fois, une par altitude** :
 * c'est ce qui distingue « il gèle à 2 800 m » de « il pleut au village ».
 * L'appel n'est donc pas gratuit, et cet écran peut afficher cinq cents
 * domaines — d'où le repli : la prévision ne part que pour le domaine qu'on
 * ouvre, un à la fois. C'est aussi ce qui tient le quota du service, dont une
 * séance précédente a appris qu'il se défend par des 429 horaires **et**
 * journaliers.
 *
 * ## Sans altitudes, pas de prévision
 *
 * La fiche station française se rabat sur 1 500 et 2 500 m quand la mesure
 * manque, parce qu'elle a `villageM` comme seconde source et qu'elle affiche
 * l'absence à côté. Un domaine du référentiel mondial n'a rien d'autre : le
 * bas et le haut des pistes **sont** `minM` et `maxM`. Les inventer rendrait
 * une prévision d'un endroit qui n'est pas le domaine, ce qui est pire que
 * pas de prévision du tout.
 */
function NiveauMeteo({ titre, n, systeme }: { titre: string; n: ForecastLevel; systeme: Systeme }) {
  const jour = n.days[0];
  return (
    <div className="monde-meteo__niveau">
      <span className="monde-meteo__titre">
        {titre} · {altitude(n.altitudeM, systeme)}
      </span>
      <span className="monde-meteo__creneaux">
        {tr("{matin} le matin, {cielMatin} · {apresMidi} l’après-midi, {cielApresMidi}", {
          matin: n.morning.temp != null ? `${n.morning.temp} °C` : "–",
          cielMatin: tr(SKY_FR[n.morning.sky]),
          apresMidi: n.afternoon.temp != null ? `${n.afternoon.temp} °C` : "–",
          cielApresMidi: tr(SKY_FR[n.afternoon.sky]),
        })}
      </span>
      {jour ? (
        <span className="monde-meteo__jour">
          {tr("Aujourd’hui {min} à {max}", {
            min: jour.tempMin != null ? `${jour.tempMin}` : "–",
            max: jour.tempMax != null ? `${jour.tempMax} °C` : "–",
          })}
          {jour.snowCm != null && jour.snowCm > 0 ? tr(" · {cm} cm de neige", { cm: decimal(jour.snowCm, 1) }) : null}
          {jour.depthCm != null ? tr(" · {cm} cm au sol", { cm: entier(jour.depthCm) }) : null}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Les altitudes qu'on interroge, et d'où elles viennent.
 *
 * 1. Celles du référentiel — `minM`, `maxM` — quand OpenSkiMap les a mesurées.
 * 2. Sinon, celles que la fiche Skiinfo ou skiresort **déjà appariée** publie :
 *    une mesure de la source, reprise avec son origine.
 * 3. Sinon, le point de terrain de Copernicus (`dem.json`) — **une seule
 *    altitude**, ni bas ni haut, et l'écran le dit : la prévision vaut alors
 *    pour le point de référence du domaine, pas pour ses pistes.
 *
 * Aucun des trois n'invente : la fiche française se rabat sur 1 500 / 2 500 m
 * parce qu'elle a `villageM` en seconde source ; ici, faute de mesure, on
 * dit ce qu'on a et on n'affiche rien de plus.
 */
type Niveaux =
  | { forme: "pistes"; bas: number; haut: number; source: "référentiel" | "skiinfo" | "skiresort" }
  | { forme: "point"; alt: number }
  | { forme: "aucun" };

function MeteoDomaine({ d, systeme, vues }: { d: DomaineMonde; systeme: Systeme; vues: ReleveVues | null }) {
  const [etat, setEtat] = useState<
    { s: "charge" } | { s: "ok"; p: ForecastPair; niveaux: Niveaux } | { s: "panne" } | { s: "aucun" }
  >({ s: "charge" });

  const repli = vues ? altitudesDuDomaine(vues, d.id) : null;

  useEffect(() => {
    let vivant = true;
    setEtat({ s: "charge" });
    (async () => {
      let niveaux: Niveaux = { forme: "aucun" };
      if (d.minM != null && d.maxM != null) niveaux = { forme: "pistes", bas: d.minM, haut: d.maxM, source: "référentiel" };
      else if (repli) niveaux = { forme: "pistes", bas: repli.basM, haut: repli.sommetM, source: repli.source };
      else {
        const pt = await demDuDomaine(d.id);
        if (pt != null) niveaux = { forme: "point", alt: pt };
      }
      if (!vivant) return;
      if (niveaux.forme === "aucun") return setEtat({ s: "aucun" });
      const bas = niveaux.forme === "pistes" ? niveaux.bas : niveaux.alt;
      const haut = niveaux.forme === "pistes" ? niveaux.haut : niveaux.alt;
      try {
        const p = await getForecastPair({ data: { lat: d.lat, lon: d.lon, villageM: bas, summitM: haut } });
        if (!vivant) return;
        setEtat(p.at ? { s: "ok", p, niveaux } : { s: "panne" });
      } catch {
        if (vivant) setEtat({ s: "panne" });
      }
    })();
    return () => {
      vivant = false;
    };
  }, [d.id, d.lat, d.lon, d.minM, d.maxM, repli]);

  if (etat.s === "aucun") {
    return (
      <p className="monde-row__absence">
        {tr("Météo indisponible : ni altitude de piste ni point de terrain n’est relevé pour ce domaine.")}
      </p>
    );
  }
  if (etat.s === "charge") return <p className="monde-row__lieu">{tr("Relevé de la météo…")}</p>;
  if (etat.s === "panne")
    return <p className="monde-row__absence">{tr("Le service de météo n’a pas répondu.")}</p>;

  if (etat.niveaux.forme === "point") {
    return (
      <div className="monde-meteo">
        <NiveauMeteo titre={tr("Point de référence du domaine")} n={etat.p.low} systeme={systeme} />
        <span className="monde-meteo__iso">
          {tr(
            "Les altitudes des pistes ne sont pas relevées : cette prévision vaut pour le point de terrain Copernicus du domaine, à {altitude}, pas pour le bas ni le haut des pistes.",
            { altitude: altitude(etat.niveaux.alt, systeme) },
          )}
          {etat.p.freezingLevelM != null
            ? ` ${tr("Isotherme 0 °C à {altitude}", { altitude: altitude(etat.p.freezingLevelM, systeme) })}.`
            : ""}
        </span>
      </div>
    );
  }

  return (
    <div className="monde-meteo">
      <NiveauMeteo titre={tr("Bas des pistes")} n={etat.p.low} systeme={systeme} />
      <NiveauMeteo titre={tr("Haut des pistes")} n={etat.p.high} systeme={systeme} />
      <span className="monde-meteo__iso">
        {etat.p.freezingLevelM != null
          ? tr("Isotherme 0 °C à {altitude}", { altitude: altitude(etat.p.freezingLevelM, systeme) })
          : tr("Isotherme 0 °C non disponible")}
        {" · Open-Meteo"}
        {etat.niveaux.forme === "pistes" && etat.niveaux.source !== "référentiel"
          ? tr(" · altitudes publiées par {source}, le référentiel ne les a pas mesurées", {
              source: etat.niveaux.source === "skiinfo" ? "Skiinfo" : "skiresort.fr",
            })
          : ""}
      </span>
    </div>
  );
}

/**
 * La ligne d'un domaine.
 *
 * `partage === "estime"` s'écrit à l'écran, et non seulement dans une
 * infobulle : une valeur estimée qui ne se dit pas estimée est pire qu'une
 * absence, puisque l'absence, elle, se voit.
 */
function LigneDomaine({
  d,
  r,
  rattachement,
  systeme,
  vues,
  ouvert,
  surOuvrir,
}: {
  d: DomaineMonde;
  r: Repartition | undefined;
  rattachement: Rattachement | undefined;
  systeme: Systeme;
  vues: ReleveVues | null;
  ouvert: boolean;
  surOuvrir: () => void;
}) {
  const dn = denivele(d);
  const lieu = [d.region, d.localite].filter(Boolean).join(" · ");
  const vue = vues ? photoDuDomaine(vues, d.id) : null;
  // Zéro piste cartographiée n'est pas zéro piste : quand la fiche appariée
  // publie des kilomètres, on les montre avec leur origine.
  const pistesRepli = vues && (d.km ?? 0) <= 0 ? pistesDuDomaine(vues, d.id) : null;
  const forfait = vues ? forfaitDuDomaine(vues, d.id) : null;
  const jour = forfait ? ligneJournee(forfait) : null;
  const matrice = forfait?.matrice ?? null;
  // Les sources réellement employées par la matrice, dans l'ordre d'apparition.
  const sourcesTarifs = matrice
    ? [...new Set(POSTES.map((p) => matrice[p]?.source).filter(Boolean))].map((x) => tr(NOM_SOURCE[x!]))
    : [];

  const fourchette = forfait ? fourchetteJournee(forfait) : null;
  // Le haut de la fourchette quand elle existe : c'est le tarif de haute
  // saison, celui qu'on paie aux dates où l'on part le plus souvent.
  // La matrice fait foi pour la journée adulte : elle sait lire « 1 Jour »
  // comme « Forfait journée », elle écarte les demi-journées, et elle dit sa
  // source. La grille n'est relue que si la matrice n'a pas cette case.
  const adulte = forfait
    ? fourchette
      ? prix(fourchette.haut, forfait.devise)
      : matrice?.jourAdulte
        ? prix(matrice.jourAdulte.prix, forfait.devise)
        : jour
          ? prix(jour.prix[colonneAdulte(forfait)], forfait.devise)
          : null
    : null;
  const periodes = forfait ? journeeParPeriode(forfait) : [];
  // Les six tarifs demandés, quand les grilles les publient. Une case vide
  // s'écrit « non relevé » comme le reste : aucune n'est déduite d'une autre.
  const titre = [mentionSource(r ?? null), mentionRattachement(rattachement)]
    .filter(Boolean)
    .join(" ; ");
  return (
    <li className="monde-row">
      {!vue ? (
        <span className="monde-row__photo monde-row__photo--absente" aria-hidden>
          {tr("photo non relevée")}
        </span>
      ) : null}
      {vue ? (
        <img
          className="monde-row__photo"
          src={vue.src}
          alt=""
          loading="lazy"
          title={mentionPhoto(vue.source)}
        />
      ) : null}
      {/* Une photo libre ne se montre **qu'**avec son auteur et sa licence :
          c'est la condition de CC BY et CC BY-SA, et une infobulle n'y suffit
          pas. Le crédit paraît donc sous l'image, lisible, avec un lien vers
          la page du fichier. */}
      {vue?.source.source === "commons" ? (
        <span className="monde-row__credit">
          <a href={vue.source.page} rel="noreferrer nofollow">
            {vue.source.auteur || tr("auteur non nommé")}
          </a>
          {vue.source.licence ? ` · ${vue.source.licence}` : null} · Wikimedia Commons
        </span>
      ) : null}
      <div className="monde-row__tete">
        <span className="monde-row__nom">{d.nom || tr("Domaine sans nom")}</span>
        {d.pays.length > 1 ? (
          <span className="monde-row__frontiere" title={tr("Domaine à cheval sur une frontière")}>
            {d.pays.join(" / ")}
          </span>
        ) : null}
      </div>
      {lieu ? <p className="monde-row__lieu">{lieu}</p> : null}
      <dl className="monde-row__mesures">
        <div
          title={
            pistesRepli?.km != null
              ? tr("Kilomètres publiés par {source} (fiche « {fiche} ») : OpenSkiMap n’a cartographié aucune piste de ce domaine.", {
                  source: pistesRepli.source === "skiinfo" ? "Skiinfo" : "skiresort.fr",
                  fiche: pistesRepli.cle,
                })
              : undefined
          }
        >
          <dt>{tr("Pistes")}</dt>
          <dd>
            {pistesRepli?.km != null
              ? mesureDans({ valeur: pistesRepli.km, unite: "km" }, systeme)
              : d.km != null && d.km > 0
                ? mesureDans({ valeur: d.km, unite: "km" }, systeme)
                : tr("non cartographiées")}
            {pistesRepli?.km != null ? (
              <span className="monde-row__loin">
                {" "}
                · {pistesRepli.source === "skiinfo" ? "Skiinfo" : "skiresort.fr"}
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>{tr("Sommet")}</dt>
          <dd>{d.maxM != null ? altitude(d.maxM, systeme) : tr("non relevé")}</dd>
        </div>
        <div>
          <dt>{tr("Dénivelé")}</dt>
          <dd>{dn != null ? altitude(dn, systeme) : tr("non relevé")}</dd>
        </div>
        <div>
          <dt>{tr("Remontées")}</dt>
          <dd>{d.lifts != null ? entier(d.lifts) : tr("non relevées")}</dd>
        </div>
        {/* Décision du propriétaire, 22 septembre 2026 : garder les 2 780
            domaines et **afficher l'absence**. Un forfait manquant s'écrit
            donc, comme une altitude manquante — omettre la ligne laisserait
            croire à un oubli d'affichage plutôt qu'à une donnée qu'aucune
            source ne publie. */}
        {!adulte ? (
          <div>
            <dt>{tr("Forfait jour")}</dt>
            <dd>{tr("non relevé")}</dd>
          </div>
        ) : null}
        {adulte ? (
          <div title={forfait ? mentionForfait(forfait) : undefined}>
            <dt>{jour?.libelle && /week/i.test(jour.libelle) ? tr("Forfait") : tr("Forfait jour")}</dt>
            {/* Dans la devise du pays, jamais convertie. Le site publie bien
                un « env. € » ; il est dans le relevé et n'est pas un prix.

                Au-delà de deux kilomètres, la distance s'écrit **à côté du
                prix** et non seulement dans l'infobulle. Le rattachement se
                fait par la position, à cinq kilomètres au plus : à 4,9 km, un
                « 83 € » peut être le forfait du domaine d'en face, et un
                lecteur qui parcourt la liste ne survole rien. La médiane est à
                0,41 km, donc la mention reste rare — elle signale justement
                les cas où elle doit paraître. */}
            <dd className="monde-row__prix">
              {/* Quand le tarif dépend de la date, on écrit la fourchette et
                  non un montant seul : « 74 à 82 € » dit ce qu'un « 82 € »
                  cacherait, et c'est la distinction que la source publie. */}
              {fourchette ? tr("{bas} à {haut}", { bas: entier(fourchette.bas), haut: adulte }) : adulte}
              {forfait && forfait.km > 2 ? (
                <span className="monde-row__loin">{tr(" · fiche à {km} km", { km: decimal(forfait.km, 1) })}</span>
              ) : null}
            </dd>
          </div>
        ) : null}
      </dl>
      {r ? (
        <div className="monde-row__couleurs" title={titre}>
          <BarreCouleurs r={r} />
          <span className="monde-row__pct">
            {r.pct.vert} · {r.pct.bleu} · {r.pct.rouge} · {r.pct.noir} %
          </span>
          {r.partage === "estime" ? (
            <span className="monde-row__estime">{tr("vert et bleu estimés")}</span>
          ) : null}
        </div>
      ) : (
        <p className="monde-row__absence">{tr("Répartition par couleur non relevée")}</p>
      )}
      <button
        type="button"
        className="monde-row__meteo-bouton"
        aria-expanded={ouvert}
        onClick={surOuvrir}
      >
        {ouvert ? tr("Masquer le détail") : tr("Afficher le détail")}
      </button>
      {ouvert && forfait?.source === "proprietaire" ? (
        <p className="monde-row__preuve">
          {/* Un tarif relevé à la main : sa période telle qu'écrite, sa note,
              et la page d'où il sort — sans quoi il ne se juge pas. */}
          {tr("Relevé à la main")}
          {forfait.releve?.periode ? (
            <>
              {tr(", période")} <q>{forfait.releve.periode}</q>
            </>
          ) : null}
          {forfait.releve?.note ? ` ; ${forfait.releve.note}` : null}
          {forfait.pageTarifs ? (
            <>
              {" "}
              (<a href={forfait.pageTarifs} rel="noreferrer">{tr("source")}</a>)
            </>
          ) : null}
        </p>
      ) : null}
      {ouvert && forfait?.source === "officiel" && forfait.preuve ? (
        <p className="monde-row__preuve">
          {/* Un prix lu en texte libre ne se juge pas seul : la ligne du
              tableau, telle que le site l'écrit, paraît avec lui. */}
          {tr("Lu sur le site officiel :")}{" "}
          <q>{forfait.preuve}</q>
          {forfait.pageTarifs ? (
            <>
              {" "}
              (<a href={forfait.pageTarifs} rel="noreferrer">{tr("page des tarifs")}</a>)
            </>
          ) : null}
        </p>
      ) : null}
      {ouvert && matrice && forfait ? (
        <table className="monde-tarifs">
          <caption>
            {tr("Forfaits publiés, en {devise}", { devise: forfait.devise ?? "" })}
            {/* Une case peut venir d'une autre source que le prix affiché en
                tête — la première qui la publie, dans la même devise. Deux
                cases d'une même ligne peuvent donc venir de deux sources, et
                d'alors deux saisons : « 28,60 adulte » chez Skiinfo à côté de
                « 22,10 enfant » chez skiresort se lit comme un seul tarif
                alors que c'en sont deux. Cent quatre-vingt-sept domaines sont
                dans ce cas ; il faut donc le dire ici, et pas seulement dans
                l'infobulle de chaque montant. */}
            {sourcesTarifs.length > 1 ? (
              <span className="monde-tarifs__melange">
                {" "}
                {tr(": montants de sources différentes ({sources}). Survolez un montant pour voir sa source.", {
                  sources: sourcesTarifs.join(", "),
                })}
              </span>
            ) : null}
          </caption>
          <thead>
            <tr>
              <th scope="col">{tr("Durée")}</th>
              <th scope="col">{tr("Adulte")}</th>
              <th scope="col">{tr("Enfant")}</th>
            </tr>
          </thead>
          <tbody>
            {(["jour", "sixJours", "saison"] as const).map((duree) => {
              const cases = [matrice[`${duree}Adulte`], matrice[`${duree}Enfant`]];
              return (
                <tr key={duree}>
                  <th scope="row">{tr(LIBELLE_POSTE[`${duree}Adulte`].ligne)}</th>
                  {cases.map((c, i) => (
                    <td
                      key={i}
                      className={c ? "monde-tarifs__prix" : "monde-tarifs__vide"}
                      title={c ? mentionCase(c) : undefined}
                    >
                      {(c && prix(c.prix, forfait.devise)) || tr("non relevé")}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
      {ouvert && periodes.length > 1 ? (
        <dl className="monde-periodes">
          <dt>{tr("Forfait journée, adulte, selon la date")}</dt>
          {periodes.map((p) => (
            <dd key={p.dates}>
              <span className="monde-periodes__dates">{p.dates}</span>
              <b>{prix(p.prix, forfait!.devise) ?? tr("non publié")}</b>
            </dd>
          ))}
          <dd className="monde-periodes__source">
            {tr("Périodes publiées par {source}, et reprises telles quelles.", {
              source: forfait!.source === "bergfex" ? "bergfex" : forfait!.source,
            })}
          </dd>
        </dl>
      ) : null}
      {ouvert ? <MeteoDomaine d={d} systeme={systeme} vues={vues} /> : null}
    </li>
  );
}

function PageMonde() {
  const [continent, setContinent] = useState<ContinentId | null>(null);
  const [pays, setPays] = useState<string | null>(null);
  const [systeme, setSysteme] = useState<Systeme>("metrique");

  const [domaines, setDomaines] = useState<DomaineMonde[] | null>(null);
  const [repartitions, setRepartitions] = useState<ReadonlyMap<string, Repartition>>(new Map());
  const [rattachements, setRattachements] = useState<Record<string, Rattachement>>({});
  const [vues, setVues] = useState<ReleveVues | null>(null);
  const [chargement, setChargement] = useState(false);
  const [panne, setPanne] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [tri, setTri] = useState<TriMonde>("km");
  const [sens, setSens] = useState<Sens>(SENS_MONDE.km);
  const [filtres, setFiltres] = useState<FiltresMonde>(AUCUN_FILTRE);
  /** Pose une borne, depuis l'état courant : arrondie au pas au curseur,
   *  telle quelle quand elle est tapée. */
  const poser = (k: CleMonde, which: 0 | 1, v: number, exact: boolean) =>
    setFiltres((f) => {
      const def = SEUILS_MONDE.find((x) => x.k === k)!;
      return { ...f, [k]: poserBorne(f[k], def.b, def.pas, which, v, exact) };
    });
  const [ouvert, setOuvert] = useState(false);
  // Un seul domaine ouvert à la fois : deux requêtes Open-Meteo par ouverture,
  // et un écran qui en listerait cinq cents en ferait mille.
  const [domaineOuvert, setDomaineOuvert] = useState<string | null>(null);

  // Le pays est ouvert quand on le choisit, et une seule fois : `domainesPays`
  // garde ses promesses en cache, mais l'écran ne doit pas non plus redemander
  // à chaque frappe dans la recherche.
  useEffect(() => {
    if (!pays) {
      setDomaines(null);
      return;
    }
    let vivant = true;
    setChargement(true);
    setPanne(null);
    Promise.all([domainesPays(pays), releveRattachements(), releveVues()])
      .then(async ([lot, releve, montrables]) => {
        const parts = await repartitionsDesDomaines(lot);
        if (!vivant) return;
        setDomaines(lot);
        setRepartitions(parts);
        setRattachements(releve.rattachements);
        setVues(montrables);
      })
      .catch((e: unknown) => {
        if (!vivant) return;
        // Une panne de chargement n'est pas un pays vide : l'écran dit laquelle
        // des deux il a rencontrée, au lieu d'afficher « aucun domaine ».
        setPanne(e instanceof Error ? e.message : tr("chargement impossible"));
        setDomaines([]);
      })
      .finally(() => {
        if (vivant) setChargement(false);
      });
    return () => {
      vivant = false;
    };
  }, [pays]);

  const listeContinent = useMemo(
    () => (continent ? RESUMES.find((r) => r.id === continent) : null),
    [continent],
  );

  const retenus = useMemo(() => {
    if (!domaines) return [];
    const gardes = chercher(domaines, q).filter((d) => passeFiltres(d, filtres, repartitions));
    return trier(gardes, tri, sens);
  }, [domaines, q, filtres, repartitions, tri, sens]);

  const nFiltres = filtresActifs(filtres);
  const fiche = pays ? paysByCode(pays) : undefined;
  const idx = pays ? indexPays(pays) : undefined;
  // `domainesPays()` rend les domaines hébergés **et** ceux qui débordent d'un
  // pays voisin ; l'index, lui, ne compte que les hébergés. Écrire « 396 sur
  // 381 » laissait ces deux comptes se contredire à l'écran sans rien dire.
  const frontaliers = Math.max(0, (domaines?.length ?? 0) - (idx?.domaines ?? 0));

  return (
    <Coquille>
      <div className="monde">
        <header className="monde__tete">
          <p className="monde__surtitre">{tr("Référentiel mondial · OpenSkiMap")}</p>
          <h1 className="monde__titre">{tr("Le monde")}</h1>
          <p className="monde__intro">
            {tr("{domaines} domaines de ski alpin, {pays} pays. Seuil retenu : {seuil}. Relevé du {date}.", {
              domaines: entier(DOMAINES_MONDE),
              pays: PAYS_AVEC_DOMAINES.length,
              seuil: texteReleve(SEUIL_MONDE),
              date: dateReleve(),
            })}
          </p>
          <div className="monde__systeme" role="group" aria-label={tr("Unités")}>
            {(
              [
                ["metrique", "km · m"],
                ["imperial", "mi · ft"],
              ] as [Systeme, string][]
            ).map(([s, label]) => (
              <button
                key={s}
                type="button"
                className={`chip chip--sm${systeme === s ? " chip--on" : ""}`}
                aria-pressed={systeme === s}
                onClick={() => setSysteme(s)}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        <nav className="monde__fil" aria-label={tr("Où vous êtes")}>
          <button
            type="button"
            className="monde__miette"
            onClick={() => {
              setContinent(null);
              setPays(null);
            }}
          >
            {tr("Monde")}
          </button>
          {listeContinent ? (
            <>
              <span aria-hidden>›</span>
              <button type="button" className="monde__miette" onClick={() => setPays(null)}>
                {nomLocal(listeContinent)}
              </button>
            </>
          ) : null}
          {pays ? (
            <>
              <span aria-hidden>›</span>
              <span className="monde__miette monde__miette--ici">{fiche ? nomLocal(fiche) : pays}</span>
            </>
          ) : null}
        </nav>

        {/* ── Niveau 1 : les continents ─────────────────────────────────── */}
        {!continent ? (
          <>
            <ul className="monde__continents">
              {RESUMES.map((r) => (
                <li key={r.id}>
                  <button type="button" className="monde-carte" onClick={() => setContinent(r.id)}>
                    <span className="monde-carte__nom">{nomLocal(r)}</span>
                    <span className="monde-carte__chiffre">{entier(r.domaines)}</span>
                    <span className="monde-carte__quoi">
                      {tr("domaines · {n} pays", { n: r.pays.length })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="monde__note">
              {tr("{n} domaines sont rangés sous ces {continents} continents.", {
                n: entier(TOTAL_ONGLETS),
                continents: RESUMES.length,
              })}{" "}
              {HORS_ONGLETS.length ? (
                <>
                  {HORS_ONGLETS.length === 1
                    ? tr("Un pays du référentiel n’y figure pas :")
                    : tr("Deux pays du référentiel n’y figurent pas :")}{" "}
                  {HORS_ONGLETS.map((p, i) => (
                    <span key={p.code}>
                      {i > 0 ? ", " : ""}
                      <b>{p.code}</b> {trN(p.domaines, "({n} domaine)", "({n} domaines)", { n: entier(p.domaines) })}
                    </span>
                  ))}
                  .{" "}
                  {tr(
                    "Le Kosovo n’a pas de fiche pays, faute de source pour sa devise et son fuseau horaire. {n} domaines de plus ne sont rattachés à aucun pays par la source, et restent donc hors du référentiel.",
                    { n: entier(SANS_PAYS) },
                  )}
                </>
              ) : null}
            </p>
            {PAYS_ECARTES.length ? (
              <p className="monde__note">
                {PAYS_ECARTES.map((p) => (
                  <span key={p.code}>
                    <b>{p.code}</b> {trN(p.domaines, "({n} domaine) :", "({n} domaines) :", { n: entier(p.domaines) })}{" "}
                    {texteReleve(p.motif)}.{" "}
                  </span>
                ))}
                {tr("Ces domaines existent et sont mesurés, mais ils sont volontairement exclus du référentiel.")}
              </p>
            ) : null}
            <p className="monde__renvoi">
              {tr("Les 320 stations françaises ont leurs propres écrans :")}{" "}
              <Link to="/carte">{tr("la carte")}</Link> {tr("et")} <Link to="/comparer">{tr("Comparer")}</Link>.{" "}
              {tr("Ici, la France n’est décrite que par les données OpenSkiMap.")}
            </p>
          </>
        ) : null}

        {/* ── Niveau 2 : les pays du continent ──────────────────────────── */}
        {listeContinent && !pays ? (
          <ul className="monde__pays">
            {listeContinent.pays
              .slice()
              .sort((a, b) => (indexPays(b.code)?.domaines ?? 0) - (indexPays(a.code)?.domaines ?? 0))
              .map((p) => {
                const i = indexPays(p.code);
                return (
                  <li key={p.code}>
                    <button type="button" className="monde-pays" onClick={() => setPays(p.code)}>
                      <span className="monde-pays__nom">{nomLocal(p)}</span>
                      <span className="monde-pays__n">{entier(i?.domaines ?? 0)}</span>
                      <span className="monde-pays__detail">
                        {i?.kmTotal != null
                          ? mesureDans({ valeur: i.kmTotal, unite: "km" }, systeme)
                          : tr("km non relevés")}
                        {i?.maxM != null ? tr(" · jusqu’à {altitude}", { altitude: altitude(i.maxM, systeme) }) : null}
                      </span>
                      <span className="monde-pays__devise">{p.devise}</span>
                    </button>
                  </li>
                );
              })}
          </ul>
        ) : null}

        {/* ── Niveau 3 : les domaines du pays ───────────────────────────── */}
        {pays ? (
          <section className="monde__domaines">
            <div className="monde__barre">
              <label className="monde__recherche">
                <span className="sr-only">{tr("Rechercher un domaine, une région")}</span>
                <input
                  type="search"
                  value={q}
                  placeholder="Zermatt, Tyrol, Hokkaido…"
                  autoComplete="off"
                  onChange={(e) => setQ(e.target.value)}
                />
              </label>
              <button
                type="button"
                className={`chip${nFiltres || ouvert ? " chip--on" : ""}`}
                aria-expanded={ouvert}
                onClick={() => setOuvert((v) => !v)}
              >
                {tr("Filtres")}
                {nFiltres ? <span className="fbadge">{nFiltres}</span> : null}
              </button>
              <label>
                <span className="sr-only">{tr("Tri des domaines")}</span>
                <select
                  className="monde__tri"
                  value={tri}
                  onChange={(e) => {
                    const t = e.target.value as TriMonde;
                    setTri(t);
                    setSens(SENS_MONDE[t]);
                  }}
                >
                  {TRIS_MONDE.map(([id, label]) => (
                    <option key={id} value={id}>
                      {tr("Tri : {critere}", { critere: tr(label) })}
                    </option>
                  ))}
                </select>
              </label>
              <SensTri className="sens7--petit" sens={sens} alpha={tri === "nom"} onChange={setSens} />
            </div>

            {ouvert ? (
              <div className="monde__filtres">
                {SEUILS_MONDE.map((s) => (
                  <Fourchette
                    key={s.k}
                    lbl={tr(s.label)}
                    bornes={s.b}
                    valeur={filtres[s.k]}
                    pas={s.pas}
                    unite={s.unite}
                    resume={plageTexte(filtres[s.k], s.b, (v) => `${entier(v)}${s.unite ? ` ${s.unite}` : ""}`)}
                    onPoser={(which, v, exact) => poser(s.k, which, v, exact)}
                  />
                ))}
                <label className="monde-bascule">
                  <input
                    type="checkbox"
                    checked={filtres.avecCouleurs}
                    onChange={(e) => setFiltres({ ...filtres, avecCouleurs: e.target.checked })}
                  />
                  {tr("Seulement les domaines dont la répartition par couleur est connue")}
                </label>
                <button
                  type="button"
                  className="chip chip--sm"
                  onClick={() => setFiltres(AUCUN_FILTRE)}
                >
                  {tr("Tout remettre à zéro")}
                </button>
              </div>
            ) : null}

            <p className="monde__compte">
              {chargement
                ? tr("Chargement des domaines…")
                : panne
                  ? tr("Les domaines de ce pays n’ont pas pu être chargés : {panne}", { panne })
                  : trN(retenus.length, "{n} domaine sur {total}", "{n} domaines sur {total}", {
                      n: entier(retenus.length),
                      total: entier(domaines?.length ?? 0),
                    })}
            </p>

            {!chargement && !panne && frontaliers > 0 ? (
              <p className="monde__compte">
                {trN(
                  frontaliers,
                  "Dont {n} à cheval sur une frontière, qui figure aussi sous son autre pays. Dans la liste des pays, ce pays en compte {total} : seulement ceux qu’il héberge.",
                  "Dont {n} à cheval sur une frontière, qui figurent aussi sous leur autre pays. Dans la liste des pays, ce pays en compte {total} : seulement ceux qu’il héberge.",
                  { n: entier(frontaliers), total: entier(idx?.domaines ?? 0) },
                )}
              </p>
            ) : null}

            {!chargement && !panne && retenus.length === 0 ? (
              <p className="monde__vide">
                {tr(
                  "Aucun domaine ne remplit tous les critères. Une fourchette active écarte aussi les domaines dont la valeur n’est pas relevée : élargissez une fourchette ou modifiez la recherche.",
                )}
              </p>
            ) : null}

            <ul className="monde__liste">
              {retenus.map((d) => (
                <LigneDomaine
                  key={d.id}
                  d={d}
                  r={repartitions.get(d.id)}
                  rattachement={rattachements[d.id]}
                  systeme={systeme}
                  vues={vues}
                  ouvert={domaineOuvert === d.id}
                  surOuvrir={() => setDomaineOuvert(domaineOuvert === d.id ? null : d.id)}
                />
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Coquille>
  );
}
