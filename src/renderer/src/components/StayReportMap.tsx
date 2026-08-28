/**
 * Carte de situation du récapitulatif, dessinée par l'application.
 *
 * ## Pourquoi elle est dessinée et pas empruntée
 *
 * Les plans des pistes officiels des stations sont des œuvres graphiques
 * protégées. Aucun n'est téléchargé, aucun n'est intégré — même trouvé en
 * ligne, même dans le champ `map` du catalogue France Montagnes, qui en porte
 * pourtant l'URL pour chaque station. Cette carte-ci est composée ici : un fond
 * IGN, et par-dessus ce que le moteur local sait de la station.
 *
 * ## Ce qu'elle montre, et ce qu'elle avoue
 *
 * Le point du logement, les bases des remontées quand le moteur local les
 * connaît, l'échelle, le nord et la mention des fonds. Le moteur local ne rend
 * **pas** de tracés de pistes — il rend une emprise de domaine et des points de
 * base de remontée (`DomainDetail.geometry`, `Lift.base_lat/base_lon`). Quand
 * il est absent ou que le domaine a été importé sans ses remontées, la carte se
 * réduit au fond et au point du logement, et elle l'écrit.
 *
 * ## Le fond
 *
 * Une mosaïque de tuiles WMTS de la Géoplateforme, assemblée à la main : trois
 * par trois autour du centre. C'est du réseau, et c'est assumé — l'arbitrage
 * « fond IGN avec connexion réseau » a été rendu le 2026-08-29. Une tuile qui
 * ne répond pas laisse un carré vide plutôt qu'un fond de remplacement.
 */

import { useEffect, useState } from 'react'
import { api, isClientReady } from '@/api/client'
import type { Lift } from '@/api/types'
import { useI18n } from '@/i18n'

const TAILLE = 256
/** Trois tuiles de côté : assez pour situer un logement dans sa station. */
const COTE = 3
const LARGEUR = TAILLE * COTE

function tuileUrl(z: number, x: number, y: number): string {
  return (
    'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
    '&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM' +
    `&FORMAT=image/png&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}`
  )
}

/** Projection Web Mercator, en pixels du niveau de zoom. */
function projeter(lat: number, lon: number, z: number): { px: number; py: number } {
  const n = TAILLE * 2 ** z
  const px = ((lon + 180) / 360) * n
  const rad = (lat * Math.PI) / 180
  const py = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n
  return { px, py }
}

/**
 * Longueur au sol d'un pixel, pour l'échelle.
 *
 * Elle dépend de la latitude : une échelle calculée à l'équateur et affichée
 * en Savoie serait fausse de 30 %.
 */
function metresParPixel(lat: number, z: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z
}

interface Props {
  domainId: number
  domainName: string
  /** Position du logement. `null` quand la source ne la publie pas. */
  lat: number | null
  lon: number | null
  /** Repli : le centre de la station, quand le logement n'a pas de position. */
  centreLat: number
  centreLon: number
  zoom?: number
}

export function StayReportMap({
  domainId,
  domainName,
  lat,
  lon,
  centreLat,
  centreLon,
  zoom = 14
}: Props): JSX.Element {
  const { t } = useI18n()
  const [lifts, setLifts] = useState<Lift[] | null>(null)
  const [engineOff, setEngineOff] = useState(false)

  useEffect(() => {
    if (!isClientReady()) {
      setEngineOff(true)
      return
    }
    let vivant = true
    void api
      .domain(domainId)
      .then((detail) => {
        if (vivant) setLifts(detail.lifts ?? [])
      })
      .catch(() => {
        // Moteur injoignable : la carte se réduit au fond et au point, et le
        // dit. Elle ne se remplit pas d'un tracé de remplacement.
        if (vivant) setEngineOff(true)
      })
    return () => {
      vivant = false
    }
  }, [domainId])

  const cLat = lat ?? centreLat
  const cLon = lon ?? centreLon
  const centre = projeter(cLat, cLon, zoom)
  // Coin haut-gauche de la mosaïque, en pixels du niveau de zoom.
  const x0 = Math.floor(centre.px / TAILLE) - Math.floor(COTE / 2)
  const y0 = Math.floor(centre.py / TAILLE) - Math.floor(COTE / 2)
  const originePx = x0 * TAILLE
  const originePy = y0 * TAILLE

  /** Position d'un point géographique dans le cadre, ou `null` s'il en sort. */
  const dansLeCadre = (pLat: number, pLon: number): { x: number; y: number } | null => {
    const p = projeter(pLat, pLon, zoom)
    const x = p.px - originePx
    const y = p.py - originePy
    return x >= 0 && x <= LARGEUR && y >= 0 && y <= LARGEUR ? { x, y } : null
  }

  const pointLogement = lat != null && lon != null ? dansLeCadre(lat, lon) : null
  const basesRemontees = (lifts ?? [])
    .filter((l) => l.base_lat != null && l.base_lon != null)
    .map((l) => ({ nom: l.name, p: dansLeCadre(l.base_lat as number, l.base_lon as number) }))
    .filter((l): l is { nom: string | null; p: { x: number; y: number } } => l.p != null)

  // Barre d'échelle : on cherche une longueur ronde qui tienne en ~120 px.
  const mpp = metresParPixel(cLat, zoom)
  const rondes = [100, 200, 250, 500, 1000, 2000, 5000]
  const metres = rondes.find((m) => m / mpp <= 130) ?? rondes[rondes.length - 1]
  const barrePx = Math.round(metres / mpp)

  const tuiles: { x: number; y: number; dx: number; dy: number }[] = []
  for (let i = 0; i < COTE; i++) {
    for (let j = 0; j < COTE; j++) {
      tuiles.push({ x: x0 + i, y: y0 + j, dx: i * TAILLE, dy: j * TAILLE })
    }
  }

  const degrade = engineOff || basesRemontees.length === 0

  return (
    <figure className="report__map" style={{ margin: 0 }}>
      <div
        style={{
          position: 'relative',
          width: LARGEUR,
          height: LARGEUR,
          maxWidth: '100%',
          border: '1px solid var(--border)',
          overflow: 'hidden'
        }}
      >
        {tuiles.map((tu) => (
          <img
            key={`${tu.x}-${tu.y}`}
            src={tuileUrl(zoom, tu.x, tu.y)}
            alt=""
            width={TAILLE}
            height={TAILLE}
            style={{ position: 'absolute', left: tu.dx, top: tu.dy }}
          />
        ))}

        <svg
          width={LARGEUR}
          height={LARGEUR}
          viewBox={`0 0 ${LARGEUR} ${LARGEUR}`}
          style={{ position: 'absolute', inset: 0 }}
          role="img"
          aria-label={t('report_map_alt').replace('{d}', domainName)}
        >
          {basesRemontees.map((b, i) => (
            <g key={i}>
              <circle cx={b.p.x} cy={b.p.y} r={4} fill="#6b7280" stroke="#fff" strokeWidth={1.5} />
            </g>
          ))}

          {pointLogement && (
            <g>
              <circle
                cx={pointLogement.x}
                cy={pointLogement.y}
                r={9}
                fill="#2a78d6"
                stroke="#fff"
                strokeWidth={2.5}
              />
              <circle cx={pointLogement.x} cy={pointLogement.y} r={17} fill="none" stroke="#2a78d6" strokeWidth={1.5} />
            </g>
          )}

          {/* Nord et échelle : une carte sans les deux n'est pas une carte. */}
          <g transform={`translate(${LARGEUR - 34} 26)`}>
            <path d="M0 14 L7 -8 L14 14 L7 8 Z" fill="#101418" stroke="#fff" strokeWidth={1} />
            <text x="7" y="28" textAnchor="middle" fontSize="11" fontWeight="700" fill="#101418">
              N
            </text>
          </g>
          <g transform={`translate(14 ${LARGEUR - 26})`}>
            <rect x={-4} y={-14} width={barrePx + 8} height={26} fill="#fff" fillOpacity={0.78} />
            <line x1={0} y1={0} x2={barrePx} y2={0} stroke="#101418" strokeWidth={2} />
            <line x1={0} y1={-4} x2={0} y2={4} stroke="#101418" strokeWidth={2} />
            <line x1={barrePx} y1={-4} x2={barrePx} y2={4} stroke="#101418" strokeWidth={2} />
            <text x={0} y={-7} fontSize="11" fill="#101418">
              {metres >= 1000 ? `${metres / 1000} km` : `${metres} m`}
            </text>
          </g>
        </svg>
      </div>

      <figcaption style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 4, lineHeight: 1.45 }}>
        {t('report_map_credit')}
        {pointLogement == null && lat == null && <> · {t('report_map_no_position')}</>}
        {degrade && <> · {t('report_map_no_lifts')}</>}
      </figcaption>
    </figure>
  )
}
