/**
 * Chute de neige sur toile.
 *
 * Adapté de « Snow Fall » (Originkit), porté du prototype de refonte et typé
 * strict. Une seule toile plein cadre, `pointer-events: none`, masquée aux
 * lecteurs d'écran : c'est du décor, et le décor ne doit intercepter ni un clic
 * ni une lecture.
 *
 * Pourquoi une toile plutôt que des éléments animés en CSS, comme le
 * `Snowfall` monté sur toute l'application : à 160 flocons, 160 nœuds du DOM
 * animés en continu font repeindre l'arbre sous le héros. La toile ne repeint
 * qu'elle-même, et elle ne coûte qu'un nœud.
 *
 * **Mouvement réduit** : quand le système le demande, on peint la première
 * image et on s'arrête là. Pas de toile vide — les flocons sont visibles, ils
 * ne tombent pas. Une animation qu'on supprime entièrement enlève aussi
 * l'information qu'il neige.
 *
 * Le redimensionnement passe par `ResizeObserver` et non par l'événement
 * `resize` de la fenêtre : le héros change de hauteur quand la barre de
 * recherche passe à la ligne, sans que la fenêtre bouge.
 */

import { useEffect, useRef } from 'react'

export interface FloconsProps {
  /** Nombre de flocons. Réglage par défaut du prototype. */
  count?: number
  speedMin?: number
  speedMax?: number
  /** Dérive horizontale constante, en pixels par image. */
  wind?: number
  /** Part de dérive propre à chaque flocon. */
  windVariation?: number
  sizeMin?: number
  sizeMax?: number
  /** Opacités en pourcentage, comme dans le composant d'origine. */
  opacityMin?: number
  opacityMax?: number
  couleur?: string
}

interface Flocon {
  x: number
  y: number
  /** Rayon, en pixels. */
  r: number
  /** Vitesse de chute. */
  vy: number
  /** Dérive propre. */
  vx: number
  /** Déphasage de l'oscillation, pour que deux flocons ne balancent pas ensemble. */
  phase: number
  /** Amplitude de l'oscillation latérale. */
  houle: number
  alpha: number
}

export function Flocons({
  count = 160,
  speedMin = 0.6,
  speedMax = 2.4,
  wind = 0,
  windVariation = 0.8,
  sizeMin = 1,
  sizeMax = 4,
  opacityMin = 30,
  opacityMax = 90,
  couleur = '#ffffff'
}: FloconsProps): JSX.Element {
  const boite = useRef<HTMLDivElement>(null)
  const toile = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cont = boite.current
    const canvas = toile.current
    if (!cont || !canvas) return
    const g = canvas.getContext('2d')
    if (!g) return

    let raf = 0
    let W = 0
    let H = 0
    // Plafonné à 2 : au-delà, la toile quadruple de surface pour un gain que
    // personne ne voit sur des disques de quatre pixels.
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let flocons: Flocon[] = []
    const calme = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const alea = (a: number, b: number): number => a + Math.random() * (b - a)

    const construire = (entree?: ResizeObserverEntry): void => {
      const cr = entree?.contentRect
      W = Math.max(1, Math.floor(cr?.width || cont.clientWidth || cont.getBoundingClientRect().width) || 1)
      H = Math.max(1, Math.floor(cr?.height || cont.clientHeight || cont.getBoundingClientRect().height) || 1)
      canvas.width = Math.floor(W * dpr)
      canvas.height = Math.floor(H * dpr)
      canvas.style.width = `${W}px`
      canvas.style.height = `${H}px`
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      flocons = Array.from({ length: Math.max(0, Math.round(count)) }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: alea(sizeMin, sizeMax),
        vy: alea(speedMin, speedMax),
        vx: alea(-1, 1),
        phase: Math.random() * Math.PI * 2,
        houle: alea(0.2, 0.9),
        alpha: alea(opacityMin / 100, opacityMax / 100)
      }))
    }

    const dessiner = (): void => {
      g.clearRect(0, 0, W, H)
      g.fillStyle = couleur
      for (const f of flocons) {
        g.globalAlpha = f.alpha
        g.beginPath()
        g.arc(f.x, f.y, f.r, 0, Math.PI * 2)
        g.fill()
      }
      g.globalAlpha = 1
    }

    const boucle = (t: number): void => {
      for (const f of flocons) {
        f.y += f.vy
        f.x += wind + f.vx * windVariation + Math.sin(t * 0.0012 + f.phase) * f.houle
        // Un flocon sorti par le bas repart du haut à une abscisse tirée au
        // sort : le faire retomber au même endroit dessinerait des colonnes.
        if (f.y - f.r > H) {
          f.y = -f.r
          f.x = Math.random() * W
        }
        if (f.x < -f.r) f.x = W + f.r
        else if (f.x > W + f.r) f.x = -f.r
      }
      dessiner()
      raf = requestAnimationFrame(boucle)
    }

    construire()
    dessiner()
    if (!calme) raf = requestAnimationFrame(boucle)

    const ro = new ResizeObserver((es) => {
      construire(es[0])
      dessiner()
    })
    ro.observe(cont)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [count, speedMin, speedMax, wind, windVariation, sizeMin, sizeMax, opacityMin, opacityMax, couleur])

  return (
    <div ref={boite} className="flocons" aria-hidden>
      <canvas ref={toile} className="flocons__toile" />
    </div>
  )
}
