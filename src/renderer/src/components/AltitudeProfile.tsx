/**
 * Vignette d'amplitude skiable.
 *
 * Toutes les vignettes d'un jeu de résultats partagent la même échelle
 * verticale : c'est ce qui permet de comparer deux domaines d'un coup d'œil
 * sans lire les chiffres. Une échelle par vignette donnerait à tous les
 * domaines la même hauteur de barre, donc aucune information.
 *
 * La barre est le domaine skiable, le trait plein le front de neige, le
 * pointillé la ligne des 2 000 m — le repère mental de la tenue de la neige.
 */

const HEIGHT = 84
const WIDTH = 26
const REFERENCE_ALTITUDE = 2000

interface Props {
  min: number
  max: number
  village: number
  scaleMin: number
  scaleMax: number
}

export function AltitudeProfile({ min, max, village, scaleMin, scaleMax }: Props): JSX.Element {
  const span = Math.max(scaleMax - scaleMin, 1)
  const y = (v: number): number => HEIGHT - ((v - scaleMin) / span) * HEIGHT

  const top = y(max)
  const height = Math.max(y(min) - y(max), 2)
  const showReference = scaleMin < REFERENCE_ALTITUDE && scaleMax > REFERENCE_ALTITUDE

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      style={{ flex: '0 0 auto' }}
      role="img"
      aria-label={`Amplitude skiable de ${min} à ${max} mètres`}
    >
      <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill="var(--surface)" rx="3" />
      <rect x="0" y={+top.toFixed(1)} width={WIDTH} height={+height.toFixed(1)} fill="url(#altGrad)" rx="3" />
      {showReference && (
        <line
          x1="0"
          x2={WIDTH}
          y1={+y(REFERENCE_ALTITUDE).toFixed(1)}
          y2={+y(REFERENCE_ALTITUDE).toFixed(1)}
          stroke="rgba(244,185,66,0.5)"
          strokeWidth="1"
          strokeDasharray="2 2"
        />
      )}
      <line
        x1="-2"
        x2={WIDTH + 2}
        y1={+y(village).toFixed(1)}
        y2={+y(village).toFixed(1)}
        stroke="var(--accent)"
        strokeWidth="2"
      />
    </svg>
  )
}
