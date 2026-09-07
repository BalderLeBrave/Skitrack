/**
 * Export du récapitulatif de séjour en PDF.
 *
 * ## Pourquoi un crochet et pas deux copies
 *
 * L'export est proposé à deux endroits — l'écran Décision et la fiche du
 * logement retenu — et la mécanique est délicate : il faut monter le rapport,
 * attendre que ses images soient **décodées**, basculer la page en vue
 * d'impression, appeler le processus principal, puis tout remettre en place
 * quoi qu'il arrive. Deux copies de cette séquence divergeraient au premier
 * ajustement, et le PDF sortirait avec des carrés blancs d'un côté seulement.
 *
 * ## Ce qu'il garantit
 *
 * `data-print` est retiré et le rapport démonté dans un `finally` : une erreur
 * de génération ne peut pas laisser l'application en vue d'impression, écran
 * blanc à l'appui. Et une annulation dans la boîte de dialogue ne produit
 * aucun message — l'utilisateur qui renonce n'a pas à lire un compte rendu.
 */

import { useCallback, useState } from 'react'
import { useI18n } from '@/i18n'

export interface ReportExport {
  /** Le rapport doit-il être présent dans le DOM ? Vrai le temps de l'export. */
  monte: boolean
  busy: boolean
  /** Compte rendu du dernier export : chemin écrit, ou motif d'échec. */
  message: string | null
  /** Lance l'export. `nom` sert de nom de fichier proposé, sans extension. */
  exporter: (nom: string) => Promise<void>
}

/**
 * Attend que les images du rapport soient réellement décodées.
 *
 * `printToPDF` photographie la page à l'instant où on l'appelle : une tuile de
 * fond de carte encore en vol donnerait un carré blanc. `decode()` résout quand
 * l'image est prête ; une tuile en erreur est ignorée plutôt que de bloquer
 * l'export — le PDF sort avec un trou, ce qui vaut mieux qu'un export qui ne
 * sort jamais.
 */
async function attendreImages(): Promise<void> {
  const rapport = document.getElementById('stay-report')
  if (!rapport) return
  const images = [...rapport.querySelectorAll('img')]
  await Promise.all(images.map((img) => img.decode().catch(() => undefined)))
}

export function useReportExport(): ReportExport {
  const { t } = useI18n()
  const [monte, setMonte] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const exporter = useCallback(
    async (nom: string): Promise<void> => {
      setBusy(true)
      setMessage(null)
      setMonte(true)
      document.documentElement.setAttribute('data-print', 'rapport')
      try {
        // Un tour de boucle pour que React ait posé le rapport dans le DOM,
        // puis l'attente des tuiles.
        await new Promise((r) => setTimeout(r, 0))
        await attendreImages()
        const res = await window.skitrack.reportPdf({
          suggestedName: nom.replace(/[^\w.-]+/g, '-')
        })
        // Une annulation n'est pas un échec : elle ne dit rien à l'écran.
        if (res.cancelled) setMessage(null)
        else if (res.ok && res.path) setMessage(t('report_saved').replace('{p}', res.path))
        else setMessage(t('report_failed').replace('{e}', res.error ?? '—'))
      } catch (err) {
        setMessage(t('report_failed').replace('{e}', err instanceof Error ? err.message : String(err)))
      } finally {
        document.documentElement.removeAttribute('data-print')
        setMonte(false)
        setBusy(false)
      }
    },
    [t]
  )

  return { monte, busy, message, exporter }
}
