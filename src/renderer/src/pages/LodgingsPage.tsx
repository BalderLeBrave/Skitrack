import { useCallback, useEffect, useRef, useState } from 'react'
import { ComparePanel } from '@/components/ComparePanel'
import { SkiSearchLoading } from '@/components/SkiSearchLoading'
import { CloseIcon } from '@/components/Icons'
import { LodgingCard } from '@/components/LodgingCard'
import { FilterPopover } from '@/components/FilterPopover'
import { LodgingFilters } from '@/components/LodgingFilters'
import { useActiveLodgingFilters } from '@/components/activeLodgingFilters'
import { LodgingMap } from '@/components/LodgingMap'
import { LodgingSheet } from '@/components/LodgingSheet'
import { ResultGrid } from '@/components/ResultGrid'
import { deepLinks } from '@/data/deeplinks'
import { lodgingCoords, useLodgingGeo } from '@/data/lodgingGeo'
import type { Lodging } from '@/data/lodgings'
import { belongsToDomain } from '@/data/lodgings'
import { useAirbnbRecheck } from '@/data/useAirbnbRecheck'
import { AIRBNB_SEARCH_TIMEOUT_MS, runAirbnbSearch } from '@/data/runAirbnbSearch'
import { centralCapabilityOf } from '@/data/centralCapability'
import { enrichWithAccess } from '@/data/lodgingAccess'
import {
  lodgingsFromOutcome,
  mergeProviderReadings,
  outcomeSummary,
  runProviderSearch,
  sourceLabelOf,
  sourceStatuses
} from '@/data/runProviderSearch'
import { hasCoords } from '@/data/referentiel'
import { domainRadiusKm, domainZone } from '@shared/geo'
import { snowDepths } from '@/data/weather'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { LODG_FILTER_RESET, stayCriteriaReady, useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'
import { useWeather } from '@/state/weather'

export function LodgingsPage(): JSX.Element {
  const { fmt, fmtDay } = useFormat()
  const { t } = useI18n()
  const { state, patch, narrow } = useApp()
  const derived = useDerived()
  const { weatherOf } = useWeather()
  /**
   * Relevé en vol.
   *
   * Une référence et non un état : elle sert à ne pas relancer deux fois la
   * même recherche quand l'effet qui observe `lodgPhase` se rejoue, et rien à
   * l'écran n'en dépend — l'affichage, lui, ne lit que `lodgPhase`.
   */
  const running = useRef(false)

  const d = derived.lodgDomain
  /*
   * Plus de médiane calculée ici : elle ne servait qu'au verdict de prix des
   * vignettes, retiré de l'écran. `medianTotal` reste disponible dans
   * `data/lodgings.ts` — c'est une mesure, et elle garde ses tests.
   */
  // Neige du domaine ouvert, pour le bulletin en tête de mosaïque. `weatherOf`
  // ne répond que pour les domaines réellement demandés — dont celui-ci.
  const domSnow = snowDepths(weatherOf(d?.id ?? -1))
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
    // Le logement qu'on vient de cliquer sur la carte ne peut pas disparaître
    // de la liste au moment où on le choisit : la carte se recentre parfois
    // juste après, et le rectangle publié l'aurait alors exclu.
    if (lg.id === state.lodgPickId) return true
    const [lon, lat] = lodgingCoords(d, lg)
    return lon >= b.w && lon <= b.e && lat >= b.s && lat <= b.n
  }

  // Le compte des exclus n'est plus affiché : le cadrage restreint la liste
  // sans l'annoncer. `voir tout le domaine` a disparu avec le bandeau ; on
  // rouvre la liste entière en coupant la synchronisation de la carte.
  const afterBounds = boundsActive ? derived.lodgList.filter(inBounds) : derived.lodgList
  // Même exemption pour le masquage des positions invraisemblables : une bulle
  // cliquée sur la carte doit se retrouver dans la liste, pas s'y évaporer.
  const visibleLodgings = state.hideBadGeo
    ? afterBounds.filter((lg) => lg.id === state.lodgPickId || geo.statusOf(lg).level !== 'bad')
    : afterBounds

  /** Logement mis en avant, s'il est encore dans la liste affichée. */
  const picked = state.lodgPickId != null ? visibleLodgings.find((lg) => lg.id === state.lodgPickId) : undefined
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

  const resetLodgFilters = (): void => {
    patch({ ...LODG_FILTER_RESET })
  }

  /** Puces des filtres posés : le pendant de `useActiveFilters` côté logements. */
  const lodgActive = useActiveLodgingFilters()

  /*
   * Le compte des prix relevés pour d'autres dates a disparu avec son bandeau :
   * ces annonces ne sont plus dans `derived.lodgList`, écartées en amont par
   * `confirmedPricesOnly`. Le compter reviendrait à compter zéro.
   */

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
    engineDomainId: d?.engineId,
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

  /**
   * Sources annoncées dès l'ouverture, sans attendre un relevé.
   *
   * Le registre du moteur (`providers.health`) dit quels connecteurs sont
   * enregistrés, donc lesquels seront interrogés — l'information existe avant
   * la première recherche, et rien ne justifie de la faire attendre. Sans cet
   * appel, une station encore jamais relevée n'affichait qu'Airbnb, la seule
   * source hors moteur, et Booking.com semblait avoir disparu.
   *
   * Les sources déclarées mais refusées sont écartées : elles ne seront pas
   * interrogées, et une ligne de filtre qu'aucun relevé ne peut rafraîchir
   * n'est pas un filtre.
   */
  useEffect(() => {
    let cancelled = false
    void window.skitrack.providers
      .health()
      .then((list) => {
        if (cancelled) return
        const labels = [...new Set(list.filter((p) => p.registered).map((p) => sourceLabelOf(p.name)))]
        if (labels.length > 0) patch({ lodgQueried: labels })
      })
      .catch(() => {
        // Moteur injoignable : la liste reste celle du dernier relevé, ou le
        // seul socle. Depuis le retrait d'« État du relevé », plus rien ne
        // signale cette panne une fois le relevé terminé.
      })
    return () => {
      cancelled = true
    }
  }, [patch])

  /**
   * Remontée en haut de liste à la mise en avant.
   *
   * Le logement élu passe en tête ; sans remonter le défilement, l'utilisateur
   * reste au milieu de la liste et ne voit rien changer. On remonte le
   * conteneur **et ses parents défilables** : selon que la carte est ouverte ou
   * non, ce n'est pas le même élément qui porte le défilement.
   * Pas de `scrollIntoView`, qui déplacerait aussi la fenêtre.
   */
  const resultsRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (state.lodgPickId == null) return
    const section = resultsRef.current
    if (!section) return
    // Carte ouverte, c'est le volet interne qui défile ; carte fermée, c'est la
    // section elle-même — d'où la descente **et** la remontée de l'arbre.
    section.querySelector('.lodgsplit__list')?.scrollTo?.({ top: 0 })
    for (let node: HTMLElement | null = section; node; node = node.parentElement) {
      if (node.scrollTop > 0) node.scrollTop = 0
    }
  }, [state.lodgPickId])


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

  const criteriaReady = stayCriteriaReady(state)

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
    patch({
      lodgPhase: 'searching',
      lodgSearchMsg: 'Recherche des logements…',
      lodgEmpty: [],
      lodgFailed: []
    })

    // Accumulateur local : les outcomes arrivent hors de React, on fusionne
    // dans `imported` au fil de l'eau sans attendre le dernier connecteur.
    const searchParams = {
      domainId: d.id,
      domainName: d.name,
      lat: hasCoords(d) ? d.lat : undefined,
      lon: hasCoords(d) ? d.lon : undefined,
      radiusMeters: hasCoords(d) ? domainRadiusKm(d.km) * 1000 : undefined,
      checkIn: state.arrDate,
      checkOut: state.depDate,
      adults: state.travelers,
      children: state.children,
      nights: derived.nights,
      officialUrl: d.booking ?? d.website,
      existing: state.imported
    }
    const baseImported = state.imported
    const seen = new Set(baseImported.map((l) => l.url).filter(Boolean) as string[])
    const progressive: Lodging[] = []
    const progressiveOutcomes: ReturnType<typeof outcomeSummary>[] = []

    const unsub = window.skitrack.providers.onOutcome((raw) => {
      progressiveOutcomes.push(outcomeSummary(raw))
      const batch = lodgingsFromOutcome(raw, searchParams, seen)
      const label = sourceLabelOf(raw.provider)
      if (batch.length > 0) {
        progressive.push(...batch)
        patch({
          // Fusion, pas concaténation : une annonce déjà connue est mise à jour
          // à son rang au lieu d'apparaître en double.
          imported: mergeProviderReadings(baseImported, progressive),
          lodgSearchMsg: `${sourceLabelOf(raw.provider)} · +${batch.length} — ${progressive.length} au total`
        })
      } else if (raw.error) {
        // Message court : ne pas coller la stack technique dans le bandeau.
        const soft =
          /délai|timeout|écartée|robots|navigateur|Chromium|Playwright/i.test(raw.error)
            ? t('lodg_src_unavailable').replace('{s}', label)
            : t('lodg_src_no_result').replace('{s}', label)
        // Si d'autres offres sont déjà là, on n'alarme pas : juste un statut discret.
        patch({
          lodgSearchMsg:
            progressive.length > 0
              ? `${progressive.length} offre(s) — ${soft}`
              : soft
        })
      } else {
        patch({
          lodgSearchMsg:
            progressive.length > 0
              ? `${progressive.length} offre(s) — recherche en cours…`
              : `${label} : aucune offre pour ces dates`
        })
      }
    })

    try {
      // Airbnb et les autres sources sont deux chemins distincts dans le
      // processus principal — `airbnb:scrape` d'un côté, `providers:search` de
      // l'autre — et ils sont lancés ensemble. `allSettled` plutôt que `all` :
      // c'est le principe du moteur, une source en panne ne doit pas vider le
      // résultat des autres.
      const [airbnb, others] = await Promise.allSettled([
        runAirbnbSearch({
          domainId: d.id,
          engineDomainId: d.engineId,
          domainName: d.name,
          villageOrMinAlt: d.village || d.min,
          checkIn: state.arrDate,
          checkOut: state.depDate,
          adults: state.travelers,
          children: state.children,
          capacity: state.travelers,
          nights: derived.nights,
          imported: state.imported,
          zone: hasCoords(d) ? domainZone(d) : null
        }),
        runProviderSearch(searchParams)
      ])

      // Valeur affinée plutôt qu'un booléen : le compilateur ne sait pas
      // rattacher un `airbnbOk` isolé au membre `ok: true` de l'union.
      const ok = airbnb.status === 'fulfilled' && airbnb.value.ok ? airbnb.value : null
      // `runAirbnbSearch` renvoie la liste complète, existants compris ; on
      // repart d'elle quand elle a abouti, sinon de ce qu'on avait déjà.
      const base: Lodging[] = ok ? ok.imported : state.imported

      const otherLodgings = others.status === 'fulfilled' ? others.value.lodgings : progressive
      const outcomes = others.status === 'fulfilled' ? others.value.outcomes : progressiveOutcomes

      // Les sources affichées dans les filtres et comptées par l'écran de
      // relevé sont celles que le moteur vient d'interroger, y compris celles
      // qui n'ont rien rendu — c'est la seule liste qui ne peut pas mentir.
      // Un rejet global laisse la précédente en place plutôt que de tout vider.
      // Dédoublonné : sept connecteurs de centrale portent désormais le même
      // libellé, et cette liste sert à afficher des puces, pas à compter des
      // connecteurs.
      const queried =
        others.status === 'fulfilled'
          ? [...new Set(outcomes.map((o) => o.source))]
          : state.lodgQueried

      // Le relevé **met à jour** ce qui est déjà connu au lieu de s'effacer
      // devant lui. Une annonce enregistrée gardait sinon à vie le prix et la
      // capacité de son tout premier relevé — dans une application dont le
      // métier est de rafraîchir des prix. Voir `mergeProviderReadings`.
      const merged = mergeProviderReadings(base, otherLodgings)

      /*
       * Accès aux pistes : distance, dénivelé, remontée, altitude.
       *
       * Aucune source ne les publie — ils se calculent depuis la position, par
       * le moteur local, à partir des tracés OpenSkiMap. `enrichWithAccess`
       * faisait déjà ce travail pour l'import manuel et pour Airbnb, mais le
       * moteur multi-sources ne l'appelait **jamais** : toutes les annonces de
       * centrale, de Booking, d'Ublo ou d'Open System restaient donc à zéro,
       * définitivement, et la vignette affichait « distance non calculée » pour
       * la totalité d'entre elles.
       *
       * Le calcul porte sur les annonces du **domaine consulté**, pas seulement
       * sur celles que ce relevé vient d'ajouter : celles qu'un relevé
       * précédent avait laissées sans mesure doivent être rattrapées, sans quoi
       * elles resteraient muettes à vie.
       *
       * Enrichir est un bonus, jamais un prérequis : `enrichWithAccess` rend la
       * liste inchangée si le moteur local est absent ou si le domaine a été
       * importé sans ses tracés. La recherche aboutit dans tous les cas.
       */
      /*
       * Le périmètre doit être **celui de l'affichage**, pas une égalité stricte
       * sur `d.id`.
       *
       * `importDomainId` porte l'entrée sous laquelle l'import a eu lieu, qui
       * peut être une entrée absorbée depuis, et il est absent des annonces
       * anciennes. Le sélecteur qui construit la liste accepte ces deux cas
       * (`selectors.tsx`, `lodgMembers`) ; l'enrichissement, lui, les écartait.
       * Résultat : des annonces bien affichées mais jamais mesurées, définitivement
       * — « distance non calculée » sur certaines vignettes et pas sur d'autres,
       * sans logique apparente. Les deux règles doivent être la même.
       */
      const ofDomain = merged.filter(
        (l) => belongsToDomain(l, d) && typeof l.lat === 'number' && typeof l.lon === 'number'
      )
      let imported = merged
      if (ofDomain.length > 0) {
        const { lodgings: enriched } = await enrichWithAccess(ofDomain, d.engineId)
        const byId = new Map(enriched.map((l) => [l.id, l]))
        imported = merged.map((l) => byId.get(l.id) ?? l)
      }

      if (!ok && otherLodgings.length === 0) {
        const why = [
          airbnb.status === 'rejected'
            ? String(airbnb.reason)
            : airbnb.value.ok
              ? null
              : airbnb.value.error,
          others.status === 'rejected' ? String(others.reason) : null,
          // Dédoublonné sur le motif complet : plusieurs connecteurs de
          // centrale répondent sous le même libellé, et deux d'entre eux qui
          // échouent pour la même raison n'ont pas à l'écrire deux fois.
          ...new Set(outcomes.filter((o) => o.error).map((o) => `${o.source} : ${o.error}`))
        ].filter(Boolean)
        setSearchError(why.join(' · ') || t('scan_no_source_answered'))
        patch({ lodgPhase: 'criteria', lodgSearchMsg: null, lodgQueried: queried })
        return
      }

      // Une source muette doit se voir même quand la recherche aboutit par
      // ailleurs : sans cela, un Booking sans clé serait indiscernable d'un
      // Booking sans offre. L'information descend dans « État du relevé »,
      // consultable à tout moment, au lieu de passer dans un bandeau qu'on lit
      // une fois et qu'on referme.
      //
      // L'agrégation se fait par libellé et non par connecteur : plusieurs
      // connecteurs partagent un libellé — les centrales, les deux chemins
      // Booking — et un libellé ne peut pas être à la fois en panne et sans
      // offre. Voir `sourceStatuses`.
      const { failed, empty } = sourceStatuses(outcomes)

      patch({
        imported,
        lodgPhase: 'results',
        lodgMapOpen: true,
        // Le compte-rendu du relevé se lit **pendant** le relevé : passé le
        // résultat, il n'a plus d'action associée et ne fait que repousser les
        // vignettes sous la ligne de flottaison. Il est donc éteint en entrant
        // dans `'results'`.
        lodgSearchMsg: null,
        lodgQueried: queried,
        lodgFailed: failed,
        lodgEmpty: empty,
        lastScan: Date.now()
      })
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : String(err))
      patch({ lodgPhase: 'criteria', lodgSearchMsg: null })
    } finally {
      unsub()
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
   * Rattrapage de l'accès aux pistes, hors relevé.
   *
   * Le calcul n'avait lieu qu'au moment d'un relevé. Une annonce enregistrée
   * alors que le moteur local dormait — ou importée avant que le domaine ne soit
   * rapproché de lui — restait donc sans distance **définitivement**, et rien
   * dans l'écran ne la reprenait. C'est ce qui laissait des vignettes afficher
   * « distance non calculée » relevé après relevé.
   *
   * Une seule tentative par domaine et par session, tenue par une référence :
   * quand le moteur est absent, l'enrichissement rend la liste inchangée, et
   * sans ce garde-fou l'effet se relancerait à chaque rendu.
   *
   * Les annonces sans coordonnées ne sont pas concernées : on ne mesure pas une
   * distance depuis une position qu'on n'a pas, et l'inventer serait pire que
   * l'absence.
   */
  const accessTried = useRef<Set<number>>(new Set())
  useEffect(() => {
    if (!d || state.lodgPhase !== 'results') return
    if (accessTried.current.has(d.id)) return
    const pending = state.imported.filter(
      (l) =>
        belongsToDomain(l, d) &&
        !l.accessComputed &&
        typeof l.lat === 'number' &&
        typeof l.lon === 'number'
    )
    if (pending.length === 0) return

    accessTried.current.add(d.id)
    const snapshot = state.imported
    let cancelled = false
    void (async () => {
      const { lodgings: enriched } = await enrichWithAccess(pending, d.engineId)
      if (cancelled) return
      const measured = new Map(
        enriched.filter((l) => l.accessComputed).map((l) => [l.id, l])
      )
      if (measured.size === 0) return
      patch({ imported: snapshot.map((l) => measured.get(l.id) ?? l) })
    })()
    return () => {
      cancelled = true
    }
  }, [d, state.lodgPhase, state.imported, patch])

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
          {fmt(d.min)} – {fmt(d.max)} m{d.curated ? ` · ${t('lodg_altitudes_measured')}` : ''}
        </span>
        <span className="u-spacer" />
        <span className="u-muted" style={{ fontSize: 12 }}>
          {fmtDay(state.arrDate)} → {fmtDay(state.depDate)} · {state.travelers} voyageurs · {state.rooms} chambres min
        </span>
      </div>

      {/* Les filtres ne sont plus une colonne : ils s'ouvrent en survol au-dessus
          de la mosaïque, comme sur l'écran Recherche. Même bascule
          `state.lodgFiltersOpen`, donc même raccourci « f ». */}
      <div className="lodgings__shell" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>

        {/* Côte à côte, la section ne défile plus : l'en-tête et les bandeaux
            restent en place et c'est le volet liste qui défile, sinon la carte
            sortirait de l'écran dès qu'on descend dans les résultats. */}
        <section
          ref={resultsRef}
          style={
            splitOpen
              ? { display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 16, minHeight: 0 }
              : { overflow: 'auto', padding: 16 }
          }
        >
          {state.lodgPhase === 'searching' && (
            // Colonne flex quand la carte est ouverte : le panneau de
            // progression garde sa hauteur, le volet des offres prend le reste
            // et défile. Sans conteneur, les deux enfants du fragment seraient
            // posés dans la section et le volet n'aurait aucune hauteur à
            // remplir.
            <div
              style={
                splitOpen
                  ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }
                  : undefined
              }
            >
              <SkiSearchLoading
                domain={d}
                message={state.lodgSearchMsg}
                elapsedSec={elapsedSec}
                timeoutSec={Math.round(AIRBNB_SEARCH_TIMEOUT_MS / 1000)}
                // Non filtré : le panneau décompte ce qui est connu du domaine,
                // pas ce que les filtres laissent passer.
                known={derived.lodgAll}
              />
              {/*
                Premières offres au fil de l'eau + squelettes pour la place
                restante : rien ne saute quand le relevé se termine.

                Ce volet **défile pendant la recherche**, et il lui faut sa
                propre classe pour ça. Côte à côte avec la carte, la section
                parente porte `overflow: hidden` — voulu, sinon la carte
                sortirait de l'écran dès qu'on descend dans la liste. La phase
                résultats a son `.lodgsplit__list` pour compenser ; la phase
                recherche n'en avait pas, et les offres déjà arrivées restaient
                donc bloquées sous la ligne de flottaison jusqu'à la fin du
                relevé. On ne pouvait pas les lire au moment où c'est le plus
                utile : pendant l'attente.

                `flex: 1` et `minHeight: 0` : sans eux, le volet prend la
                hauteur de son contenu au lieu de la place restante, et il
                déborde au lieu de défiler.
              */}
              <div
                className={splitOpen ? 'lodgsplit__list' : undefined}
                style={
                  splitOpen
                    ? { marginTop: 18, flex: 1, minHeight: 0 }
                    : { marginTop: 18 }
                }
              >
                {derived.lodgList.length > 0 && (
                  <ResultGrid compact={narrow || splitOpen} dense={state.density === 'compact'} ratio={state.density === 'compact' ? 'square' : 'wide'}>
                    {derived.lodgList.map((lg, i) => (
                      <LodgingCard key={lg.id} lodging={lg} domain={d} index={i} />
                    ))}
                  </ResultGrid>
                )}
                {derived.lodgList.length < 6 && (
                  <ResultGrid
                    loading
                    skeletonCount={Math.max(2, 6 - derived.lodgList.length)}
                    compact={narrow || splitOpen}
                    dense={state.density === 'compact'}
                    ratio={state.density === 'compact' ? 'square' : 'wide'}
                    label={t('lodg_loading_grid')}
                  />
                )}
              </div>
            </div>
          )}

          {state.lodgPhase === 'criteria' && (
            <div className="criteria-panel">
              <h2>Critères de recherche — {d.name}</h2>
              <p className="u-muted" style={{ margin: 0, fontSize: 13 }}>
                {t('lodg_criteria_order')}
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
              {(() => {
                const cap = centralCapabilityOf(d.booking ?? d.website)
                const color =
                  cap.mode === 'live'
                    ? 'var(--ok)'
                    : cap.mode === 'blocked'
                      ? 'var(--warn)'
                      : 'var(--muted)'
                const icon = cap.mode === 'live' ? '✓' : cap.mode === 'blocked' ? '⛔' : 'ℹ'
                return (
                  <p
                    className="u-muted"
                    style={{ margin: 0, fontSize: 12, color }}
                    title={cap.host ?? undefined}
                  >
                    {icon} {cap.labelFr}
                    {cap.host ? ` · ${cap.host}` : ''}
                  </p>
                )
              })()}
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
          {/* L'en-tête ne porte plus que ce qui décrit la liste : le bouton des
              filtres, le compte, le rappel du séjour et la carte. Tout ce qui
              réglait la recherche est descendu dans le panneau « Filtres », et
              les états du relevé en ont été retirés. La zone tactile de 44 px
              est conservée par le rembourrage de `.linkbtn--head`, malgré le
              retrait du fond. */}
          <header className="lodgings__head">
            {/* Même survol ancré que l'écran Recherche : le panneau se pose
                sous son bouton, la mosaïque reste visible derrière. */}
            <FilterPopover
              open={state.lodgFiltersOpen}
              onToggle={() => patch({ lodgFiltersOpen: !state.lodgFiltersOpen })}
              onClose={() => patch({ lodgFiltersOpen: false })}
              label={t('filters')}
              count={lodgActive.active.length}
              buttonClassName="linkbtn--head"
            >
              <LodgingFilters />
            </FilterPopover>
            {/* Le compte est celui de la mosaïque, pas de la liste avant
                cadrage : sous une carte zoomée, `lodgList` annonçait vingt
                logements au-dessus de six vignettes, et plus aucun bandeau
                n'expliquait l'écart depuis le retrait de « hors du cadrage ». */}
            <h2 className="results__count">{visibleLodgings.length} logement(s)</h2>
            <span className="u-muted" style={{ fontSize: 12 }}>
              prix tout compris, {derived.nights} nuit(s), {state.travelers} personnes · offres de moins d’une heure
            </span>
            <span className="u-spacer" />
            <button
              type="button"
              className="linkbtn--head"
              onClick={() => patch({ lodgMapOpen: !state.lodgMapOpen })}
            >
              {state.lodgMapOpen ? 'Masquer la carte ◂' : 'Afficher la carte ▸'}
            </button>
          </header>

          {/* Bulletin neige du domaine, dans son propre encadré : c'est la
              donnée qui décide d'un séjour au ski avant le prix du logement, et
              elle ne parle pas de la même chose que la liste. Le cadre la sort
              du fil de l'en-tête pour qu'on la lise comme un bulletin. Lue du
              modèle seul — « — » tant qu'il n'a pas répondu. */}
          <section className="lodgsnow lodgsnow--boxed" aria-label={t('snow_on_ground')}>
            <span className="lodgsnow__label">
              {t('snow_on_ground')} <span className="u-muted">{t('snow_base_top')}</span>
            </span>
            <strong className="u-num lodgsnow__val">
              {domSnow.bas != null ? `${fmt(domSnow.bas)}` : '—'} /{' '}
              {domSnow.haut != null ? `${fmt(domSnow.haut)} cm` : '—'}
            </strong>
            <span className="lodgsnow__lifts">
              {d.lifts} {t('lifts_plural')} · {fmt(d.min)}–{fmt(d.max)} m
            </span>
          </section>

          {/* Les puces des filtres posés ne sont plus ici : elles vivent dans le
              panneau « Filtres », seul endroit où l'on parle de filtrage. Voir
              `LodgingFilters`. */}

          {/* Trois bandeaux ont été retirés de cette place :
              — l'état du relevé et son panneau de diagnostic ;
              — le compte des logements hors du cadrage de la carte. Le filtrage
                par le cadrage, lui, reste actif : déplacer la carte restreint
                toujours la liste, désormais sans le dire ;
              — le compte des annonces sans disponibilité confirmée. La bascule
                qui les masque reste réglable dans « Filtres ».
              Attention pour la suite : la relance du relevé Airbnb ne vit plus
              que dans le bandeau des prix périmés ci-dessous, qui n'apparaît
              pas quand `staleCount` vaut zéro. Une annonce écartée faute de
              disponibilité prouvée, aux dates courantes, n'a donc plus de
              geste pour la trancher. */}

          {/* Le bandeau « N prix relevé(s) pour d'autres dates » a disparu :
              une annonce dont le tarif ne vaut plus pour le séjour demandé
              n'est plus listée du tout (`confirmedPricesOnly`, voir
              `data/lodgingFilter.ts`). Il n'y a donc plus rien à avertir.
              Ne subsiste que le déroulé d'une revérification en cours — mais
              plus aucun bouton ne la déclenche depuis cet écran. */}
          {(recheck.state.waiting || recheck.state.message) && (
            <div
              className="srcbanner"
              style={{ borderColor: recheck.state.waiting ? 'var(--brand)' : 'var(--warn)' }}
            >
              {recheck.state.waiting ? (
                <>
                  <strong style={{ fontWeight: 600, color: 'var(--brand)' }}>
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
              ) : (
                <strong style={{ fontWeight: 600 }}>{recheck.state.message}</strong>
              )}
            </div>
          )}

          {/* Le bandeau permanent « les N sources sont à jour » avait disparu au
              profit de `LodgingGeoPanel`, qui portait la santé des sources, la
              médiane et les doublons fusionnés. Ce panneau a été retiré à son
              tour avec « État du relevé » : ces informations n'ont plus aucun
              porteur dans l'écran, `state.lodgFailed` compris. */}

          {/* La mise en avant depuis la carte s'annonce : sans cela, l'effet
              est invisible dès que la liste est défilée ou la carte au premier
              plan. */}
          {picked && (
            <div className="pickbanner">
              <span>
                {t('lodg_picked_banner').replace('{n}', picked.name)}
              </span>
              <span className="u-spacer" />
              <button type="button" className="linkbtn linkbtn--sm" onClick={() => patch({ lodgPickId: null })}>
                {t('lodg_picked_clear')}
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
              {/* Liste vide : deux situations opposées, qu'il serait trompeur de
                  confondre. Soit rien n'a jamais été importé, soit des annonces
                  existent mais aucune ne passe les filtres — et dans ce second
                  cas, dire « aucun logement importé » envoie relancer une
                  recherche qui rapportera des annonces tout aussi invisibles.

                  L'état vide vit **dans la colonne de la liste**, et non
                  au-dessus du partage : placé au-dessus, il se retrouvait seul
                  en haut à gauche d'un écran large, la carte reléguée très bas
                  à droite avec un vide entre les deux. Dans la colonne, il
                  occupe la place qu'aurait prise la mosaïque, en face de la
                  carte. */}
              {derived.lodgList.length === 0 && (
                <div className="results__emptywrap">
                  {derived.lodgHidden > 0 ? (
                    <div className="results__empty">
                      <p className="results__empty-title">
                        {t('lodg_empty_hidden_title').replace('{n}', String(derived.lodgHidden))}
                      </p>
                      <p className="results__empty-hint">
                        {t('lodg_empty_hidden_hint').replace('{d}', d.name)}
                      </p>
                      <div className="results__empty-actions">
                        <button type="button" className="btn btn--strong" onClick={resetLodgFilters}>
                          {t('lodg_filters_reset')}
                        </button>
                        <button
                          type="button"
                          className="linkbtn linkbtn--underline"
                          onClick={() => patch({ lodgPhase: 'criteria', lodgSearchMsg: null })}
                        >
                          {t('lodg_change_dates')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="results__empty">
                      <p className="results__empty-title">
                        {state.lastScan != null
                          ? t('lodg_none_for_dates').replace('{d}', d.name)
                          : (
                            <>
                              {t('lodg_none_imported')} {d.name}
                            </>
                          )}
                      </p>
                      <p className="results__empty-hint">
                        {state.lodgEmpty.length > 0 && (
                          <>
                            {t('scan_sources_empty').replace('{s}', state.lodgEmpty.join(', '))}
                            <br />
                          </>
                        )}
                        {state.lastScan == null
                          ? t('lodg_run_search_hint')
                          : t('lodg_try_other_dates')}
                      </p>
                      <div className="results__empty-actions">
                        <button
                          type="button"
                          className="btn btn--strong"
                          onClick={() => patch({ lodgPhase: 'criteria', lodgSearchMsg: null })}
                        >
                          {state.lastScan != null ? t('lodg_change_dates') : t('lodg_search_listings')}
                        </button>
                        {d.booking && (
                          <button
                            type="button"
                            className="linkbtn linkbtn--underline"
                            onClick={() => void window.skitrack.openExternal(d.booking!)}
                          >
                            {t('lodg_open_central')}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {/* Pendant un relevé, la liste n'est pas estompée : elle n'est
                  pas rendue du tout. `lodgPhase` vaut alors `'searching'` et
                  c'est `SkiSearchLoading` qui occupe seul la section. */}
              <ResultGrid compact={narrow || splitOpen} dense={state.density === 'compact'} ratio={state.density === 'compact' ? 'square' : 'wide'} label="Logements du domaine">
                {visibleLodgings.map((lg, i) => (
                  <LodgingCard key={lg.id} lodging={lg} domain={d} index={i} />
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
      {/* L'import manuel d'une annonce a été retiré de l'écran : plus aucun
          bouton ne pose `importOpen`, le dialogue n'a donc plus de place ici. */}

      {state.compareIds.length > 0 && !state.compareOpen && (
        <div className="comparebar" role="status">
          <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>
            {state.compareIds.length} logement{state.compareIds.length > 1 ? 's' : ''} à comparer
          </span>
          <button type="button" className="comparebar__cta" onClick={() => patch({ compareOpen: true })}>
            Comparer {state.compareIds.length}
          </button>
          <button
            type="button"
            className="comparebar__close"
            onClick={() => patch({ compareIds: [], compareOpen: false })}
            title={t('lodg_clear_selection')}
            aria-label={t('lodg_clear_selection')}
          >
            <CloseIcon />
          </button>
        </div>
      )}

      {state.compareOpen && <ComparePanel domain={d} />}
    </div>
  )
}
