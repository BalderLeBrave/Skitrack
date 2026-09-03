/**
 * Écran d'accueil.
 *
 * Premier onglet, et point d'entrée par défaut. Il ne répète pas la recherche :
 * il donne les trois façons d'y entrer que la liste seule ne propose pas — un
 * nom de station, un critère franc (grand domaine, haute altitude, forfait
 * modéré, route courte), ou un massif.
 *
 * Chaque raccourci **pose un vrai filtre** avant d'ouvrir les résultats. Un
 * raccourci qui se contenterait de changer d'onglet ne mériterait pas sa place :
 * il ferait croire à une sélection qui n'a pas eu lieu.
 *
 * Les quatre chiffres du bas sont calculés sur le référentiel chargé, jamais
 * écrits en dur — c'est un écran qui parle de la base de données, il ne peut
 * pas se permettre de la décrire de mémoire.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
// Photo du héros, extraite de la constante base64 du prototype de refonte.
// Source : wallspic, aperçu 105928. LICENCE À VÉRIFIER PAR ADRIEN avant toute
// distribution de l'application — le fichier est embarqué dans le paquet.
import heroJpg from '@/assets/hero.jpg'
import { Flocons } from '@/components/Flocons'
import { PopularStations } from '@/components/PopularStations'
import { SearchBar } from '@/components/SearchBar'
import { massifPhoto } from '@/components/photos'
import { useFormat } from '@/hooks/useFormat'
import { massifColor } from '@/domain/massif'
import { useI18n } from '@/i18n'
import type { AppState } from '@/state/appState'
import { FILTER_RANGES, useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'
import { useWeather } from '@/state/weather'
import { BASE_SOURCES } from '@/data/lodgings'
import { snowDepths } from '@/data/weather'

/** Nombre de tuiles de massif : au-delà, la grille déborde sous le pli. */
const MAX_MASSIFS = 6

/**
 * Encart flottant du héros : la neige relevée ce matin.
 *
 * **Il ne se rend que si le modèle a répondu.** `snowDepths().releve` est le
 * seul test qui fasse foi : le référentiel porte bien un champ `neige`, mais
 * c'est un jeu de démonstration qui annonce 95 cm à la mi-août. Sans relevé,
 * l'encart est absent — pas de tiret, pas de valeur grise, pas de substitut.
 */
function SnowAside(): JSX.Element | null {
  const { filtered } = useDerived()
  const { weatherOf } = useWeather()
  const { fmt } = useFormat()
  const { t } = useI18n()

  /**
   * Une ligne exige `bas` **et** `haut`. Un seul des deux ne suffit pas : la
   * valeur manquante s'écrirait « — » dans `.crn-releve`, c'est-à-dire un tiret
   * en chasse fixe, à l'endroit même où la typographie promet un relevé.
   *
   * Aucune requête n'est déclenchée ici : `weatherOf` est une lecture de la
   * table déjà chargée, et c'est `WeatherProvider` qui décide quoi demander,
   * sur les domaines de tête de liste. Les domaines jamais interrogés
   * ressortent simplement `releve: false`.
   */
  const rows = filtered
    .map((d) => ({ d, s: snowDepths(weatherOf(d.id)) }))
    .filter(
      (r): r is { d: (typeof filtered)[number]; s: { bas: number; haut: number; releve: true } } =>
        r.s.releve && r.s.bas != null && r.s.haut != null
    )
    .sort((a, b) => b.s.haut - a.s.haut)
    .slice(0, 3)

  if (rows.length === 0) return null
  const maxHaut = Math.max(...rows.map(({ s }) => s.haut)) || 1

  return (
    <aside className="home__snowcard">
      <span className="home__snowcard-title">{t('home_snow_today')}</span>
      {rows.map(({ d, s }) => (
        <div className="home__snowcard-row" key={d.id}>
          <span className="home__snowcard-place">{d.name}</span>
          <span className="home__snowcard-val u-num crn-releve">
            {fmt(s.bas)} / {fmt(s.haut)} cm
          </span>
          <span className="home__snowcard-gauge" aria-hidden>
            <i style={{ width: `${(s.haut / maxHaut) * 100}%` }} />
          </span>
        </div>
      ))}
      <span className="home__snowcard-note">{t('snow_base_top')}</span>
    </aside>
  )
}


export function HomePage(): JSX.Element {
  const { state, patch, domains } = useApp()
  const { forfaitOf } = useDerived()
  const { eur, fmt } = useFormat()
  const { t } = useI18n()

  const massifs = useMemo(() => {
    const by = new Map<string, typeof domains>()
    for (const d of domains) {
      const key = d.massif || t('massif_other')
      const list = by.get(key)
      if (list) list.push(d)
      else by.set(key, [d])
    }
    return [...by.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, MAX_MASSIFS)
      .map(([name, list]) => ({
        name,
        list,
        tint: massifColor(name),
        // Photo par nom de massif, tuile générique sinon : la grille reste
        // dérivée du référentiel, elle n'est pas une liste d'images.
        photo: massifPhoto(name),
        // Deux exemples pris parmi les plus grands : ce sont ceux qu'on
        // reconnaît, et ils disent le niveau du massif mieux qu'un adjectif.
        examples: [...list]
          .sort((a, b) => b.km - a.km)
          .slice(0, 2)
          .map((d) => d.name)
          .join(', ')
      }))
  }, [domains, t])

  const stats = useMemo(() => {
    if (domains.length === 0) return []
    const prices = domains.map((d) => forfaitOf(d).j6).filter((v): v is number => v != null).sort((a, b) => a - b)
    const median = prices.length ? prices[Math.floor(prices.length / 2)] : null
    const biggest = [...domains].sort((a, b) => b.km - a.km)[0]
    // Les sources annoncées sont celles du dernier relevé, plus le socle hors
    // moteur : afficher un chiffre figé mentirait dès le premier connecteur
    // retiré.
    const sources = [...new Set([...BASE_SOURCES, ...state.lodgQueried])]
    return [
      { label: t('home_stat_domains'), value: fmt(domains.length), note: t('home_stat_domains_note') },
      {
        label: t('home_stat_median_pass'),
        value: median != null ? eur(median) : '—',
        note: t('home_stat_median_pass_note')
      },
      { label: t('home_stat_biggest'), value: `${fmt(biggest.km)} km`, note: biggest.name },
      {
        label: t('home_stat_sources'),
        value: String(sources.length),
        note: sources.join(', ') || t('home_stat_sources_none')
      }
    ]
  }, [domains, forfaitOf, state.lodgQueried, eur, fmt, t])

  const massifCount = new Set(domains.map((d) => d.massif).filter(Boolean)).size

  /** Carte de massif en vue, pour le numéro allumé du sommaire. */
  const [active, setActive] = useState(0)
  const cards = useRef<(HTMLElement | null)[]>([])

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i))
        }
      },
      // Mêmes marges que le prototype : la bande active est le tiers central.
      { rootMargin: '-35% 0px -55% 0px' }
    )
    for (const el of cards.current) if (el) obs.observe(el)
    return () => obs.disconnect()
  }, [massifs.length])

  /** Raccourcis : chacun pose sa plage **entière**, bornes basse et haute. */
  const shortcuts: { label: string; title: string; filter: Partial<AppState> }[] = [
    {
      label: t('home_sc_large'),
      title: t('home_sc_large_title'),
      filter: { kmMin: 200, kmMax: FILTER_RANGES.km.max }
    },
    {
      label: t('home_sc_high'),
      title: t('home_sc_high_title'),
      filter: { baseMin: 1800, baseMax: FILTER_RANGES.base.max }
    },
    {
      label: t('home_sc_cheap'),
      title: t('home_sc_cheap_title'),
      filter: { forfaitMin: 0, forfaitMax: 260 }
    },
    {
      label: t('home_sc_near'),
      title: t('home_sc_near_title'),
      filter: { travelMin: 0, travelMax: 240 }
    }
  ]

  /**
   * Ouverture d'un massif : le contexte est **remis à zéro**.
   *
   * Poser `massifs: [nom]` sans toucher au reste ne suffit pas. Une épingle de
   * carte remonte son domaine en tête même hors filtres, et un cadrage hérité
   * d'un autre massif continue d'écarter des domaines : on cliquait « Pyrénées »
   * et la liste montrait des Alpes en tête, ou trois stations sur trente. Le
   * recadrage est demandé par drapeau, la carte n'étant pas encore montée.
   */
  const openMassif = (name: string, firstId: number | undefined): void => {
    patch({
      tab: 'recherche',
      massifs: [name],
      domainQuery: '',
      pinnedId: null,
      domBounds: null,
      domMapSync: false,
      domFitWanted: true,
      selectedId: firstId ?? null
    })
  }

  return (
    <div className="home">
      <header className="home__hero">
        {/* La photo est le fond du héros, d'un bord à l'autre. Elle est
            empaquetée avec l'application : plus de repli en hachure, il n'y a
            plus de cas où elle manque.

            Le voile en dégradé n'est pas décoratif. L'accroche est blanche et
            elle est posée sur de la neige blanche ; sans ce dégradé, sombre en
            bas et léger en haut, elle disparaît. L'ancien voile générique est
            neutralisé pour ne pas assombrir deux fois. */}
        <div className="home__hero-photo" style={{ backgroundImage: `url(${heroJpg})` }} aria-hidden />
        <div className="home__hero-veil" aria-hidden />
        {/* Même réglage que la neige des écrans-outils : qui la coupe dans
            Réglages la coupe partout, y compris ici. */}
        {state.snowfall && <Flocons />}
        <div className="home__hero-inner">
          <div className="home__hero-text">
            <span className="home__badge">
              {t('home_badge').replace('{n}', fmt(domains.length)).replace('{m}', String(massifCount))}
            </span>
            <h1 className="home__title">
              {t('home_title_1')}
              <br />
              <span className="home__title-accent">{t('home_title_2')}</span>
            </h1>
            <p className="home__lead">{t('home_lead')}</p>

            {/* Le CTA pilule du prototype a été retiré. Il était posé juste
                au-dessus de la barre de recherche et menait au même écran,
                mais les mains vides : la barre y va avec une destination, les
                pastilles avec un critère. Un quatrième chemin qui n'emporte
                rien n'ajoutait pas une façon d'entrer, il en dupliquait une en
                moins bien, au centre du héros. Le remettre est une ligne :
                voir `home__cta` dans styles.css et `home_cta_start` au
                catalogue, tous deux conservés. */}
            <SearchBar />

            <div className="home__shortcuts">
              {shortcuts.map((sc) => (
                <button
                  key={sc.label}
                  type="button"
                  className="home__shortcut"
                  title={sc.title}
                  onClick={() => patch({ tab: 'recherche', ...sc.filter })}
                >
                  {sc.label}
                </button>
              ))}
            </div>
          </div>
          <SnowAside />
        </div>
      </header>

      <PopularStations />

      {/* Sommaire de massifs : titre collant à gauche, cartes empilées au
          centre, index numéroté collant à droite. L'index suit le défilement
          par `IntersectionObserver` — pas par un calcul de position au
          `scroll`, qui obligerait à mesurer à chaque image. Les marges
          d'observation sont celles du prototype : la carte devient active
          quand elle occupe la bande centrale de la fenêtre. */}
      <section className="home__mass">
        <div className="home__mass-title">
          <h2 className="home__h2">
            {t('home_by_massif')} <span style={{ color: 'var(--brand)' }}>{t('home_by_massif_word')}</span>
          </h2>
          <p className="home__section-note">
            {t('home_massif_note')
              .replace('{m}', String(massifCount))
              .replace('{n}', fmt(domains.length))}
          </p>
          <button type="button" className="linkbtn" onClick={() => patch({ tab: 'recherche' })}>
            {t('home_all_domains')}
          </button>
        </div>

        <div className="home__mass-list">
          {massifs.map((m, i) => (
            <article
              key={m.name}
              className="mcard"
              data-i={i}
              ref={(el) => {
                cards.current[i] = el
              }}
            >
              <div
                className={`mcard__photo${m.photo ? '' : ' mcard__photo--plain'}`}
                style={
                  m.photo ? { backgroundImage: `url(${m.photo})` } : { background: m.tint.soft }
                }
                aria-hidden
              />
              <div className="mcard__foot">
                <div className="mcard__id">
                  <strong className="mcard__name">{m.name}</strong>
                  <span className="mcard__ex">
                    {t('home_massif_count').replace('{n}', fmt(m.list.length))} · {m.examples}
                  </span>
                </div>
                <button
                  type="button"
                  className="mcard__disc"
                  aria-label={t('home_massif_explore').replace('{m}', m.name)}
                  title={t('home_massif_explore').replace('{m}', m.name)}
                  onClick={() => openMassif(m.name, m.list[0]?.id)}
                >
                  →
                </button>
              </div>
            </article>
          ))}
        </div>

        <nav className="home__mass-index" aria-label={t('home_massif_index')}>
          {massifs.map((m, i) => (
            <button
              key={m.name}
              type="button"
              data-on={active === i}
              onClick={() => cards.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            >
              <span className="home__mass-num u-num">{String(i + 1).padStart(2, '0')}</span>
              {m.name}
            </button>
          ))}
        </nav>
      </section>

      <section className="home__section home__section--last">
        <div className="home__stats">
          {stats.map((s) => (
            <div key={s.label} className="home__stat">
              <span className="home__stat-label">{s.label}</span>
              <strong className="home__stat-value u-num">{s.value}</strong>
              <span className="home__stat-note">{s.note}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
