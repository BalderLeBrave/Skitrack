/**
 * Mentions légales.
 *
 * Le texte est volontairement en français, dans toutes les langues de
 * l'interface : il décrit un positionnement juridique au regard du droit
 * français (code du tourisme, RGPD, licences ODbL et Etalab) et une traduction
 * approximative d'un engagement de ce type vaut moins que l'original. Les
 * titres suivent la langue choisie, le corps reste la version qui fait foi.
 *
 * Il décrit le fonctionnement réel de l'application ; il ne constitue pas un
 * avis juridique.
 */

import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'
import { clearUserData } from '@/store/userData'

/** Date de dernière révision du texte, affichée en pied de section. */
const REVISION = '14 août 2026'

/**
 * Efface tout ce que l'application a écrit dans le stockage du navigateur.
 *
 * Balayage par préfixe plutôt qu'une liste de clés : une clé oubliée dans la
 * liste serait une donnée personnelle qui survit à une demande d'effacement,
 * ce qui est exactement ce que ce bouton promet de ne pas faire.
 *
 * Deux séparateurs : les préférences historiques s'écrivent `skitrack-v4-…`,
 * les données de l'utilisateur (favoris, séjours) `skitrack.favorites.v1`. Le
 * seul préfixe `skitrack-` laissait les secondes en place — un favori et un
 * séjour enregistré sont pourtant exactement le genre de donnée que ce bouton
 * vise. Le préfixe est donc réduit à ce que les deux ont en commun.
 */
function purgeLocalData(): void {
  // La couche `store` efface d'abord ses propres clés — elle seule sait ce
  // qu'elle a écrit. Le balayage par préfixe qui suit reste le filet : il
  // attrape les clés d'écrans qui n'ont pas de propriétaire déclaré.
  void clearUserData()
  const doomed: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && /^skitrack[-.]/.test(key)) doomed.push(key)
  }
  for (const key of doomed) localStorage.removeItem(key)
}

export function LegalSection(): JSX.Element {
  const { t } = useI18n()
  const { patch } = useApp()

  const purge = (): void => {
    if (!window.confirm(t('settings_purge_confirm'))) return
    purgeLocalData()
    // Rien ne sert de repeindre l'écran avec un état qui n'existe plus sur le
    // disque : on recharge pour repartir d'un premier lancement.
    patch({ peopleOpen: false, domFicheId: null })
    window.location.reload()
  }

  return (
    <>
      <section className="panel panel--flat settings__section legal">
        <h2>Ce que fait l’application, et ce qu’elle ne fait pas</h2>
        <p>
          SKITRACK compare des domaines skiables et des hébergements, et renvoie vers les sites qui les vendent. Elle ne
          prend aucune réservation, n’encaisse aucun paiement et n’agit pour le compte d’aucun exploitant ni loueur.
          Aucun contrat de voyage n’est conclu dans l’application : elle n’exerce donc pas l’activité d’agent de voyages
          du code du tourisme et n’est pas immatriculée à ce titre. Vendre ou réserver un séjour depuis l’application
          ferait basculer dans ce régime, avec immatriculation Atout France et garantie financière obligatoires.
        </p>
      </section>

      <section className="panel panel--flat settings__section legal">
        <h2>Données personnelles</h2>
        <p>
          Tout est stocké sur cette machine : base locale du moteur, préférences du navigateur. Aucun serveur SKITRACK
          ne reçoit de données, il n’y a ni compte, ni mesure d’audience, ni cookie publicitaire.
        </p>
        <dl className="legal__dl">
          <div>
            <dt>Ce qui est enregistré</dt>
            <dd>
              Noms et âges des voyageurs, adresses de départ, dates de séjour, filtres, votes du groupe, logements
              suivis, niveaux de risque saisis à la main, clés d’API. Les âges servent au calcul des forfaits et des
              cours ; les adresses aux temps de trajet.
            </dd>
          </div>
          <div>
            <dt>Ce qui sort de la machine</dt>
            <dd>
              Les coordonnées géographiques nécessaires aux requêtes : adresse envoyée à la Base Adresse Nationale pour
              le géocodage, point de départ et domaine envoyés au calculateur d’itinéraire, latitude et longitude du
              domaine envoyées à Open-Meteo. Aucun nom de voyageur, aucune donnée du groupe.
            </dd>
          </div>
          <div>
            <dt>Enfants</dt>
            <dd>Un âge suffit, le prénom est facultatif. Rien de ce qui concerne un mineur ne quitte la machine.</dd>
          </div>
          <div>
            <dt>Vos droits</dt>
            <dd>
              Accès, rectification et effacement s’exercent directement : les données sont dans vos fichiers,
              modifiables et supprimables sans passer par personne.
            </dd>
          </div>
        </dl>
        <div>
          <button type="button" className="btn btn--warn" onClick={purge}>
            {t('settings_purge')}
          </button>
        </div>
      </section>

      <section className="panel panel--flat settings__section legal">
        <h2>Licences et attributions</h2>
        <dl className="legal__dl legal__dl--split">
          <div>
            <dt>OpenStreetMap · OpenSkiMap</dt>
            <dd>
              Domaines, pistes et remontées — Open Database License (ODbL) 1.0. Attribution « © contributeurs
              OpenStreetMap — OpenSkiMap.org » affichée dans l’application. Toute redistribution d’une base dérivée doit
              rester sous ODbL ; un export de quelques logements n’en est pas une.
            </dd>
          </div>
          <div>
            <dt>IGN Géoplateforme · RGE ALTI</dt>
            <dd>Altimétrie France — licence ouverte Etalab.</dd>
          </div>
          <div>
            <dt>Base Adresse Nationale</dt>
            <dd>Géocodage France — licence ouverte Etalab.</dd>
          </div>
          <div>
            <dt>Nominatim · OpenStreetMap</dt>
            <dd>
              Géocodage hors France — politique d’usage de la fondation OSM : une requête par seconde, User-Agent
              identifiant, pas d’usage intensif.
            </dd>
          </div>
          <div>
            <dt>Open-Meteo</dt>
            <dd>Neige et prévisions — usage non commercial libre, attribution demandée.</dd>
          </div>
          <div>
            <dt>Fonds de carte</dt>
            <dd>OpenTopoMap — CC-BY-SA, attribution affichée en permanence sur la carte.</dd>
          </div>
          <div>
            <dt>Webcams</dt>
            <dd>Flux publics des exploitants, affichés dans leur lecteur d’origine sans copie ni réencodage.</dd>
          </div>
          <div>
            <dt>Photos et prix des annonces</dt>
            <dd>
              Propriété de leurs plateformes, affichés en citation avec lien vers l’annonce d’origine. Ni revente, ni
              republication.
            </dd>
          </div>
        </dl>
      </section>

      <section className="panel panel--flat settings__section legal">
        <h2>Collecte des annonces</h2>
        <p>
          Les offres proviennent d’API auxquelles l’application est autorisée à accéder, ou d’une page que vous collez
          vous-même. Dans ce cas l’application lit une seule page, à votre demande, en respectant{' '}
          <code>robots.txt</code>, sous un User-Agent qui l’identifie. Aucun parcours de catalogue, aucun contournement
          de protection anti-robot. Sur les hôtes dont les conditions d’utilisation interdisent l’accès automatisé, la
          saisie manuelle prend le relais. Si un calculateur d’itinéraire commercial est configuré, ses conditions
          limitent la durée de conservation des résultats : le cache correspondant est purgé en conséquence.
        </p>
      </section>

      <section className="panel settings__section legal legal--warn">
        <h2>Sécurité en montagne et exactitude des données</h2>
        <p>
          Le risque d’avalanche affiché est celui que vous relevez sur le bulletin officiel, ou rien. Il ne remplace pas
          la lecture du BRA de Météo-France avant une sortie, ni l’avis des professionnels sur place. Hauteurs de neige,
          températures et prévisions sont des sorties de modèle, pas des mesures ; hors des pistes ouvertes et damées,
          la responsabilité de la décision reste celle du pratiquant.
        </p>
        <p className="u-muted">
          Les prix de forfaits, de cours et d’hébergement sont indicatifs, relevés à une date donnée et non
          contractuels ; ceux marqués « ≈ » sont estimés. Seuls les tarifs affichés par le vendeur au moment de la
          réservation font foi. Les altitudes et distances aux pistes viennent de la cartographie et comportent une
          marge d’erreur, signalée écran par écran.
        </p>
      </section>

      <section className="panel panel--flat settings__section legal">
        <h2>Marques et usage</h2>
        <p>
          Les noms de domaines skiables, de stations et de plateformes sont cités à titre d’information pour identifier
          les offres comparées. Ils appartiennent à leurs titulaires respectifs, qui ne sont ni éditeurs ni partenaires
          de l’application. Usage privé : l’application est un outil personnel de comparaison, sans garantie de
          disponibilité ni d’exactitude, et son éditeur ne peut être tenu responsable d’une décision de séjour prise sur
          cette base.
        </p>
        <p className="u-muted" style={{ fontSize: 12 }}>
          Mentions à jour du {REVISION}. Ce texte décrit le fonctionnement réel de l’application ; il ne constitue pas
          un avis juridique.
        </p>
      </section>
    </>
  )
}
