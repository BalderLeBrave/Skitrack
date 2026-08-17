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
    <div className="page">
      {/* Même gabarit que les Réglages : un aperçu, des actions en cartes, et
          l'avertissement d'effacement juste au-dessus des deux actions qui
          effacent. */}
      <div className="page__inner settings" style={{ maxWidth: 760 }}>
        <header className="page-head" style={{ marginBottom: 4 }}>
          <h2>{t('referential_title')}</h2>
        </header>
        <p className="lede">
          Le référentiel est un fichier JSON qui porte les domaines, leurs altitudes et les tarifs de forfaits. Vous
          pouvez le remplacer par le vôtre, l’exporter pour le corriger à la main, ou revenir à celui livré.
        </p>

        <section className="panel panel--flat settings__section">
          <h2>{t('referential_state')}</h2>
          <div className="setrow">
            <span className="setrow__label">
              {ref.domaines.length} domaine(s), {Object.keys(ref.forfaits).length} grille(s) de forfaits
              <span className="settings__help" style={{ display: 'block', margin: '2px 0 0' }}>
                {refOrigin || '—'}
                {source ? ` · ${source.nom}, relevé le ${fmtDate(source.maj)}` : ''}
              </span>
            </span>
          </div>
        </section>

        {/* L'avertissement précède les actions destructives et n'est pas
            repliable : importer ou revenir au référentiel livré efface les
            itinéraires calculés, la décision en cours et les suivis. Un encart
            orange doux, pas rouge — c'est une conséquence à connaître, pas une
            erreur. */}
        <p className="dangerbox">{t('referential_wipe_warning')}</p>

        <section className="panel panel--flat settings__section">
          <h2>{t('referential_actions')}</h2>

          <div className="setrow">
            <span className="setrow__label">{t('referential_replace')}</span>
            <span className="setrow__ctl">
              <label className="btn btn--primary">
                Importer un fichier
                <input type="file" accept="application/json,.json" onChange={onFile} style={{ display: 'none' }} />
              </label>
            </span>
          </div>

          <div className="setrow">
            <span className="setrow__label">{t('referential_export_edit')}</span>
            <span className="setrow__ctl">
              <button type="button" className="btn" onClick={() => exportReferential(ref)}>
                Exporter
              </button>
            </span>
          </div>

          <div className="setrow">
            <span className="setrow__label">{t('referential_revert')}</span>
            <span className="setrow__ctl">
              <button type="button" className="btn" onClick={reset}>
                {t('referential_revert')}
              </button>
            </span>
          </div>
        </section>

        {refError && <p className="notice notice--warn">{refError}</p>}

        <section className="panel panel--flat settings__section">
          <h2>Format attendu</h2>
          <p className="settings__help" style={{ margin: 0 }}>
            {t('ref_format_intro')} <code>domaines</code>
            {t('ref_format_domains')} <code>forfaits</code>
            {t('ref_format_passes')} <code>logo</code> {t('ref_format_logo')}
          </p>
        </section>

        <p className="u-muted" style={{ fontSize: 12, margin: 0 }}>
          {t('osm_odbl')}
        </p>
      </div>
    </div>
  )
}
