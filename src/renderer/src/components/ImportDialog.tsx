import { useEffect, useRef, useState } from 'react'
import type { ListingExtract } from '@shared/ipc-contract'
import { CloseIcon, ExternalIcon } from './Icons'
import type { Domain } from '@/data/referentiel'
import type { BulkContext } from '@/data/bulkImport'
import { JSON_EXAMPLE, parseListingsJson, parseUrlList, toLodging } from '@/data/bulkImport'
import { parseAirbnbClipboard } from '@/data/airbnbClip'
import { mergeAirbnbPaste } from '@/data/airbnbMerge'
import { AIRBNB_BOOKMARKLET_LABEL, buildBookmarkletHref } from '@/data/airbnbBookmarklet'
import { deepLinks } from '@/data/deeplinks'
import { boxAround, domainRadiusKm } from '@shared/geo'
import { stationNameOf } from '@/data/stations'
import { enrichWithAccess } from '@/data/lodgingAccess'
import type { Lodging } from '@/data/lodgings'
import { useFormat } from '@/hooks/useFormat'
import { haversineKm } from '@/domain/travel'
import { useFocusTrap } from '@/hooks/useShortcuts'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'
import { useI18n } from '@/i18n'

/**
 * Import d'une annonce par URL.
 *
 * L'application lit **une** page, celle que vous collez, et seulement les
 * métadonnées que le site publie pour être lues par des machines (JSON-LD,
 * Open Graph). Elle respecte `robots.txt`, s'annonce sous son propre nom et
 * s'arrête si l'hôte refuse. Sur les plateformes dont les conditions
 * d'utilisation interdisent tout accès automatisé, rien n'est demandé au
 * serveur : la saisie manuelle prend le relais, et le logement rejoint la
 * liste avec exactement les mêmes calculs qu'une offre relevée.
 */
export function ImportDialog({ domain: d }: { domain: Domain }): JSX.Element {
  const { t } = useI18n()
  const { fmt } = useFormat()
  const { state, patch } = useApp()
  const derived = useDerived()
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref)

  const [extract, setExtract] = useState<ListingExtract | null>(null)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [rooms, setRooms] = useState(state.importRooms)
  const [capacity, setCapacity] = useState(state.travelers)
  const [distance, setDistance] = useState(300)

  const [mode, setMode] = useState<'une' | 'lot' | 'airbnb'>('une')
  const [bulkText, setBulkText] = useState('')
  const [bulkLog, setBulkLog] = useState<string[]>([])
  const [bulkBusy, setBulkBusy] = useState(false)
  const [osmBusy, setOsmBusy] = useState(false)
  const [airbnbText, setAirbnbText] = useState('')
  const [airbnbLog, setAirbnbLog] = useState<string[]>([])
  const [airbnbScrapeBusy, setAirbnbScrapeBusy] = useState(false)
  // Jeton d'appairage : il personnalise le marque-page pour ce poste, afin que
  // lui seul puisse déposer un relevé dans l'application.
  const [bookmarkletHref, setBookmarkletHref] = useState<string>('')
  useEffect(() => {
    let alive = true
    void window.skitrack
      .pasteToken()
      .then((token) => {
        if (alive) setBookmarkletHref(buildBookmarkletHref(token))
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  /** Ouvre la recherche Airbnb pré-remplie du domaine dans le navigateur. */
  const openAirbnbSearch = (): void => {
    const link = deepLinks({
      domainName: d.name,
      arrDate: state.arrDate,
      depDate: state.depDate,
      travelers: state.travelers,
      rooms: state.rooms
    }).find((l) => l.name === 'Airbnb')
    if (link) void window.skitrack.openExternal(link.url)
  }

  /**
   * Recherche automatisée via Puppeteer (navigateur invisible piloté par le main).
   * Charge la page Airbnb aux dates courantes, lit data-deferred-state-0, et
   * importe comme un collage marque-page. Contourne robots.txt.
   */
  const scrapeAirbnb = async (): Promise<void> => {
    if (airbnbScrapeBusy) return
    setAirbnbScrapeBusy(true)
    setAirbnbLog(['Ouverture d’un navigateur invisible… Si un CAPTCHA apparaît, une fenêtre s’ouvrira pour le valider.'])
    try {
      const outcome = await window.skitrack.airbnbScrape({
        city: stationNameOf(d.name) || d.name,
        checkIn: state.arrDate || undefined,
        checkOut: state.depDate || undefined,
        adults: state.travelers,
        children: 0,
        scrollCount: 3,
        maxRetries: 3
      })
      if (!outcome.ok) {
        setAirbnbLog([`⚠ ${outcome.error}`])
        return
      }
      setAirbnbLog([
        `${outcome.count} annonce(s) lue(s)` +
          (outcome.captchaSolved ? ' (CAPTCHA validé)' : '') +
          (outcome.recaptchaV3Fallback ? ' (reCAPTCHA v3 : mode visible)' : '') +
          (outcome.attempts && outcome.attempts > 1 ? ` (essai ${outcome.attempts})` : '') +
          '. Import en cours…'
      ])
      setAirbnbText(outcome.payloadJson)
      // Réutilise le même pipeline que le collage manuel.
      const { listings, errors, meta } = parseAirbnbClipboard(outcome.payloadJson)
      if (listings.length === 0) {
        setAirbnbLog(errors.length ? errors.map((e) => `⚠ ${e}`) : ['Aucune annonce exploitable.'])
        return
      }
      const { imported, added, updated, missing } = mergeAirbnbPaste(state.imported, listings, {
        checkIn: meta.checkIn ?? state.arrDate,
        checkOut: meta.checkOut ?? state.depDate,
        domainId: d.id,
        capacity,
        nights: derived.nights,
        fallbackAltitude: d.village || d.min
      })
      if (added.length === 0 && updated === 0) {
        if (missing > 0) patch({ imported })
        setAirbnbLog([
          `Aucune nouveauté : les ${listings.length} annonce(s) sont déjà à jour.`,
          ...(missing > 0 ? [t('lodg_gone_tally').replace('{n}', String(missing))] : []),
          `URL : ${outcome.url}`
        ])
        return
      }
      const { lodgings: enriched, note } = await enrichWithAccess(added, d.engineId)
      const byId = new Map(enriched.map((l) => [l.id, l]))
      patch({
        imported: imported.map((l) => byId.get(l.id) ?? l),
        importOpen: false,
        lodgingDomainId: d.id
      })
      setAirbnbLog([
        `${added.length} nouvelle(s) annonce(s)${updated > 0 ? `, ${updated} prix actualisé(s)` : ''}.`,
        ...(missing > 0 ? [t('lodg_gone_tally').replace('{n}', String(missing))] : []),
        ...(note ? [note] : []),
        ...errors.map((e) => `⚠ ${e}`)
      ])
    } catch (err) {
      setAirbnbLog([`⚠ ${err instanceof Error ? err.message : String(err)}`])
    } finally {
      setAirbnbScrapeBusy(false)
    }
  }

  /**
   * Ingère le collage produit par le marque-page Airbnb.
   *
   * C'est ce que fait un comparateur comme CozyCozy, ramené à un usage
   * personnel et honnête : la page a été ouverte par vous, dans votre
   * navigateur ; le marque-page a copié ce qu'elle affichait ; on ne fait ici
   * que relire ce collage. Aucune requête vers Airbnb n'est émise par
   * l'application.
   */
  const importAirbnb = async (): Promise<void> => {
    const { listings, errors, meta } = parseAirbnbClipboard(airbnbText)
    if (listings.length === 0) {
      setAirbnbLog(errors.length ? errors.map((e) => `⚠ ${e}`) : ['Aucune annonce dans le collage.'])
      return
    }

    // Dates du relevé : celles de la page Airbnb d'où vient le collage. À
    // défaut (marque-page ancien), on suppose les dates de recherche en cours.
    const { imported, added, updated, missing } = mergeAirbnbPaste(state.imported, listings, {
      checkIn: meta.checkIn ?? state.arrDate,
      checkOut: meta.checkOut ?? state.depDate,
      domainId: d.id,
      capacity,
      nights: derived.nights,
      fallbackAltitude: d.village || d.min
    })

    if (added.length === 0 && updated === 0) {
      if (missing > 0) patch({ imported })
      setAirbnbLog([
        `Aucune nouveauté : les ${listings.length} annonce(s) collée(s) sont déjà à jour.`,
        ...(missing > 0 ? [t('lodg_gone_tally').replace('{n}', String(missing))] : []),
        'Astuce : passez à la page suivante des résultats Airbnb pour en récupérer d’autres.'
      ])
      return
    }

    setAirbnbLog([
      `${added.length} nouvelle(s), ${updated} prix mis à jour. Calcul des distances…`,
      ...(missing > 0 ? [t('lodg_gone_tally').replace('{n}', String(missing))] : [])
    ])
    const { lodgings: enriched, note } = await enrichWithAccess(added, d.engineId)
    const byId = new Map(enriched.map((l) => [l.id, l]))
    patch({
      imported: imported.map((l) => byId.get(l.id) ?? l),
      importOpen: false,
      lodgingDomainId: d.id
    })
    setAirbnbLog([
      `${added.length} nouvelle(s) annonce(s)${updated > 0 ? `, ${updated} prix actualisé(s)` : ''}.`,
      ...(note ? [note] : []),
      ...errors.map((e) => `⚠ ${e}`)
    ])
  }

  /**
   * Charge les hébergements réels du domaine depuis OpenStreetMap.
   *
   * C'est la réponse au « je veux voir des annonces » : de vrais établissements
   * de la station — résidences, chalets, hôtels — cartographiés dans OSM, versés
   * dans la même liste que le reste. Sans prix, parce qu'OSM n'en a pas et qu'on
   * n'en invente pas : chaque carte ouvre une recherche Airbnb pré-remplie de son
   * nom. Aucune requête n'est faite vers Airbnb ici.
   */
  const loadOsm = async (): Promise<void> => {
    if (osmBusy) return
    setOsmBusy(true)
    setBulkLog(['Recherche des hébergements du domaine sur OpenStreetMap…'])
    try {
      // Emprise dérivée de la taille du domaine, en kilomètres et non en
      // degrés : un degré de longitude vaut 78 km à 45° de latitude et 111 km
      // à l'équateur, si bien qu'une emprise fixe en degrés était trop étroite
      // dans les Pyrénées et trop large dans les Vosges. Voir `@shared/geo`.
      const box = boxAround(d.lat, d.lon, domainRadiusKm(d.km))
      const results = await window.skitrack.osmLodgings({
        south: box.south,
        west: box.west,
        north: box.north,
        east: box.east,
        destination: stationNameOf(d.name) || d.name,
        checkIn: state.arrDate,
        checkOut: state.depDate,
        adults: state.travelers,
        children: 0
      })

      if (results.length === 0) {
        setBulkLog(['Aucun hébergement cartographié dans OpenStreetMap pour ce domaine.'])
        return
      }

      // Déduplication : un rechargement OSM ne doit pas ajouter deux fois le même
      // établissement. Clé = nom + position arrondie (OSM n'a pas d'id d'annonce).
      const osmKey = (name: string, lat?: number, lon?: number): string =>
        `${name.toLowerCase()}|${lat?.toFixed(3) ?? ''}|${lon?.toFixed(3) ?? ''}`
      const existingOsm = new Set(
        state.imported
          .filter((l) => l.src === 'OSM → Airbnb')
          .map((l) => osmKey(l.name, l.lat, l.lon))
      )
      const freshResults = results.filter((r) => {
        const key = osmKey(r.name, r.lat, r.lon)
        if (existingOsm.has(key)) return false
        existingOsm.add(key)
        return true
      })
      const osmSkipped = results.length - freshResults.length

      if (freshResults.length === 0) {
        setBulkLog([`Les ${results.length} hébergement(s) OpenStreetMap sont déjà dans votre liste.`])
        return
      }

      const first = state.imported.reduce((max, l) => Math.max(max, l.id), 999) + 1
      const added: Lodging[] = freshResults.map((r, i) => ({
        id: first + i,
        name: r.name,
        type: r.type,
        // 0 = non renseigné : OpenStreetMap décrit un hébergement, pas une
        // annonce, et ne dit ni la capacité ni le nombre de chambres.
        pers: 0,
        ch: 0,
        m2: null,
        note: r.stars ? `${r.stars}★` : '—',
        avis: 0,
        dist: 0,
        walk: 1,
        den: 0,
        skiIn: false,
        // Le libellé de source déclenche l'affichage « Voir sur Airbnb » plutôt
        // qu'un prix : voir LodgingCard. Aucun tarif n'est porté.
        src: 'OSM → Airbnb',
        // `pp` et `total` à 0 : sans prix, la carte ne participe pas au tri par
        // prix et n'affiche jamais « 0 € », mais « Prix sur Airbnb ».
        pp: 0,
        total: 0,
        annul: false,
        lift: 'non renseigné',
        liftDist: 0,
        alt: d.village || d.min,
        stock: 0,
        // La redirection : c'est ce que vous voulez au clic.
        url: r.url,
        image: r.image ?? null,
        photo: r.name,
        // OSM donne la position exacte de l'établissement cartographié.
        lat: r.lat,
        lon: r.lon,
        locPrecision: 'exact' as const,
        importDomainId: d.id
      }))

      setBulkLog([
        `${added.length} hébergement(s) OpenStreetMap ajouté(s). Calcul des distances aux pistes…`
      ])
      const { lodgings: enriched, note } = await enrichWithAccess(added, d.engineId)
      patch({ imported: [...state.imported, ...enriched], importOpen: false, lodgingDomainId: d.id })
      setBulkLog([
        `${enriched.length} hébergement(s) réel(s) ajouté(s) depuis OpenStreetMap${osmSkipped > 0 ? ` — ${osmSkipped} déjà présent(s), ignoré(s)` : ''}.`,
        ...(note ? [note] : [])
      ])
    } catch (err) {
      setBulkLog([`⚠ ${err instanceof Error ? err.message : String(err)}`])
    } finally {
      setOsmBusy(false)
    }
  }

  const bulkContext = (): BulkContext => ({
    firstId: 1000 + state.imported.length,
    nights: derived.nights,
    fallbackAlt: d.village || d.min
  })

  /** Fichier JSON : aucune requête réseau, l'application ingère ce qu'on lui donne. */
  const importJson = (text: string): void => {
    const { lodgings, errors } = parseListingsJson(text, bulkContext())
    setBulkLog([
      ...(lodgings.length ? [`${lodgings.length} annonce(s) ajoutée(s).`] : []),
      ...errors.map((e) => `⚠ ${e}`)
    ])
    if (lodgings.length)
      patch({
        imported: [...state.imported, ...lodgings.map((l) => ({ ...l, importDomainId: d.id }))],
        lodgingDomainId: d.id
      })
  }

  /** Liste d'URL : chaque page est lue avec les mêmes garde-fous que l'import
   *  unitaire, une par une, et celles qui refusent sont simplement signalées. */
  const importUrls = async (): Promise<void> => {
    const urls = parseUrlList(bulkText)
    if (urls.length === 0) {
      setBulkLog(['Aucune URL http(s) reconnue — une par ligne.'])
      return
    }
    setBulkBusy(true)
    setBulkLog([`Lecture de ${urls.length} page(s)…`])

    const added: typeof state.imported = []
    const log: string[] = []
    const ctx = bulkContext()

    for (const url of urls) {
      const result = await window.skitrack.fetchListing(url)
      if (!result.ok || !result.title) {
        log.push(`⚠ ${result.site} — ${result.blockedReason ?? 'aucune métadonnée exploitable'}`)
        continue
      }
      const lodging = toLodging(
        {
          name: result.title,
          total: result.price ?? 0,
          rooms: result.rooms ?? undefined,
          capacity: result.capacity ?? undefined,
          source: result.site,
          url: result.url,
          image: result.images[0]
        },
        added.length,
        ctx
      )
      if (typeof lodging === 'string') log.push(`⚠ ${lodging}`)
      else added.push({ ...lodging, importDomainId: d.id })
    }

    if (added.length) patch({ imported: [...state.imported, ...added], lodgingDomainId: d.id })
    setBulkLog([`${added.length} annonce(s) ajoutée(s) sur ${urls.length}.`, ...log])
    setBulkBusy(false)
  }

  const close = (): void => patch({ importOpen: false })

  const read = async (): Promise<void> => {
    if (busy || !state.importUrl.trim()) return
    setBusy(true)
    try {
      const result = await window.skitrack.fetchListing(state.importUrl.trim())
      setExtract(result)
      if (result.title) setName(result.title)
      if (result.rooms) setRooms(Math.max(1, Math.round(result.rooms)))
      if (result.capacity) setCapacity(Math.max(1, Math.round(result.capacity)))
      if (result.price) patch({ importPrice: String(Math.round(result.price)) })
    } catch (err) {
      setExtract({
        ok: false,
        blockedReason: err instanceof Error ? err.message : String(err),
        url: state.importUrl,
        site: '—',
        title: null,
        description: null,
        images: [],
        price: null,
        currency: null,
        lat: null,
        lon: null,
        rooms: null,
        capacity: null,
        address: null,
        missing: []
      })
    } finally {
      setBusy(false)
    }
  }

  /** Distance au centre du domaine quand l'annonce publie sa position. */
  const distanceFromGeo =
    extract?.lat != null && extract.lon != null
      ? Math.round(haversineKm(extract.lat, extract.lon, d.lat, d.lon) * 1000)
      : null

  const price = Math.max(0, parseFloat(String(state.importPrice).replace(',', '.')) || 0)
  const canAdd = price > 0 && name.trim().length > 0

  const add = (): void => {
    const id = 1000 + state.imported.length
    const walkDistance = distanceFromGeo ?? distance
    patch({
      imported: [
        ...state.imported,
        {
          id,
          name: name.trim(),
          type: 'Import',
          pers: capacity,
          ch: rooms,
          m2: null,
          note: '—',
          avis: 0,
          dist: walkDistance,
          // Une minute de marche pour 80 m, dénivelé non connu depuis la page.
          walk: Math.max(1, Math.round(walkDistance / 80)),
          den: 0,
          skiIn: walkDistance <= 100,
          src: `Import manuel · ${extract?.site ?? 'saisi'}`,
          pp: Math.round((price / (capacity * derived.nights)) * 2) / 2,
          total: Math.round(price),
          annul: false,
          lift: 'non renseigné',
          liftDist: walkDistance,
          alt: d.village || d.min,
          stock: 1,
          url: extract?.url ?? state.importUrl.trim(),
          image: extract?.images[0] ?? null,
          photo: extract?.title ?? 'annonce importée',
          importDomainId: d.id
        }
      ],
      importOpen: false,
      importRooms: rooms,
      lodgingDomainId: d.id,
      ficheId: id
    })
  }

  return (
    <>
      <div className="scrim scrim--local" style={{ zIndex: 9 }} onClick={close} />
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-label="Importer une annonce par URL">
        <div className="drawer__head">
          <h3>Importer des annonces</h3>
          <div className="seg">
            <button
              type="button"
              className={`seg__btn${mode === 'une' ? ' seg__btn--on' : ''}`}
              onClick={() => setMode('une')}
            >
              Une annonce
            </button>
            <button
              type="button"
              className={`seg__btn${mode === 'lot' ? ' seg__btn--on' : ''}`}
              onClick={() => setMode('lot')}
            >
              En lot
            </button>
            <button
              type="button"
              className={`seg__btn${mode === 'airbnb' ? ' seg__btn--on' : ''}`}
              onClick={() => setMode('airbnb')}
            >
              Airbnb
            </button>
          </div>
          <button type="button" className="iconbtn" onClick={close} aria-label="Fermer">
            <CloseIcon />
          </button>
        </div>

        {mode === 'une' && (
        <div style={{ padding: '20px 22px', display: 'grid', gap: 16 }}>
          <div>
            <label className="sheet__label" htmlFor="import-url">
              {t('import_url_label')}
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="import-url"
                type="text"
                className="field"
                style={{ padding: '10px 12px', fontSize: 13 }}
                placeholder="https://…"
                value={state.importUrl}
                onChange={(e) => patch({ importUrl: e.target.value })}
              />
              <button
                type="button"
                className="btn u-nowrap"
                disabled={busy || !state.importUrl.trim()}
                onClick={() => void read()}
              >
                {busy ? 'Lecture…' : 'Lire la page'}
              </button>
            </div>
            <p className="filters__help">
              Une seule page, à votre demande. Seules les métadonnées publiques sont lues, et le fichier robots.txt du
              site est respecté.
            </p>
          </div>

          {extract?.blockedReason && (
            <div className="inset" style={{ padding: 14, borderColor: 'var(--warn)' }}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--warn)', fontWeight: 600 }}>
                {t('import_refused')}
              </p>
              <p className="u-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                {extract.blockedReason}
              </p>
              {/^https?:/.test(state.importUrl) && (
                <button
                  type="button"
                  className="linkbtn"
                  style={{ marginTop: 6 }}
                  onClick={() => void window.skitrack.openExternal(state.importUrl)}
                >
                  {t('import_open_browser')}
                  <ExternalIcon />
                </button>
              )}
            </div>
          )}

          {extract?.ok && (
            <div className="inset" style={{ display: 'grid', gap: 7, fontSize: 13, padding: 14 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ color: 'var(--ok)', fontWeight: 700 }}>✓</span>
                <span>
                  Lue sur <strong>{extract.site}</strong>
                  {extract.title ? ` — « ${extract.title} »` : ''}
                </span>
              </div>
              {distanceFromGeo != null && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{ color: 'var(--ok)', fontWeight: 700 }}>✓</span>
                  <span>
                    {t('import_published_pos')} <strong>{fmt(distanceFromGeo)} m</strong> {t('import_from_center')}
                  </span>
                </div>
              )}
              {extract.missing.length > 0 && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{ color: 'var(--warn)', fontWeight: 700 }}>!</span>
                  <span style={{ color: 'var(--warn)' }}>
                    À saisir à la main : {extract.missing.join(', ')}
                  </span>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="sheet__label" htmlFor="import-name">
              Nom du logement
            </label>
            <input
              id="import-name"
              type="text"
              className="field field--accent"
              placeholder="Chalet, résidence, appartement…"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px', gap: 12 }}>
            <div>
              <label className="sheet__label" htmlFor="import-price">
                {t('import_total_price')}
              </label>
              <input
                id="import-price"
                type="text"
                className="field field--accent"
                value={state.importPrice}
                onChange={(e) => patch({ importPrice: e.target.value })}
              />
            </div>
            <div>
              <span className="sheet__label">Chambres</span>
              <div className="stepper" style={{ borderColor: 'var(--brand)', padding: '8px 10px' }}>
                <button type="button" className="stepper__btn" onClick={() => setRooms(Math.max(1, rooms - 1))}>
                  −
                </button>
                <span className="stepper__value">{rooms}</span>
                <button type="button" className="stepper__btn" onClick={() => setRooms(Math.min(8, rooms + 1))}>
                  +
                </button>
              </div>
            </div>
            <div>
              <span className="sheet__label">Couchages</span>
              <div className="stepper" style={{ borderColor: 'var(--brand)', padding: '8px 10px' }}>
                <button type="button" className="stepper__btn" onClick={() => setCapacity(Math.max(1, capacity - 1))}>
                  −
                </button>
                <span className="stepper__value">{capacity}</span>
                <button
                  type="button"
                  className="stepper__btn"
                  onClick={() => setCapacity(Math.min(16, capacity + 1))}
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {distanceFromGeo == null && (
            <div>
              <label className="field-label" htmlFor="import-dist">
                Distance aux pistes
                <strong className="u-nowrap">{fmt(distance)} m</strong>
              </label>
              <input
                id="import-dist"
                type="range"
                min={0}
                max={2000}
                step={50}
                value={distance}
                onChange={(e) => setDistance(+e.target.value)}
              />
            </div>
          )}
        </div>
        )}

        {mode === 'lot' && (
          <div style={{ padding: '20px 22px', display: 'grid', gap: 16 }}>
            <div className="inset" style={{ padding: 16, display: 'grid', gap: 10, borderColor: 'var(--brand)' }}>
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
                  Voir les hébergements réels de {d.name}
                </p>
                <p className="u-muted" style={{ margin: '4px 0 0', fontSize: 12.5 }}>
                  Résidences, chalets et hôtels de la station, cartographiés dans OpenStreetMap. Chaque carte
                  s’ouvre sur une recherche Airbnb pré-remplie. Sans prix : Airbnb ne les publie pas hors de son
                  site, on n’en invente pas.
                </p>
              </div>
              <button
                type="button"
                className="btn btn--primary u-nowrap"
                style={{ justifySelf: 'start' }}
                disabled={osmBusy}
                onClick={() => void loadOsm()}
              >
                {osmBusy ? 'Recherche…' : 'Charger les annonces du domaine'}
              </button>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div>
              <label className="sheet__label" htmlFor="bulk-text">
                Liste d’URL, une par ligne
              </label>
              <textarea
                id="bulk-text"
                className="field"
                style={{ minHeight: 130, fontSize: 12, fontFamily: 'inherit', resize: 'vertical' }}
                placeholder={`https://…
https://…`}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn"
                  disabled={bulkBusy || !bulkText.trim()}
                  onClick={() => void importUrls()}
                >
                  {bulkBusy ? 'Lecture en cours…' : 'Lire les pages'}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={bulkBusy || !bulkText.trim()}
                  onClick={() => importJson(bulkText)}
                >
                  Traiter comme du JSON
                </button>
                <label className="btn btn--primary">
                  Charger un fichier JSON
                  <input
                    type="file"
                    accept="application/json,.json"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void file.text().then(importJson)
                    }}
                  />
                </label>
              </div>
              <p className="filters__help">
                Les URL sont lues une par une, avec les mêmes règles que l’import unitaire : robots.txt respecté,
                hôtes dont les CGU interdisent l’accès automatisé écartés. Un fichier JSON, lui, n’entraîne
                <strong> {t('import_no_request')}</strong> {t('import_ingests')}
              </p>
            </div>
            </div>

            {bulkLog.length > 0 && (
              <div className="inset" style={{ padding: 14, display: 'grid', gap: 4 }}>
                {bulkLog.map((line, i) => (
                  <p
                    key={i}
                    style={{
                      margin: 0,
                      fontSize: 12,
                      color: line.startsWith('⚠') ? 'var(--warn)' : 'var(--text)'
                    }}
                  >
                    {line}
                  </p>
                ))}
              </div>
            )}

            <details style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
              <summary style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Format du fichier JSON</summary>
              <p className="u-muted" style={{ margin: '8px 0', fontSize: 12 }}>
                Un tableau d’annonces. Seuls <code>name</code> et <code>total</code> (prix du séjour, tout compris)
                sont obligatoires ; le reste prend une valeur neutre s’il manque, plutôt qu’une valeur plausible qui
                fausserait le tri.
              </p>
              <pre
                style={{
                  margin: 0,
                  fontSize: 11,
                  background: 'var(--surface)',
                  borderRadius: 6,
                  padding: 10,
                  overflow: 'auto'
                }}
              >
                {JSON_EXAMPLE}
              </pre>
            </details>
          </div>
        )}

        {mode === 'airbnb' && (
          <div style={{ padding: '20px 22px', display: 'grid', gap: 16 }}>
            <div className="inset" style={{ padding: 16, display: 'grid', gap: 10 }}>
              <p style={{ margin: 0, fontSize: 13 }}>
                <strong>Recherche automatique (Playwright)</strong> — un navigateur invisible charge la page Airbnb
                aux dates choisies et lit le bloc <code>data-deferred-state-0</code>, comme le marque-page.
              </p>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--warn)' }}>
                ⚠ Contourne le robots.txt d’Airbnb. CAPTCHA visible : fenêtre pour validation manuelle.
                reCAPTCHA v3 (invisible) : Chrome réel + profil persistant + comportement humanisé ; si le
                score est trop bas, bascule en fenêtre visible automatiquement.
              </p>
              <button
                type="button"
                className="btn btn--primary"
                style={{ justifySelf: 'start' }}
                disabled={airbnbScrapeBusy}
                onClick={() => void scrapeAirbnb()}
              >
                {airbnbScrapeBusy ? 'Recherche en cours…' : `Lancer la recherche auto pour ${d.name}`}
              </button>
            </div>

            <div className="inset" style={{ padding: 16, display: 'grid', gap: 8 }}>
              <p style={{ margin: 0, fontSize: 13 }}>
                <strong>{t('import_bookmarklet')}</strong> — vous ouvrez la page dans votre navigateur, le
                marque-page recopie ce qu’elle affiche. Aucune requête automatisée depuis SKITRACK.
              </p>
            </div>

            <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 14, fontSize: 13 }}>
              <li>
                <div style={{ display: 'grid', gap: 6 }}>
                  <span>
                    <strong>Une seule fois :</strong> glissez ce bouton dans la barre de favoris de votre
                    navigateur.
                  </span>
                  <a
                    href={bookmarkletHref || '#'}
                    draggable
                    onClick={(e) => e.preventDefault()}
                    className="btn btn--primary"
                    style={{ justifySelf: 'start', textDecoration: 'none', cursor: 'grab' }}
                    title="Glissez-moi dans votre barre de favoris"
                  >
                    ⬦ {AIRBNB_BOOKMARKLET_LABEL}
                  </a>
                  <span className="u-muted" style={{ fontSize: 11.5 }}>
                    {t('bookmarklet_drag_1')} <em>{t('bookmarklet_drag_2')}</em> {t('bookmarklet_drag_3')}
                  </span>
                </div>
              </li>
              <li>
                <div style={{ display: 'grid', gap: 6 }}>
                  <span>{t('import_open_search')}</span>
                  <button
                    type="button"
                    className="btn u-nowrap"
                    style={{ justifySelf: 'start' }}
                    onClick={openAirbnbSearch}
                  >
                    Ouvrir Airbnb pour {d.name}
                    <ExternalIcon />
                  </button>
                </div>
              </li>
              <li>
                {t('import_scroll_then_click')}
                <strong> « {AIRBNB_BOOKMARKLET_LABEL} »</strong>. Il vous dira combien d’annonces il a copiées
                (une vue en contient ~25).
              </li>
              <li style={{ color: 'var(--brand)' }}>
                <strong>Pour en avoir plus :</strong> Airbnb n’affiche qu’une vingtaine d’annonces à la fois. Collez
                cette première fournée, puis sur Airbnb passez à la <strong>page suivante</strong> des résultats
                (tout en bas), recliquez le marque-page et recollez. Les nouvelles s’ajoutent, les doublons sont
                ignorés — vous pouvez ainsi accumuler toute la station page après page.
              </li>
              <li>
                <div style={{ display: 'grid', gap: 6 }}>
                  <span>Revenez ici et collez (Ctrl+V) :</span>
                  <textarea
                    className="field"
                    style={{ minHeight: 90, fontSize: 11, fontFamily: 'inherit', resize: 'vertical' }}
                    placeholder="Collez ici le contenu copié depuis Airbnb…"
                    value={airbnbText}
                    onChange={(e) => setAirbnbText(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn--primary"
                    style={{ justifySelf: 'start' }}
                    disabled={!airbnbText.trim()}
                    onClick={() => void importAirbnb()}
                  >
                    Ajouter les annonces Airbnb
                  </button>
                </div>
              </li>
            </ol>

            {airbnbLog.length > 0 && (
              <div className="inset" style={{ padding: 14, display: 'grid', gap: 4 }}>
                {airbnbLog.map((line, i) => (
                  <p
                    key={i}
                    style={{ margin: 0, fontSize: 12, color: line.startsWith('⚠') ? 'var(--warn)' : 'var(--text)' }}
                  >
                    {line}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="modal__footer">
          <p className="u-muted" style={{ margin: 0, flex: 1, fontSize: 12 }}>
            Le logement rejoint la liste, le comparateur et le suivi de prix avec les mêmes calculs que les autres
            offres.
          </p>
          <button type="button" className="btn" onClick={close}>
            {mode === 'une' ? 'Annuler' : 'Fermer'}
          </button>
          {mode === 'une' && (
            <button type="button" className="btn btn--primary" disabled={!canAdd} onClick={add}>
              Ajouter
            </button>
          )}
        </div>
      </div>
    </>
  )
}
