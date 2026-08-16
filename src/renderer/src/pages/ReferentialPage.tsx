import type { ChangeEvent } from 'react'
import {
  BUNDLED_REFERENTIAL,
  clearStoredReferential,
  exportReferential,
  readReferentialFile
} from '@/data/referentiel'
import { clearRoutes } from '@/domain/travel'
import { useFormat } from '@/hooks/useFormat'
import { useApp } from '@/state/appState'
import { useI18n } from '@/i18n'

/**
 * Gestion du référentiel.
 *
 * Le référentiel est la seule donnée dont tout le reste dépend : altitudes,
 * forfaits, saisonnalité. On peut le remplacer par le sien, l'exporter pour le
 * corriger à la main, ou revenir à celui livré. Remplacer le référentiel efface
 * les itinéraires calculés et la décision en cours — ils étaient établis pour
 * des domaines qui n'existent peut-être plus.
 */
export function ReferentialPage(): JSX.Element {
  const { t } = useI18n()
  const { fmtDate } = useFormat()
  const { ref, refOrigin, refError, setReferential, setRefError, patch } = useApp()

  const onFile = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    void readReferentialFile(file)
      .then((next) => {
        clearRoutes()
        setReferential(next, `fichier importé — ${file.name}`)
        patch({
          tab: 'recherche',
          selectedId: null,
          pinnedId: null,
          lodgingDomainId: null,
          cmpRefId: null,
          decision: null,
          comboSel: null,
          routes: {},
          esfRates: {},
          votes: {},
          tracked: [],
          compareIds: [],
          ficheId: null,
          domFicheId: null,
          routeMsg: 'Itinéraires effacés : ils étaient calculés pour l’ancien référentiel.'
        })
      })
      .catch((err: unknown) => {
        setRefError(`Import impossible : ${err instanceof Error ? err.message : String(err)}`)
      })
  }

  const reset = (): void => {
    clearStoredReferential()
    clearRoutes()
    setReferential(BUNDLED_REFERENTIAL, 'référentiel livré')
    patch({
      routes: {},
      esfRates: {},
      votes: {},
      tracked: [],
      compareIds: [],
      selectedId: null,
      pinnedId: null,
      lodgingDomainId: null,
      cmpRefId: null,
      decision: null,
      comboSel: null,
      ficheId: null,
      domFicheId: null,
      routeMsg: ''
    })
  }

  const source = ref.sources?.domaines

  return (
    <div className="page" style={{ display: 'grid', placeItems: 'center', padding: 32 }}>
      <div className="boot__panel" style={{ maxWidth: 620, gap: 14 }}>
        <h2 style={{ margin: 0 }}>{t('referential_title')}</h2>
        <p style={{ margin: 0 }}>
          Le référentiel est un fichier JSON qui porte les domaines, leurs altitudes et les tarifs de forfaits. Vous
          pouvez le remplacer par le vôtre, l’exporter pour le corriger à la main, ou revenir à celui livré.
        </p>

        <div className="refbar">
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
              {ref.domaines.length} domaine(s), {Object.keys(ref.forfaits).length} grille(s) de forfaits
            </p>
            <p className="u-muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
              {refOrigin || '—'}
              {source ? ` · ${source.nom}, relevé le ${fmtDate(source.maj)}` : ''}
            </p>
          </div>
          <label className="btn btn--primary" style={{ flex: '0 0 auto' }}>
            Importer un fichier
            <input type="file" accept="application/json,.json" onChange={onFile} style={{ display: 'none' }} />
          </label>
          <button type="button" className="btn" onClick={() => exportReferential(ref)}>
            Exporter
          </button>
          <button type="button" className="linkbtn" onClick={reset}>
            {t('referential_revert')}
          </button>
        </div>

        {refError && <p className="notice notice--warn">{refError}</p>}

        <details style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
          <summary style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Format attendu</summary>
          <p className="u-muted" style={{ margin: '8px 0 0', fontSize: 12 }}>
            {t('ref_format_intro')} <code>domaines</code>
            {t('ref_format_domains')} <code>forfaits</code>
            {t('ref_format_passes')} <code>logo</code> {t('ref_format_logo')}
          </p>
        </details>

        <p className="u-muted" style={{ fontSize: 12, margin: 0 }}>
          {t('osm_odbl')}
        </p>
      </div>
    </div>
  )
}
