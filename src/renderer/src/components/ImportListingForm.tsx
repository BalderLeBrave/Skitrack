/**
 * Formulaire « Compléter l'annonce ».
 *
 * Ouvert après une lecture d'URL, un collage JSON-LD, ou à vide.
 * Rien n'est inventé : un champ vide reste vide, un prix d'appel n'est pas
 * un total, une position absente n'écrit pas de distance aux pistes.
 */

import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { api, isClientReady } from '@/api/client'
import { CloseIcon } from '@/components/Icons'
import { skiMapStyle } from '@/components/skiMapStyle'
import { nextLodgingId, toImportedLodging } from '@/data/importListing'
import { listingKeyFromUrl } from '@/data/lodgings'
import type { Domain } from '@/data/referentiel'
import { useFocusTrap } from '@/hooks/useShortcuts'
import { useI18n } from '@/i18n'
import { parseJsonLdText } from '@shared/normalizeJsonLd'
import {
  calculateCompleteness,
  field,
  identifyMissingCriticalFields,
  normalizeOffer,
  type ExtractedListing,
  type PriceUnit
} from '@shared/listingImport'
import { useApp } from '@/state/appState'
import type { ListingExtract } from '@shared/ipc-contract'

function extractToListing(ex: ListingExtract, url: string): ExtractedListing {
  const now = Date.now()
  const listing: ExtractedListing = {
    fetchMetadata: {
      url: ex.url || url,
      fetchStatus: ex.fetchStatus ?? (ex.ok ? 'success' : 'parse_error'),
      resolutionStrategy: ex.resolutionStrategy ?? (ex.ok ? 'proceed' : 'user_manual_entry'),
      attempts: 1,
      timestamp: now
    },
    title: ex.title ? field(ex.title, 'jsonld', 'medium', now) : undefined,
    canonicalUrl: ex.canonicalUrl ? field(ex.canonicalUrl, 'canonical', 'high', now) : undefined,
    priceBase:
      ex.price != null
        ? {
            value: ex.price,
            currency: ex.currency ?? 'EUR',
            unit: ex.priceUnit ?? 'unknown',
            isFrom: Boolean(ex.priceIsFrom),
            source: 'jsonld',
            confidence: ex.priceIsFrom ? 'medium' : 'high',
            extractedAt: now
          }
        : undefined,
    guests: ex.capacity != null ? field(ex.capacity, 'jsonld', 'medium', now) : undefined,
    rooms: ex.rooms != null ? field(ex.rooms, 'jsonld', 'medium', now) : undefined,
    geo:
      ex.lat != null && ex.lon != null
        ? {
            value: { lat: ex.lat, lon: ex.lon },
            source: 'jsonld',
            confidence: 'high',
            extractedAt: now,
            precision: ex.geoPrecision ?? 'exact'
          }
        : undefined,
    addressText: ex.address ? field(ex.address, 'jsonld', 'medium', now) : undefined,
    description: ex.description ? field(ex.description, 'jsonld', 'medium', now) : undefined,
    image: ex.images[0] ? field(ex.images[0], 'opengraph', 'medium', now) : undefined,
    completenessScore: ex.completenessScore ?? 0,
    listingHash: ex.listingHash ?? '',
    offerHash: ex.offerHash,
    missingCriticalFields: ex.missingCriticalFields ?? []
  }
  listing.completenessScore = calculateCompleteness(listing)
  listing.missingCriticalFields = identifyMissingCriticalFields(listing)
  return listing
}

function PlaceMap({
  center,
  value,
  onPick
}: {
  center: { lat: number; lon: number }
  value: { lat: number; lon: number } | null
  onPick: (lat: number, lon: number) => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const marker = useRef<maplibregl.Marker | null>(null)
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick

  useEffect(() => {
    if (!ref.current || map.current) return
    const m = new maplibregl.Map({
      container: ref.current,
      style: skiMapStyle('pistes', true),
      center: [center.lon, center.lat],
      zoom: 13,
      attributionControl: false
    })
    m.addControl(new maplibregl.AttributionControl({ compact: true }))
    m.on('click', (e) => onPickRef.current(e.lngLat.lat, e.lngLat.lng))
    map.current = m
    return () => {
      m.remove()
      map.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const m = map.current
    if (!m) return
    marker.current?.remove()
    if (!value) return
    marker.current = new maplibregl.Marker().setLngLat([value.lon, value.lat]).addTo(m)
    m.easeTo({ center: [value.lon, value.lat], duration: 400 })
  }, [value])

  return <div ref={ref} className="rc-import__map" data-testid="import-map" />
}

export function ImportListingForm({ domain }: { domain: Domain }): JSX.Element | null {
  const { t } = useI18n()
  const { state, patch } = useApp()
  const box = useRef<HTMLElement>(null)
  useFocusTrap(box, state.importOpen)

  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [extracted, setExtracted] = useState<ExtractedListing | null>(null)
  const [jsonLd, setJsonLd] = useState('')
  const [title, setTitle] = useState('')
  const [price, setPrice] = useState('')
  const [unit, setUnit] = useState<PriceUnit>('stay')
  const [isFrom, setIsFrom] = useState(false)
  const [checkIn, setCheckIn] = useState(state.arrDate)
  const [checkOut, setCheckOut] = useState(state.depDate)
  const [guests, setGuests] = useState(state.travelers)
  const [rooms, setRooms] = useState(state.importRooms)
  const [address, setAddress] = useState('')
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [noGeo, setNoGeo] = useState(false)
  const [geoSource, setGeoSource] = useState<'exact' | 'approximate' | 'none'>('none')
  const [cleaning, setCleaning] = useState('')
  const [tax, setTax] = useState('')
  const [service, setService] = useState('')
  const [utilities, setUtilities] = useState('')
  const [deposit, setDeposit] = useState('')
  const [depositRefundable, setDepositRefundable] = useState(true)
  const [feesComplete, setFeesComplete] = useState(false)

  useEffect(() => {
    if (!state.importOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [state.importOpen])

  if (!state.importOpen) return null

  const close = (): void => {
    patch({ importOpen: false })
    setMessage(null)
    setBusy(false)
  }

  const applyExtracted = (listing: ExtractedListing): void => {
    setExtracted(listing)
    if (listing.title) setTitle(listing.title.value)
    if (listing.priceBase) {
      setPrice(String(listing.priceBase.value))
      setUnit(listing.priceBase.unit)
      setIsFrom(listing.priceBase.isFrom)
    }
    if (listing.guests) setGuests(listing.guests.value)
    else if (listing.occupancyMax) setGuests(listing.occupancyMax.value)
    if (listing.rooms) setRooms(listing.rooms.value)
    if (listing.checkIn) setCheckIn(listing.checkIn.value)
    if (listing.checkOut) setCheckOut(listing.checkOut.value)
    if (listing.addressText) setAddress(listing.addressText.value)
    if (listing.geo && listing.geo.precision !== 'none') {
      setLat(String(listing.geo.value.lat))
      setLon(String(listing.geo.value.lon))
      setNoGeo(false)
      setGeoSource(listing.geo.precision)
    }
    if (listing.fees) {
      if (listing.fees.cleaning != null) setCleaning(String(listing.fees.cleaning))
      if (listing.fees.touristTax != null) setTax(String(listing.fees.touristTax))
      if (listing.fees.service != null) setService(String(listing.fees.service))
      if (listing.fees.utilities != null) setUtilities(String(listing.fees.utilities))
      if (listing.fees.deposit != null) setDeposit(String(listing.fees.deposit))
      if (listing.fees.depositRefundable != null) setDepositRefundable(listing.fees.depositRefundable)
      setFeesComplete(listing.fees.isComplete)
    }
    const strategy = listing.fetchMetadata.resolutionStrategy
    if (strategy === 'user_manual_entry') setMessage(t('import_status_denied'))
    else if (strategy === 'partial_with_form' || listing.completenessScore < 80) setMessage(t('import_status_partial'))
    else setMessage(null)
  }

  const readUrl = async (): Promise<void> => {
    const url = state.importUrl.trim()
    if (!url) return
    setBusy(true)
    setMessage(null)
    try {
      const ex = await window.skitrack.fetchListing(url)
      applyExtracted(extractToListing(ex, url))
      if (ex.blockedReason) setMessage(ex.blockedReason)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
      applyExtracted({
        fetchMetadata: {
          url,
          fetchStatus: 'network_error',
          resolutionStrategy: 'user_manual_entry',
          attempts: 1,
          timestamp: Date.now()
        },
        completenessScore: 0,
        listingHash: '',
        missingCriticalFields: ['priceBase', 'checkIn', 'checkOut', 'guests']
      })
    } finally {
      setBusy(false)
    }
  }

  const parsePaste = (): void => {
    const url = state.importUrl.trim() || 'https://import.local/pasted'
    const listing = parseJsonLdText(jsonLd, url, extracted?.listingHash ?? '')
    applyExtracted(listing)
  }

  const geocode = async (): Promise<void> => {
    if (!address.trim() || !isClientReady()) return
    setBusy(true)
    try {
      const hits = await api.geocode(address.trim(), 1)
      const hit = hits[0]
      if (hit && typeof hit.lat === 'number' && typeof hit.lon === 'number') {
        setLat(String(hit.lat))
        setLon(String(hit.lon))
        setNoGeo(false)
        setGeoSource('approximate')
        setMessage(t('geocode_done'))
      } else {
        setMessage(t('geocode_none'))
      }
    } catch {
      setMessage(t('geocode_none'))
    } finally {
      setBusy(false)
    }
  }

  const latN = parseFloat(lat.replace(',', '.'))
  const lonN = parseFloat(lon.replace(',', '.'))
  const hasCoords = !noGeo && Number.isFinite(latN) && Number.isFinite(lonN)

  const save = (): void => {
    const url = state.importUrl.trim() || extracted?.canonicalUrl?.value || extracted?.fetchMetadata.url || ''
    const base: ExtractedListing = extracted ?? {
      fetchMetadata: {
        url,
        fetchStatus: 'parse_error',
        resolutionStrategy: 'user_manual_entry',
        attempts: 0,
        timestamp: Date.now()
      },
      completenessScore: 0,
      listingHash: '',
      missingCriticalFields: []
    }
    const lodging = toImportedLodging(
      base,
      { checkIn, checkOut, guests, domainId: domain.id },
      nextLodgingId(state.imported),
      {
        title: title.trim() || undefined,
        price: num(price) ?? undefined,
        unit,
        isFrom,
        lat: hasCoords ? latN : undefined,
        lon: hasCoords ? lonN : undefined,
        precision: noGeo ? 'none' : hasCoords ? geoSource : 'none',
        address: address.trim() || undefined,
        guests,
        rooms: rooms > 0 ? rooms : undefined,
        checkIn,
        checkOut,
        feesComplete,
        cleaning: cleaning ? Number(cleaning.replace(',', '.')) : undefined,
        touristTax: tax ? Number(tax.replace(',', '.')) : undefined,
        service: service ? Number(service.replace(',', '.')) : undefined,
        utilities: utilities ? Number(utilities.replace(',', '.')) : undefined,
        deposit: deposit ? Number(deposit.replace(',', '.')) : undefined,
        depositRefundable
      }
    )
    const key = lodging.listingHash || listingKeyFromUrl(lodging.url)
    const stayKey = [key, lodging.priceCheckIn ?? checkIn, lodging.priceCheckOut ?? checkOut, lodging.pers].join('|')
    const without = state.imported.filter((l) => {
      const k = l.listingHash || listingKeyFromUrl(l.url)
      if (!key || !k || k !== key) return true
      const other = [k, l.priceCheckIn ?? '', l.priceCheckOut ?? '', l.pers].join('|')
      return other !== stayKey
    })
    patch({ imported: [...without, lodging], importOpen: false, importUrl: '', importPrice: '' })
  }

  const num = (v: string): number | null => {
    const n = Number(v.replace(',', '.'))
    return v.trim() && Number.isFinite(n) ? n : null
  }
  const previewOffer = normalizeOffer(
    {
      priceBase:
        num(price) != null
          ? {
              value: num(price) as number,
              currency: extracted?.priceBase?.currency ?? 'EUR',
              unit,
              isFrom,
              source: 'manual',
              confidence: 'high',
              extractedAt: 0
            }
          : undefined,
      fees: {
        cleaning: cleaning ? Number(cleaning.replace(',', '.')) : undefined,
        touristTax: tax ? Number(tax.replace(',', '.')) : undefined,
        service: service ? Number(service.replace(',', '.')) : undefined,
        utilities: utilities ? Number(utilities.replace(',', '.')) : undefined,
        deposit: deposit ? Number(deposit.replace(',', '.')) : undefined,
        isComplete: feesComplete,
        source: 'manual'
      }
    },
    { checkIn, checkOut, guests }
  )
  const previewTotal =
    previewOffer.priceTotal != null
      ? `${previewOffer.priceTotal} €`
      : previewOffer.flags.includes('price_is_from')
        ? t('import_call_price')
        : t('import_incomplete_price')

  const srcLine = (label: string, source?: string, conf?: string): JSX.Element | null => {
    if (!source) return null
    return (
      <p className="rc-import__src">
        {label} · {t('import_source')} {source}
        {conf ? ` · ${t('import_confidence')} ${conf}` : ''}
      </p>
    )
  }

  return (
    <div className="rc-fiche" data-testid="import-listing">
      <button type="button" className="rc-fiche__scrim" aria-label={t('import_cancel')} onClick={close} />
      <aside ref={box} className="rc-fiche__win rc-import" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <header className="rc-fiche__head">
          <h2 id="import-title" className="rc-fiche__title">
            {t('import_title')}
          </h2>
          <button type="button" className="rc-fiche__close" onClick={close} aria-label={t('import_cancel')}>
            <CloseIcon />
          </button>
        </header>
        <div className="rc-fiche__col rc-import__body">
          <label className="rc-import__field">
            <span>{t('import_url_label')}</span>
            <input
              value={state.importUrl}
              onChange={(e) => patch({ importUrl: e.target.value })}
              inputMode="url"
              autoCapitalize="off"
              data-testid="import-url"
            />
          </label>
          <div className="rc-import__row">
            <button type="button" className="rc-btn rc-btn--cta" disabled={busy || !state.importUrl.trim()} onClick={() => void readUrl()} data-testid="import-fetch">
              {busy ? t('import_fetching') : t('import_fetch')}
            </button>
            {state.importUrl.trim() && (
              <button type="button" className="rc-btn rc-btn--ghost" onClick={() => void window.skitrack.openExternal(state.importUrl.trim())}>
                {t('import_open_browser')}
              </button>
            )}
          </div>
          {message && <p className="rc-notice rc-notice--warn" data-testid="import-msg">{message}</p>}
          {extracted && (
            <p className="rc-muted" data-testid="import-score">
              {t('import_score').replace('{n}', String(extracted.completenessScore))}
            </p>
          )}

          <section>
            <h3 className="rc-fiche__label">{t('import_section_required')}</h3>
            <label className="rc-import__field">
              <span>{t('import_listing_name')}</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} data-testid="import-name" />
            </label>
            {srcLine('titre', extracted?.title?.source, extracted?.title?.confidence)}
            <div className="rc-import__grid">
              <label className="rc-import__field">
                <span>{t('import_total_price')}</span>
                <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" data-testid="import-price" />
              </label>
              <label className="rc-import__field">
                <span>{t('import_unit')}</span>
                <select value={unit} onChange={(e) => setUnit(e.target.value as PriceUnit)} data-testid="import-unit">
                  <option value="stay">{t('import_unit_stay')}</option>
                  <option value="night">{t('import_unit_night')}</option>
                  <option value="week">{t('import_unit_week')}</option>
                  <option value="unknown">{t('import_unit_unknown')}</option>
                </select>
              </label>
            </div>
            <label className="rc-import__check">
              <input type="checkbox" checked={isFrom} onChange={(e) => setIsFrom(e.target.checked)} data-testid="import-from" />
              {t('import_price_from')}
            </label>
            <p className="rc-import__total" data-testid="import-preview">
              {previewTotal}
            </p>
            {srcLine('prix', extracted?.priceBase?.source, extracted?.priceBase?.confidence)}
            {previewOffer.flags.length > 0 && (
              <details className="rc-import__src">
                <summary>{t('import_source')}</summary>
                <p>
                  {previewOffer.priceBase != null ? `${previewOffer.priceBase} €` : '—'}
                  {previewOffer.flags.length > 0 ? ` · ${previewOffer.flags.join(' · ')}` : ''}
                </p>
              </details>
            )}
            <div className="rc-import__grid">
              <label className="rc-import__field">
                <span>{t('import_arr')}</span>
                <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
              </label>
              <label className="rc-import__field">
                <span>{t('import_dep')}</span>
                <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
              </label>
              <label className="rc-import__field">
                <span>{t('import_guests')}</span>
                <input type="number" min={1} value={guests} onChange={(e) => setGuests(Number(e.target.value) || 1)} />
              </label>
              <label className="rc-import__field">
                <span>{t('sb_rooms')}</span>
                <input type="number" min={0} value={rooms} onChange={(e) => setRooms(Number(e.target.value) || 0)} />
              </label>
            </div>
          </section>

          <section>
            <h3 className="rc-fiche__label">{t('import_section_geo')}</h3>
            <label className="rc-import__field">
              <span>{t('origin_address')}</span>
              <input value={address} onChange={(e) => setAddress(e.target.value)} />
            </label>
            <div className="rc-import__row">
              <button type="button" className="rc-btn rc-btn--ghost" disabled={busy || !address.trim()} onClick={() => void geocode()}>
                {t('import_geocode')}
              </button>
            </div>
            <label className="rc-import__check">
              <input type="checkbox" checked={noGeo} onChange={(e) => setNoGeo(e.target.checked)} data-testid="import-no-geo" />
              {t('import_no_geo')}
            </label>
            {!noGeo && (
              <>
                <p className="rc-muted">{t('import_place_map')}</p>
                <PlaceMap
                  center={{ lat: domain.lat, lon: domain.lon }}
                  value={hasCoords ? { lat: latN, lon: lonN } : null}
                  onPick={(la, lo) => {
                    setLat(String(la))
                    setLon(String(lo))
                    setGeoSource('exact')
                    setNoGeo(false)
                  }}
                />
                <div className="rc-import__grid">
                  <label className="rc-import__field">
                    <span>{t('import_lat')}</span>
                    <input value={lat} onChange={(e) => { setLat(e.target.value); setGeoSource('exact') }} />
                  </label>
                  <label className="rc-import__field">
                    <span>{t('import_lon')}</span>
                    <input value={lon} onChange={(e) => { setLon(e.target.value); setGeoSource('exact') }} />
                  </label>
                </div>
              </>
            )}
          </section>

          <section>
            <h3 className="rc-fiche__label">{t('import_section_fees')}</h3>
            <div className="rc-import__grid">
              <label className="rc-import__field">
                <span>{t('import_cleaning')}</span>
                <input value={cleaning} onChange={(e) => setCleaning(e.target.value)} inputMode="decimal" />
              </label>
              <label className="rc-import__field">
                <span>{t('import_tax')}</span>
                <input value={tax} onChange={(e) => setTax(e.target.value)} inputMode="decimal" />
              </label>
              <label className="rc-import__field">
                <span>{t('import_service')}</span>
                <input value={service} onChange={(e) => setService(e.target.value)} inputMode="decimal" />
              </label>
              <label className="rc-import__field">
                <span>{t('import_utilities')}</span>
                <input value={utilities} onChange={(e) => setUtilities(e.target.value)} inputMode="decimal" />
              </label>
              <label className="rc-import__field">
                <span>{t('import_deposit')}</span>
                <input value={deposit} onChange={(e) => setDeposit(e.target.value)} inputMode="decimal" />
              </label>
            </div>
            <label className="rc-import__check">
              <input type="checkbox" checked={depositRefundable} onChange={(e) => setDepositRefundable(e.target.checked)} />
              {t('import_refundable')}
            </label>
            <label className="rc-import__check">
              <input type="checkbox" checked={feesComplete} onChange={(e) => setFeesComplete(e.target.checked)} data-testid="import-fees-complete" />
              {t('import_fees_complete')}
            </label>
          </section>

          <section>
            <h3 className="rc-fiche__label">{t('import_section_raw')}</h3>
            <label className="rc-import__field">
              <span>{t('import_paste_jsonld')}</span>
              <textarea value={jsonLd} onChange={(e) => setJsonLd(e.target.value)} rows={6} data-testid="import-jsonld" />
            </label>
            <button type="button" className="rc-btn rc-btn--ghost" disabled={!jsonLd.trim()} onClick={parsePaste} data-testid="import-parse-jsonld">
              {t('import_parse')}
            </button>
          </section>
        </div>
        <footer className="rc-fiche__foot">
          <button type="button" className="rc-btn rc-btn--ghost" onClick={close}>
            {t('import_cancel')}
          </button>
          <button type="button" className="rc-btn rc-btn--cta" onClick={save} data-testid="import-save">
            {t('import_validate')}
          </button>
        </footer>
      </aside>
    </div>
  )
}
