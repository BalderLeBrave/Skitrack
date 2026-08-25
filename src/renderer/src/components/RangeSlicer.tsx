/**
 * Slicer de plage : une piste, deux poignées, deux champs chiffrés.
 *
 * Un `<input type="range">` unique ne répond qu'à « au moins » ou « au plus ».
 * La moitié des questions posées aux filtres sont des fourchettes — un bas de
 * pistes entre 1 400 et 1 800 m, un forfait entre 200 et 260 € — et les poser
 * avec deux curseurs séparés obligeait à comprendre que l'un était un plancher
 * et l'autre un plafond sans que rien ne le montre.
 *
 * Les deux champs sous la piste ne sont pas une redondance : une borne connue
 * se tape, elle ne se cherche pas au pixel. Le geste au curseur sert à
 * explorer, la saisie à poser une valeur exacte.
 *
 * Composant purement présentationnel : il ne connaît ni l'état applicatif ni
 * les clés du filtre, seulement deux nombres et un `onChange`.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'

type Bound = 'lo' | 'hi'

interface Props {
  min: number
  max: number
  step: number
  lo: number
  hi: number
  /** Rend une borne pour l'affichage (aria compris) : « 1 450 m », « 4 h 15 ». */
  format: (value: number) => string
  /** Suffixe des deux champs chiffrés, quand l'unité n'est pas dans `format`. */
  unit?: string
  label: string
  loLabel: string
  hiLabel: string
  onChange: (lo: number, hi: number) => void
}

interface Drag {
  which: Bound
  rect: DOMRect
}

export function RangeSlicer({
  min,
  max,
  step,
  lo,
  hi,
  format,
  unit,
  label,
  loLabel,
  hiLabel,
  onChange
}: Props): JSX.Element {
  const drag = useRef<Drag | null>(null)
  // Le geste lit toujours les bornes du rendu courant : conservées dans une
  // ref, elles restent justes pendant un glissement sans réabonner les
  // écouteurs de fenêtre à chaque image.
  const bounds = useRef({ lo, hi })
  bounds.current = { lo, hi }

  const clamp = useCallback(
    (v: number): number => Math.min(max, Math.max(min, v)),
    [min, max]
  )

  /**
   * Aligne une valeur sur le pas. **Réservé au geste**, jamais à la frappe.
   *
   * Appliquée à chaque caractère tapé, elle rendait les champs inutilisables :
   * sur un budget au pas de 100, taper « 1 » donnait `Math.round(1/100)*100`,
   * soit 0, que le champ contrôlé réaffichait aussitôt. Impossible d'atteindre
   * 1 500 chiffre par chiffre — on ne voyait que des zéros. Les huit plages de
   * filtres étaient concernées, du pas de 10 au pas de 100.
   */
  const quantize = useCallback(
    (v: number): number => Math.round(clamp(v) / step) * step,
    [clamp, step]
  )

  /**
   * Pose une borne, en **échangeant** les deux si le geste dépasse l'autre.
   *
   * Bloquer la poignée contre sa voisine paraît sûr et se paie au geste : le
   * curseur continue, la poignée reste collée, et le doigt doit revenir en
   * arrière puis repartir. L'échange suit l'intention — la poignée saisie
   * devient l'autre borne, et le glissement continue sans rupture.
   */
  const set = useCallback(
    (which: Bound, raw: number): Bound => {
      const v = quantize(raw)
      const { lo: curLo, hi: curHi } = bounds.current
      if (which === 'lo') {
        if (v > curHi) {
          onChange(curHi, v)
          return 'hi'
        }
        onChange(v, curHi)
        return 'lo'
      }
      if (v < curLo) {
        onChange(v, curLo)
        return 'lo'
      }
      onChange(curLo, v)
      return 'hi'
    },
    [quantize, onChange]
  )

  const valueAt = (rect: DOMRect, clientX: number): number => {
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)))
    return min + pct * (max - min)
  }

  // Un seul couple d'écouteurs sur la fenêtre pour toute la durée du geste,
  // plutôt qu'un abonnement par image : le pointeur sort très vite de la piste,
  // qui ne fait que quatre pixels de haut.
  useEffect(() => {
    const onMove = (e: globalThis.PointerEvent): void => {
      const d = drag.current
      if (!d) return
      d.which = set(d.which, valueAt(d.rect, e.clientX))
    }
    const onUp = (): void => {
      if (!drag.current) return
      drag.current = null
      document.body.style.userSelect = ''
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      document.body.style.userSelect = ''
    }
    // `set` referme `onChange`, qui change à chaque rendu du parent : les
    // écouteurs sont remontés avec lui, ce qui reste bien moins coûteux que de
    // lire une valeur périmée en plein glissement.
  }, [set, min, max])

  const grab = (which: Bound, rect: DOMRect): void => {
    drag.current = { which, rect }
    document.body.style.userSelect = 'none'
  }

  const onHandleDown = (which: Bound) => (e: PointerEvent<HTMLDivElement>) => {
    const track = e.currentTarget.parentElement
    if (!track) return
    e.preventDefault()
    e.stopPropagation()
    grab(which, track.getBoundingClientRect())
  }

  /**
   * Clic dans la piste : la poignée la plus proche vient au point cliqué **et
   * reste attrapée**. Sans cela, poser une borne d'un clic puis vouloir
   * l'ajuster demanderait de relâcher et de viser à nouveau une cible de seize
   * pixels.
   */
  const onTrackDown = (e: PointerEvent<HTMLDivElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect()
    const v = valueAt(rect, e.clientX)
    const which: Bound = Math.abs(v - lo) <= Math.abs(v - hi) ? 'lo' : 'hi'
    grab(set(which, v), rect)
  }

  const onKey = (which: Bound) => (e: KeyboardEvent<HTMLDivElement>) => {
    const cur = which === 'lo' ? lo : hi
    let next: number | null = null
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = cur - step
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = cur + step
    else if (e.key === 'PageDown') next = cur - step * 10
    else if (e.key === 'PageUp') next = cur + step * 10
    else if (e.key === 'Home') next = min
    else if (e.key === 'End') next = max
    if (next === null) return
    e.preventDefault()
    set(which, next)
  }

  const span = Math.max(1, max - min)
  const loPct = ((lo - min) / span) * 100
  const hiPct = ((hi - min) / span) * 100

  /**
   * Champ chiffré : la frappe est un brouillon, la validation seule engage.
   *
   * Deux besoins qui se contredisaient. Le geste veut des valeurs alignées sur
   * le pas ; la frappe veut qu'on puisse traverser des états intermédiaires
   * absurdes — « 1 », puis « 15 », avant d'arriver à « 1500 ». Tant que le
   * champ est en cours de saisie, sa chaîne fait foi et l'alignement attend.
   *
   * Le filtre suit quand même en direct, mais sans alignement et sans échange
   * de bornes : voir un chiffre franchir sa borne voisine et changer de champ
   * pendant qu'on le tape serait incompréhensible. L'ordre et l'alignement sont
   * rétablis à la sortie du champ — c'est là seulement que `set` reprend la
   * main, échange compris.
   */
  const [draft, setDraft] = useState<{ lo: string | null; hi: string | null }>({
    lo: null,
    hi: null
  })

  const commitDraft = (which: Bound): void => {
    const text = draft[which]
    setDraft((d) => ({ ...d, [which]: null }))
    if (text == null || text.trim() === '') return
    const v = Number(text)
    if (Number.isFinite(v)) set(which, v)
  }

  const numberField = (which: Bound): JSX.Element => (
    <input
      type="number"
      className="slicer__num u-num"
      value={draft[which] ?? String(which === 'lo' ? lo : hi)}
      min={min}
      max={max}
      step={step}
      inputMode="numeric"
      aria-label={which === 'lo' ? loLabel : hiLabel}
      onChange={(e) => {
        const text = e.target.value
        setDraft((d) => ({ ...d, [which]: text }))
        const v = Number(text)
        if (text.trim() === '' || !Number.isFinite(v)) return
        const c = clamp(v)
        const { lo: curLo, hi: curHi } = bounds.current
        // Pas d'échange pendant la frappe : on ne pousse la valeur que si elle
        // reste du bon côté de sa voisine.
        if (which === 'lo' && c <= curHi) onChange(c, curHi)
        else if (which === 'hi' && c >= curLo) onChange(curLo, c)
      }}
      onBlur={() => commitDraft(which)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )

  return (
    <div className="slicer">
      <div className="slicer__track" onPointerDown={onTrackDown}>
        <div
          className="slicer__band"
          style={{ left: `${loPct.toFixed(2)}%`, right: `${(100 - hiPct).toFixed(2)}%` }}
        />
        <div
          className="slicer__handle"
          role="slider"
          tabIndex={0}
          aria-label={`${label} — ${loLabel}`}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={lo}
          aria-valuetext={format(lo)}
          style={{ left: `${loPct.toFixed(2)}%` }}
          onPointerDown={onHandleDown('lo')}
          onKeyDown={onKey('lo')}
        />
        <div
          className="slicer__handle slicer__handle--hi"
          role="slider"
          tabIndex={0}
          aria-label={`${label} — ${hiLabel}`}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={hi}
          aria-valuetext={format(hi)}
          style={{ left: `${hiPct.toFixed(2)}%` }}
          onPointerDown={onHandleDown('hi')}
          onKeyDown={onKey('hi')}
        />
      </div>
      <div className="slicer__fields">
        {numberField('lo')}
        <span className="slicer__dash" aria-hidden>
          –
        </span>
        {numberField('hi')}
        {unit && <span className="slicer__unit u-muted">{unit}</span>}
      </div>
    </div>
  )
}
