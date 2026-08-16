import { useCallback, useEffect, useRef, useState } from 'react'
import { ComparePanel } from '@/components/ComparePanel'
import { ImportDialog } from '@/components/ImportDialog'
import { SkiSearchLoading } from '@/components/SkiSearchLoading'
import { CloseIcon } from '@/components/Icons'
import { LodgingCard } from '@/components/LodgingCard'
import { LodgingFilters } from '@/components/LodgingFilters'
import { LodgingGeoPanel } from '@/components/LodgingGeoPanel'
import { LodgingMap } from '@/components/LodgingMap'
import { LodgingSheet } from '@/components/LodgingSheet'
import { ResultGrid } from '@/components/ResultGrid'
import { deepLinks } from '@/data/deeplinks'
import { lodgingCoords, useLodgingGeo } from '@/data/lodgingGeo'
import { lodgingSources, medianTotal, sourceHealth } from '@/data/lodgings'
import type { Lodging } from '@/data/lodgings'
import { useAirbnbRecheck } from '@/data/useAirbnbRecheck'
import { AIRBNB_SEARCH_TIMEOUT_MS, runAirbnbSearch } from '@/data/runAirbnbSearch'
import { runProviderSearch } from '@/data/runProviderSearch'
import { hasCoords } from '@/data/referentiel'
import { WEEKS } from '@/data/snow'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { LODG_FILTER_RESET, useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'

export function LodgingsPage(): JSX.Element {
  const { fmt, fmtDay } = useFormat()
  const { t } = useI18n()
  const { state, patch, narrow } = useApp()
  const derived = useDerived()
  /**
   * Relevé en vol.
   *
   * Une référence et non un état : elle sert à ne pas relancer deux fois la
   * même recherche quand l'effet qui observe `lodgPhase` se rejoue, et rien à
   * l'écran n'en dépend — l'affichage, lui, ne lit que `lodgPhase`.
   */
  const running = useRef(false)

  const d = derived.lodgDomain
  const median = medianTotal(derived.lodgAll)
  const health = sourceHealth(lodgingSources(derived.lodgAll))

  // La vérification porte sur la liste complète : filtrer d'abord puis
  // vérifier ferait disparaître une annonce du décompte au moment même où on
  // la déclare douteuse.
  const geo = useLodgingGeo(d, derived.lodgList)

  /**
   * Restriction au cadrage de la carte.
   *
   * N'a de sens que quand la carte est effectivement à l'écran, à côté de la
   * liste : en fenêtre étroite elle passe sous la liste, et filtrer sur un
   * cadrage qu'on ne voit pas escamoterait des offres sans raison visible.
   * L'annonce ouverte échappe au filtre — la faire disparaître sous la fiche
   * qu'on est en train de lire serait absurde.
   */
  const boundsActive = state.lodgBounds != null && state.lodgMapOpen && !narrow && state.lodgMapSync
  const inBounds = (lg: (typeof derived.lodgList)[number]): boolean => {
    const b = state.lodgBounds
    if (!b || !d) return true
    if (lg.id === state.ficheId) return true
    const [lon, lat] = lodgingCoords(d, lg)
    return lon >= b.w && lon <= b.e && lat >= b.s && lat <= b.n
  }

  const afterBounds = boundsActive ? derived.lodgList.filter(inBounds) : derived.lodgList
  const outOfView = boundsActive ? derived.lodgList.length - afterBounds.length : 0
  const visibleLodgings = state.hideBadGeo
    ? afterBounds.filter((lg) => geo.statusOf(lg).level !== 'bad')
    : afterBounds
  /** Liste et carte côte à côte : en fenêtre étroite la carte passe dessous. */
  const splitOpen = state.lodgMapOpen && !narrow

  /**
   * Poignée de partage entre la liste et la carte.
   *
   * En pourcentage et non en pixels : la fenêtre d'une application de bureau
   * change de taille, et une largeur de carte figée à 400 px finit soit
   * ridicule sur un grand écran, soit envahissante sur un petit. Les bornes
   * 26–74 % gardent les deux volets utilisables — sous 26 % une vignette de
   * logement ne tient plus, au-delà de 74 % la carte n'a plus d'intérêt.
   */
  const startSplit = useCallback(
    (e: React.PointerEvent<HTMLDivElement>): void => {
      const host = e.currentTarget.parentElement
      if (!host) return
      const rect = host.getBoundingClientRect()
      const move = (ev: PointerEvent): void => {
        const pct = Math.min(74, Math.max(26, ((ev.clientX - rect.left) / rect.width) * 100))
        patch({ lodgSplit: Math.round(pct) })
      }
      const up = (): void => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        document.body.style.userSelect = ''
        document.body.style.cursor = ''
      }
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'col-resize'
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [patch]
  )

  const geoAlert = [
    health.down.length > 0 ? `${health.down.length} source(s) injoignable(s)` : null,
    geo.summary.bad > 0 ? `${geo.summary.bad} position(s) à corriger` : null
  ]
    .filter(Boolean)
    .join(' · ')

  const rescan = (): void => {
    patch({ lodgPhase: 'searching' })
  }

  const resetLodgFilters = (): void => {
    patch({ ...LODG_FILTER_RESET })
  }

  /**
   * Annonces dont le prix a été relevé pour d'autres dates que celles en cours.
   *
   * Un tarif Airbnb dépend de la période : celui du 7 février ne dit rien de
   * celui du 3 janvier. On compte donc les prix devenus caducs pour pouvoir le
   * dire à l'utilisateur — et lui proposer de les rafraîchir d'un bouton.
   */
  const staleCount = derived.lodgList.filter(
    (lg) =>
      lg.total > 0 &&
      lg.priceCheckIn != null &&
      (lg.priceCheckIn !== state.arrDate || lg.priceCheckOut !== state.depDate)
  ).length

  const airbnbSearchUrl =
    deepLinks({
      domainName: d?.name ?? '',
      arrDate: state.arrDate,
      depDate: state.depDate,
      travelers: state.travelers,
      rooms: state.rooms
    }).find((l) => l.name === 'Airbnb')?.url ?? null

  // Revérification : ouvre Airbnb aux bonnes dates puis récupère le collage tout
  // seul au retour dans l'application. Voir `useAirbnbRecheck`.
  const recheck = useAirbnbRecheck({
    imported: state.imported,
    domainId: d?.id ?? 0,
    domainName: d?.name ?? '',
    checkIn: state.arrDate,
    checkOut: state.depDate,
    capacity: state.travelers,
    nights: derived.nights,
    fallbackAltitude: d ? d.village || d.min : 0,
    searchUrl: airbnbSearchUrl,
    onImported: (lodgings) => patch({ imported: lodgings })
  })

  const [searchError, setSearchError] = useState<string | null>(null)
  const [elapsedSec, setElapsedSec] = useState(0)


  useEffect(() => {
    if (state.lodgPhase !== 'searching') {
      setElapsedSec(0)
      return
    }
    setElapsedSec(0)
    const started = Date.now()
    const id = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - started) / 1000))
    }, 1000)
    return () => window.clearInterval(id)
  }, [state.lodgPhase])

  const criteriaReady =
    Boolean(state.arrDate) &&
    Boolean(state.depDate) &&
    state.arrDate < state.depDate &&
    state.travelers >= 1

  /**
   * Lancement du relevé.
   *
   * La garde porte sur `running`, pas sur `lodgPhase` : c'est justement en
   * phase `'searching'` que l'effet ci-dessous appelle cette fonction, et se
   * garder de la phase reviendrait à ne jamais rien lancer.
   */
  const launchSearch = useCallback(async (): Promise<void> => {
    if (!d || !criteriaReady || running.current) return
    running.current = true
    setSearchError(null)
    patch({ lodgPhase: 'searching', lodgSearchMsg: 'Ouverture du navigateur invisible…' })
    try {
      // Airbnb et les autres sources sont deux chemins distincts dans le
      // processus principal — `airbnb:scrape` d'un côté, `providers:search` de
      // l'autre — et ils sont lancés ensemble. `allSettled` plutôt que `all` :
      // c'est le principe du moteur, une source en panne ne doit pas vider le
      // résultat des autres.
      const [airbnb, others] = await Promise.allSettled([
        runAirbnbSearch({
          domainId: d.id,
          domainName: d.name,
          villageOrMinAlt: d.village || d.min,
          checkIn: state.arrDate,
          checkOut: state.depDate,
          adults: state.travelers,
          children: state.children,
          capacity: state.travelers,
          nights: derived.nights,
          imported: state.imported
        }),
        runProviderSearch({
          domainId: d.id,
          domainName: d.name,
          lat: hasCoords(d) ? d.lat : undefined,
          lon: hasCoords(d) ? d.lon : undefined,
          checkIn: state.arrDate,
          checkOut: state.depDate,
          adults: state.travelers,
          children: state.children,
          nights: derived.nights,
          officialUrl: d.booking ?? d.website,
          existing: state.imported
        })
      ])

      // Valeur affinée plutôt qu'un booléen : le compilateur ne sait pas
      // rattacher un `airbnbOk` isolé au membre `ok: true` de l'union.
      const ok = airbnb.status === 'fulfilled' && airbnb.value.ok ? airbnb.value : null
      // `runAirbnbSearch` renvoie la liste complète, existants compris ; on
      // repart d'elle quand elle a abouti, sinon de ce qu'on avait déjà.
      const base: Lodging[] = ok ? ok.imported : state.imported

      const otherLodgings = others.status === 'fulfilled' ? others.value.lodgings : []
      const outcomes = others.status === 'fulfilled' ? others.value.outcomes : []

      // Les URL déjà présentes dans `base` sont écartées : `runProviderSearch`
      // a dédoublonné contre `state.imported`, pas contre ce qu'Airbnb vient
      // d'ajouter.
      const known = new Set(base.map((l) => l.url).filter(Boolean))
      const fresh = otherLodgings.filter((l) => !known.has(l.url))

      if (!ok && fresh.length === 0) {
        const why = [
          airbnb.status === 'rejected'
            ? String(airbnb.reason)
            : airbnb.value.ok
              ? null
              : airbnb.value.error,
          others.status === 'rejected' ? String(others.reason) : null,
          ...outcomes.filter((o) => o.error).map((o) => `${o.source} : ${o.error}`)
        ].filter(Boolean)
        setSearchError(why.join(' · ') || t('scan_no_source_answered'))
        patch({ lodgPhase: 'criteria', lodgSearchMsg: null })
        return
      }

      // Une source muette doit se voir même quand la recherche aboutit par
      // ailleurs : sans cette ligne, un Booking sans clé serait indiscernable
      // d'un Booking sans offre, et on croirait l'écran toujours cassé.
      const failed = [...new Set(outcomes.filter((o) => o.error).map((o) => o.source))]

      const parts = [
        ok ? ok.message : null,
        // Une annonce qui disparaît du relevé est presque toujours une annonce
        // réservée : le dire ici évite d'aller le découvrir sur Airbnb.
        ok && ok.missing > 0 ? t('lodg_gone_tally').replace('{n}', String(ok.missing)) : null,
        fresh.length > 0
          ? t('scan_other_sources_tally')
              .replace('{n}', String(fresh.length))
              .replace('{s}', String(outcomes.filter((o) => o.count > 0).length))
          : null,
        failed.length > 0
          ? t('scan_sources_failed').replace('{s}', failed.join(', '))
          : null
      ].filter(Boolean)

      patch({
        imported: [...base, ...fresh],
        lodgPhase: 'results',
        lodgSearchMsg: parts.join(' · ') || null,
        lastScan: Date.now()
      })
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : String(err))
      patch({ lodgPhase: 'criteria', lodgSearchMsg: null })
    } finally {
      running.current = false
    }
  }, [
    d,
    criteriaReady,
    state.arrDate,
    state.depDate,
    state.travelers,
    state.children,
    state.imported,
    derived.nights,
    patch
  ])

  /**
   * `lodgPhase` est la seule source de vérité de l'écran de chargement : qui
   * pose `'searching'` demande un relevé, sans avoir à connaître `launchSearch`.
   * C'est ce qui permet à `rescan()` de tenir en une ligne.
   *
   * Sortie garantie : sans domaine ou sans critères valides, la phase retombe
   * sur `'criteria'` au lieu de laisser l'écran tourner devant une recherche
   * que personne ne lancera.
   */
  useEffect(() => {
    if (state.lodgPhase !== 'searching' || running.current) return
    if (!d || !criteriaReady) {
      patch({ lodgPhase: 'criteria', lodgSearchMsg: null })
      return
    }
    void launchSearch()
  }, [state.lodgPhase, d, criteriaReady, launchSearch, patch])

  if (!d) {
    return (
      <div className="page">
        <p className="u-muted">{t('lodg_no_domain')}</p>
      </div>
    )
  }

  return (
    <div className="lodgings">
      <div className="lodgings__bar">
        <button type="button" className="linkbtn" onClick={() => patch({ tab: 'recherche' })}>
          ← Domaines
        </button>
        <h2 style={{ margin: 0, fontSize: 16 }}>{d.name}</h2>
        {d.pass && <span className="tag">{d.pass}</span>}
        {d.glacier && <span className="tag tag--link">Glacier</span>}
        <span className="u-muted" style={{ fontSize: 12 }}>
          {fmt(d.min)} – {fmt(d.max)} m{d.curated ? ' · bas des pistes vérifié ✓' : ''}
        </span>
        <span className="u-spacer" />
        <span className="u-muted" style={{ fontSize: 12 }}>
          {fmtDay(state.arrDate)} → {fmtDay(state.depDate)} · {state.travelers} voyageurs · {state.rooms} chambres min
        </span>
      </div>

      <div
        className="lodgings__shell"
        style={{ gridTemplateColumns: state.lodgFiltersOpen ? 'minmax(0,300px) minmax(0,1fr)' : 'minmax(0,1fr)' }}
      >
        {state.lodgFiltersOpen && <LodgingFilters domain={d} />}

        {/* Côte à côte, la section ne défile plus : l'en-tête et les bandeaux
            restent en place et c'est le volet liste qui défile, sinon la carte
            sortirait de l'écran dès qu'on descend dans les résultats. */}
        <section
          style={
            splitOpen
              ? { display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 16, minHeight: 0 }
              : { overflow: 'auto', padding: 16 }
          }
        >
          {state.lodgPhase === 'searching' && (
            <SkiSearchLoading
              domain={d}
              message={state.lodgSearchMsg}
              elapsedSec={elapsedSec}
              timeoutSec={Math.round(AIRBNB_SEARCH_TIMEOUT_MS / 1000)}
              // Non filtré : le panneau décompte ce qui est connu du domaine,
              // pas ce que les filtres laissent passer.
              known={derived.lodgAll}
            />
          )}

          {state.lodgPhase === 'criteria' && (
            <div className="criteria-panel">
              <h2>Critères de recherche — {d.name}</h2>
              <p className="u-muted" style={{ margin: 0, fontSize: 13 }}>
                Renseignez les dates et le groupe, puis lancez la recherche automatique sur Airbnb.
              </p>
              <div className="criteria-panel__grid">
                <label>
                  {t('arrival')}
                  <input
                    type="date"
                    className="field"
                    value={state.arrDate}
                    onChange={(e) => patch({ arrDate: e.target.value })}
                  />
                </label>
                <label>
                  {t('departure_label')}
                  <input
                    type="date"
                    className="field"
                    value={state.depDate}
                    onChange={(e) => patch({ depDate: e.target.value })}
                  />
                </label>
                <label>
                  Voyageurs
                  <input
                    type="number"
                    className="field"
                    min={1}
                    max={12}
                    value={state.travelers}
                    onChange={(e) =>
                      patch({ travelers: Math.max(1, Math.min(12, Number(e.target.value) || 1)) })
                    }
                  />
                </label>
                <label>
                  Enfants
                  <input
                    type="number"
                    className="field"
                    min={0}
                    max={11}
                    value={state.children}
                    onChange={(e) =>
                      patch({ children: Math.max(0, Math.min(11, Number(e.target.value) || 0)) })
                    }
                  />
                </label>
                <label>
                  Chambres min.
                  <input
                    type="number"
                    className="field"
                    min={1}
                    max={6}
                    value={state.rooms}
                    onChange={(e) =>
                      patch({ rooms: Math.max(1, Math.min(6, Number(e.target.value) || 1)) })
                    }
                  />
                </label>
              </div>
              {searchError && (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--warn)' }}>⚠ {searchError}</p>
              )}
              {!criteriaReady && (
                <p className="u-muted" style={{ margin: 0, fontSize: 12 }}>
                  {t('lodg_dates_invalid')}
                </p>
              )}
              <div className="criteria-panel__actions">
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={!criteriaReady}
                  onClick={() => void launchSearch()}
                >
                  Rechercher
                </button>
                <button type="button" className="btn" onClick={() => patch({ lodgPhase: 'results' })}>
                  {t('lodg_see_imported')}
                </button>
              </div>
            </div>
          )}

          {state.lodgPhase === 'results' && (
          <>
          <header className="lodgings__head">

            <button
              type="button"
              className="btn btn--small"
              onClick={() => patch({ lodgFiltersOpen: !state.lodgFiltersOpen })}
            >
              {state.lodgFiltersOpen ? '◂ Filtres' : '▸ Filtres'}
            </button>
            <h2 className="results__count">{derived.lodgList.length} logement(s)</h2>
            <span className="u-muted" style={{ fontSize: 12 }}>
              prix tout compris, {derived.nights} nuit(s), {state.travelers} personnes · offres de moins d’une heure
            </span>
            {/* Un filtre qui écarte des annonces doit se voir : sans ce compte,
                une liste courte ressemble à une recherche infructueuse. */}
            {derived.lodgHidden > 0 && derived.lodgList.length > 0 && (
              <button
                type="button"
                className="linkbtn"
                style={{ fontSize: 12 }}
                onClick={resetLodgFilters}
                title="Réinitialiser les filtres de l’écran Logements"
              >
                {derived.lodgHidden} masqué(s) par les filtres — tout afficher
              </button>
            )}
            <span className="u-spacer" />
            {/* L'alerte est distincte du bouton d'état : ce qui ne va pas doit
                se voir sans avoir à ouvrir le panneau pour le découvrir. */}
            {geoAlert && (
              <button
                type="button"
                className="btn btn--pill btn--warn"
                onClick={() => patch({ lodgStatusOpen: true })}
              >
                ⚠ {geoAlert}
              </button>
            )}
            <button
              type="button"
              className="btn btn--pill"
              onClick={() => patch({ lodgStatusOpen: !state.lodgStatusOpen })}
              title="État du relevé et des positions"
            >
              {geo.busy
                ? 'Relevé en cours…'
                : state.lodgStatusOpen
                  ? 'Masquer l’état du relevé'
                  : 'État du relevé'}
            </button>
            <button type="button" className="btn btn--pill" onClick={() => patch({ flexOpen: !state.flexOpen })}>
              {state.flexOpen ? 'Dates flexibles ▾' : 'Dates flexibles ▸'}
            </button>
            <button
              type="button"
              className="btn btn--primary btn--pill"
              onClick={() => patch({ lodgPhase: 'criteria', lodgSearchMsg: null })}
            >
              Rechercher
            </button>
            <button type="button" className="btn btn--pill" onClick={() => patch({ importOpen: true })}>
              ＋ Importer une annonce
            </button>
            <button
              type="button"
              className="btn btn--pill"
              onClick={() => patch({ lodgMapOpen: !state.lodgMapOpen })}
            >
              {state.lodgMapOpen ? 'Masquer la carte ◂' : 'Afficher la carte ▸'}
            </button>
          </header>

          {state.lodgStatusOpen && (
            <LodgingGeoPanel
              summary={geo.summary}
              busy={geo.busy}
              error={geo.error}
              osmError={geo.osmError}
              onRecheck={geo.recheck}
              health={health}
              median={median}
              dupMerged={derived.dupMerged}
              onRescan={rescan}
            />
          )}

          {outOfView > 0 && (
            <div className="outofview">
              <span className="u-muted">{outOfView} logement(s) hors du cadrage actuel</span>
              <button
                type="button"
                className="linkbtn linkbtn--sm"
                onClick={() => patch({ lodgBounds: null })}
              >
                voir tout le domaine
              </button>
            </div>
          )}

          {state.lodgSearchMsg && (
            <div className="srcbanner" style={{ borderColor: 'var(--ok, #3d9a6a)' }}>
              <strong style={{ fontWeight: 600 }}>{state.lodgSearchMsg}</strong>
              <span className="u-spacer" />
              <button type="button" className="btn btn--small" onClick={() => patch({ lodgSearchMsg: null })}>
                OK
              </button>
            </div>
          )}

          {(staleCount > 0 || recheck.state.waiting || recheck.state.message) && (
            <div
              className="srcbanner"
              style={{ borderColor: recheck.state.waiting ? 'var(--accent)' : 'var(--warn)' }}
            >
              {recheck.state.waiting ? (
                <>
                  <strong style={{ fontWeight: 600, color: 'var(--accent)' }}>
                    {t('lodg_awaiting_scan')}
                  </strong>
                  <span className="u-muted">
                    {t('paste_step_1')}
                    <strong> « Copier pour SKITRACK »</strong> {t('paste_step_2')}
                  </span>
                  <span className="u-spacer" />
                  <button type="button" className="btn btn--small" onClick={recheck.cancel}>
                    Annuler
                  </button>
                </>
              ) : recheck.state.message ? (
                <>
                  <strong style={{ fontWeight: 600 }}>{recheck.state.message}</strong>
                  <span className="u-spacer" />
                  {staleCount > 0 && (
                    <button
                      type="button"
                      className="btn btn--small btn--strong u-nowrap"
                      onClick={recheck.start}
                    >
                      {t('lodg_recheck_again')}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <strong style={{ fontWeight: 600, color: 'var(--warn)' }}>
                    {staleCount} prix relevé(s) pour d’autres dates
                  </strong>
                  <span className="u-muted">
                    Airbnb recalcule ses tarifs à chaque période : ces montants ne valent plus pour le{' '}
                    {fmtDay(state.arrDate)} → {fmtDay(state.depDate)}.
                  </span>
                  <span className="u-spacer" />
                  <button
                    type="button"
                    className="btn btn--small btn--strong u-nowrap"
                    onClick={recheck.start}
                  >
                    Valider les nouvelles dates ↗
                  </button>
                </>
              )}
            </div>
          )}

          <div
            className="srcbanner"
            style={{ borderColor: health.down.length ? 'var(--warn)' : 'var(--border)' }}
          >
            <strong style={{ fontWeight: 600 }}>
              {health.down.length || health.late.length
                ? `${health.ok} source(s) sur ${health.total} à jour`
                : `Les ${health.total} sources sont à jour`}
            </strong>
            {health.down.length > 0 && (
              <span style={{ color: 'var(--warn)', fontWeight: 600 }}>injoignable : {health.down.join(', ')}</span>
            )}
            {health.late.length > 0 && (
              <span className="u-muted">relevé de plus de 48 h : {health.late.join(', ')}</span>
            )}
            {median > 0 && <span className="u-muted">médiane du domaine {fmt(median)} €</span>}
            <span className="u-spacer" />
            <label className="check" style={{ margin: 0, whiteSpace: 'nowrap' }}>
              <input
                type="checkbox"
                checked={state.mergeDupes}
                onChange={(e) => patch({ mergeDupes: e.target.checked })}
              />
              Fusionner les doublons{' '}
              <span className="u-muted">
                · {derived.dupMerged > 0 ? `${derived.dupMerged} doublon(s) fusionné(s)` : 'aucun doublon'}
              </span>
            </label>
            <button type="button" className="btn btn--pill btn--small" style={{ fontSize: 12 }} onClick={rescan}>
              {t('lodg_rescan')}
            </button>
          </div>

          {state.flexOpen && (
            <div className="panel" style={{ padding: '16px 18px', marginBottom: 16 }}>
              <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600 }}>Semaines voisines</p>
              <p className="u-muted" style={{ margin: '0 0 10px', fontSize: 12 }}>
                Écart de prix moyen des logements du domaine par rapport à la semaine choisie. Cliquez une semaine pour
                l’appliquer.
              </p>
              <div style={{ display: 'grid', gap: 6 }}>
                {WEEKS.map((w) => {
                  const active = w.arr === state.arrDate
                  return (
                    <button
                      key={w.arr}
                      type="button"
                      className={`weekrow${active ? ' weekrow--on' : ''}`}
                      onClick={() => patch({ arrDate: w.arr, depDate: w.dep })}
                    >
                      <span>{w.label}</span>
                      <span
                        className="u-num"
                        style={{ fontWeight: 700, color: w.f < 0 ? 'var(--ok)' : 'var(--muted)' }}
                      >
                        {w.f === 0 ? 'référence' : `${Math.round(w.f * 100)} %`}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Liste vide : deux situations opposées, qu'il serait trompeur de
              confondre. Soit rien n'a jamais été importé, soit des annonces
              existent mais aucune ne passe les filtres — et dans ce second
              cas, dire « aucun logement importé » envoie relancer une
              recherche qui rapportera des annonces tout aussi invisibles. */}
          {derived.lodgList.length === 0 && derived.lodgHidden > 0 && (
            <div className="results__empty" style={{ display: 'grid', gap: 12, justifyItems: 'start' }}>
              <p style={{ margin: 0 }}>
                {derived.lodgHidden} logement(s) importé(s) pour <strong>{d.name}</strong>, tous masqués par
                vos filtres.
              </p>
              <p className="u-muted" style={{ margin: 0, fontSize: 13 }}>
                Budget, distance aux pistes, type de bien, chambres minimum ou sources masquées : l’un d’eux
                écarte toute la liste.
              </p>
              <button type="button" className="btn btn--primary" onClick={resetLodgFilters}>
                {t('lodg_filters_reset')}
              </button>
            </div>
          )}
          {derived.lodgList.length === 0 && derived.lodgHidden === 0 && (
            <div className="results__empty" style={{ display: 'grid', gap: 12, justifyItems: 'start' }}>
              <p style={{ margin: 0 }}>
                {t('lodg_none_imported')} <strong>{d.name}</strong> {t('lodg_none_imported_yet')}
              </p>
              <p className="u-muted" style={{ margin: 0, fontSize: 13 }}>
                Les logements affichés ici sont de vraies annonces que vous importez : hébergements
                OpenStreetMap du domaine, ou annonces Airbnb via le marque-page. Chacune est enrichie de sa
                distance aux pistes.
              </p>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => patch({ lodgPhase: 'criteria', lodgSearchMsg: null })}
              >
                Rechercher des annonces
              </button>
            </div>
          )}
          <div
            className={splitOpen ? 'lodgsplit' : undefined}
            style={
              splitOpen
                ? { gridTemplateColumns: `minmax(0,${state.lodgSplit}%) 10px minmax(0,1fr)` }
                : state.lodgMapOpen
                  ? { display: 'grid', gap: 12 }
                  : { display: 'block' }
            }
          >
            {/* Liste et note de masquage dans un même volet : dans la
                grille à trois colonnes, deux enfants séparés placeraient la
                note dans la colonne de la carte. */}
            <div className={splitOpen ? 'lodgsplit__list' : undefined}>
              {/* Pendant un relevé, la liste n'est pas estompée : elle n'est
                  pas rendue du tout. `lodgPhase` vaut alors `'searching'` et
                  c'est `SkiSearchLoading` qui occupe seul la section. */}
              <ResultGrid compact={narrow || splitOpen} label="Logements du domaine">
                {visibleLodgings.map((lg) => (
                  <LodgingCard key={lg.id} lodging={lg} median={median} domain={d} />
                ))}
              </ResultGrid>
              {/* Masquer sans le dire transformerait un doute sur la position
                  en disparition silencieuse de l'offre. */}
              {state.hideBadGeo && afterBounds.length > visibleLodgings.length && (
                <p className="u-muted" style={{ fontSize: 12, margin: '10px 0 0' }}>
                  {afterBounds.length - visibleLodgings.length} annonce(s) masquée(s) pour position
                  invraisemblable —{' '}
                  <button
                    type="button"
                    className="linkbtn linkbtn--sm"
                    onClick={() => patch({ hideBadGeo: false })}
                  >
                    tout afficher
                  </button>
                </p>
              )}
            </div>

            {splitOpen && (
              <div
                className="lodgsplit__handle"
                onPointerDown={startSplit}
                role="separator"
                aria-label="Redimensionner la carte"
                title="Glisser pour agrandir la carte"
              >
                <span className="lodgsplit__grip" />
              </div>
            )}
            {state.lodgMapOpen && <LodgingMap domain={d} />}
          </div>
          </>
          )}
        </section>
      </div>

      {state.ficheId != null && <LodgingSheet domain={d} />}
      {state.importOpen && <ImportDialog domain={d} />}

      {state.compareIds.length > 0 && !state.compareOpen && (
        <div className="comparebar">
          <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>
            {state.compareIds.length} sélectionné(s)
          </span>
          <button type="button" className="comparebar__cta" onClick={() => patch({ compareOpen: true })}>
            Comparer
          </button>
          <button
            type="button"
            className="comparebar__close"
            onClick={() => patch({ compareIds: [], compareOpen: false })}
            title="Vider la sélection"
            aria-label="Vider la sélection"
          >
            <CloseIcon />
          </button>
        </div>
      )}

      {state.compareOpen && <ComparePanel domain={d} />}
    </div>
  )
}
