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

import { useMemo } from 'react'
import { useFormat } from '@/hooks/useFormat'
import { massifColor } from '@/domain/massif'
import { useI18n } from '@/i18n'
import type { AppState } from '@/state/appState'
import { FILTER_RANGES, useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'
import { BASE_SOURCES } from '@/data/lodgings'

/** Nombre de tuiles de massif : au-delà, la grille déborde sous le pli. */
const MAX_MASSIFS = 6

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
        {/* La photo occupe tout le héro, d'un bord à l'autre : en colonne de
            grille elle se retrouvait comprimée à côté du texte. Le voile en
            dégradé garde le texte lisible sur sa moitié gauche quelle que soit
            l'image posée. Aucune n'est livrée : `--hero-photo` reste `none`
            tant que le client n'en dépose pas une. */}
        <div className="home__hero-photo" aria-hidden />
        <div className="home__hero-veil" aria-hidden />
        <div className="home__hero-hatch" aria-hidden />
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

            <div className="home__search">
              <input
                className="home__input"
                value={state.domainQuery}
                onChange={(e) => patch({ domainQuery: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') patch({ tab: 'recherche' })
                }}
                placeholder={t('home_search_placeholder')}
                aria-label={t('search_aria')}
              />
              <button type="button" className="home__cta" onClick={() => patch({ tab: 'recherche' })}>
                {t('home_cta')}
              </button>
            </div>

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
        </div>
      </header>

      <section className="home__section">
        <div className="home__section-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="home__h2">
              {t('home_by_massif')} <span style={{ color: 'var(--brand)' }}>{t('home_by_massif_word')}</span>
            </h2>
            <p className="home__section-note">
              {t('home_massif_note')
                .replace('{m}', String(massifCount))
                .replace('{n}', fmt(domains.length))}
            </p>
          </div>
          <button type="button" className="linkbtn" onClick={() => patch({ tab: 'recherche' })}>
            {t('home_all_domains')}
          </button>
        </div>
        <div className="home__massifs">
          {massifs.map((m) => (
            <button
              key={m.name}
              type="button"
              className="home__massif"
              style={{ background: m.tint.soft, borderLeftColor: m.tint.ink }}
              onClick={() => openMassif(m.name, m.list[0]?.id)}
            >
              <strong className="home__massif-name">{m.name}</strong>
              <span className="home__massif-ex">{m.examples}</span>
              <span className="home__massif-count u-num" style={{ color: m.tint.ink }}>
                {t('home_massif_count').replace('{n}', fmt(m.list.length))}
              </span>
            </button>
          ))}
        </div>
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
