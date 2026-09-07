/**
 * LiquidGlass — surface de verre liquide : flou d'arrière-plan, réfraction
 * par filtre SVG (turbulence + displacement) animée en JS, reflet spéculaire
 * qui suit le pointeur, liseré lumineux. Sobre : une seule surface par écran
 * (la barre de recherche), pas un thème entier.
 */

import { useEffect, useId, useRef } from 'react'

interface Props {
  children: React.ReactNode
  className?: string
  /** Amplitude de la réfraction (px). 0 = verre plat. */
  distort?: number
}

export function LiquidGlass({ children, className = '', distort = 6 }: Props): JSX.Element {
  const id = useId().replace(/:/g, '')
  const root = useRef<HTMLDivElement>(null)
  const turb = useRef<SVGFETurbulenceElement>(null)

  useEffect(() => {
    const el = root.current
    if (!el) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const move = (e: PointerEvent): void => {
      const r = el.getBoundingClientRect()
      el.style.setProperty('--gx', `${((e.clientX - r.left) / r.width) * 100}%`)
      el.style.setProperty('--gy', `${((e.clientY - r.top) / r.height) * 100}%`)
    }
    const leave = (): void => {
      el.style.setProperty('--gx', '50%')
      el.style.setProperty('--gy', '0%')
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerleave', leave)
    let raf = 0
    if (!still) {
      let t = 0
      const tick = (): void => {
        t += 0.004
        turb.current?.setAttribute('baseFrequency', `${0.008 + Math.sin(t) * 0.003} ${0.012 + Math.cos(t * 0.8) * 0.003}`)
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }
    return () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerleave', leave)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div className={`rc-glass ${className}`} ref={root} data-testid="liquid-glass">
      <svg className="rc-glass__defs" aria-hidden="true" focusable="false">
        <filter id={`lg-${id}`} x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
          <feTurbulence ref={turb} type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="2" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={distort} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <div className="rc-glass__refract" style={{ filter: `url(#lg-${id})` }} aria-hidden />
      <div className="rc-glass__shine" aria-hidden />
      <div className="rc-glass__content">{children}</div>
    </div>
  )
}
