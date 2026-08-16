import { srcOf } from '@/data/lodgings'
import { lessonsCount } from '@/domain/costs'
import { useFormat } from '@/hooks/useFormat'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'
import { useI18n } from '@/i18n'

/**
 * La décision retenue.
 *
 * Le dernier écran avant de réserver répond à la seule question qui reste :
 * qui paie quoi. Le logement se partage au nombre de personnes, les forfaits,
 * le matériel et les cours suivent chaque voyageur, et la route reste à la
 * charge du foyer qui la fait. L'écart avec un partage strictement égal est
 * affiché explicitement — c'est le point de friction réel d'un séjour à
 * plusieurs foyers.
 */
export function DecisionPage(): JSX.Element {
  const { t } = useI18n()
  const { dur, eur, fmt } = useFormat()
  const { state, patch } = useApp()
  const derived = useDerived()
  const ctx = derived.decisionCtx
  const split = derived.split

  if (!ctx || !split) {
    return (
      <div className="page" style={{ padding: 0 }}>
        <div className="page__inner" style={{ maxWidth: 900, padding: '26px 28px 40px' }}>
          <div className="panel panel--empty">
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{t('decision_none')}</p>
            <p className="u-muted" style={{ margin: 0, fontSize: 14, maxWidth: '50ch' }}>
              {t('decision_empty_hint')}
            </p>
            <button type="button" className="btn btn--primary" onClick={() => patch({ tab: 'combinaisons' })}>
              Ouvrir les combinaisons
            </button>
          </div>
        </div>
      </div>
    )
  }

  const k = ctx.cost
  const voteKey = derived.comboKey(ctx.d.id, ctx.w.arr)
  const votes = derived.voteScore(voteKey)

  const postes = [
    {
      label: 'Logement',
      val: eur(k.lodging),
      sub: `${ctx.lg.name} · ${ctx.nights} nuits · réparti au nombre de personnes`
    },
    {
      label: 'Forfaits',
      val: eur(k.forfaits),
      sub: `${k.adults} adulte(s) et ${k.kids} enfant(s), tarif du domaine`
    },
    {
      label: 'Location de matériel',
      val: eur(k.rental),
      sub: k.rental ? '96 € par adulte, 58 € par enfant' : 'option désactivée'
    },
    {
      label: 'Cours',
      val: eur(k.lessons),
      sub: k.lessons ? `${lessonsCount(state.people)} inscrit(s), formule par voyageur` : 'option désactivée'
    },
    {
      label: 'Route',
      val: eur(k.route),
      sub: `${k.cars} foyer(s) · carburant ${eur(k.fuel)} · péages ${eur(k.tolls)}`
    }
  ]

  return (
    <div className="page" style={{ padding: 0 }}>
      <div className="page__inner" style={{ maxWidth: 900, padding: '26px 28px 40px' }}>
        <header className="page-head" style={{ marginBottom: 4 }}>
          <h2>{ctx.d.name}</h2>
          <strong className="u-num" style={{ fontSize: 20, color: 'var(--accent)' }}>
            {eur(k.total)}
          </strong>
        </header>
        <p className="u-muted" style={{ margin: '0 0 4px', fontSize: 13 }}>
          {ctx.w.label} · {ctx.nights} nuits · {ctx.lg.name} ({srcOf(ctx.lg)})
        </p>
        <p className="u-muted" style={{ margin: '0 0 18px', fontSize: 13 }}>
          {eur(split.perHead)} par personne ·{' '}
          {votes > 0
            ? `Vote du groupe : +${votes}`
            : votes < 0
              ? `Vote du groupe : ${votes}`
              : 'Vote du groupe : aucun avis'}
        </p>

        <section className="panel" style={{ padding: '18px 20px', marginBottom: 16 }}>
          <h3 className="section__title">{t('decision_cost_by_item')}</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {postes.map((p) => (
              <div key={p.label} className="posteline">
                <span style={{ fontSize: 14, flex: 1, minWidth: 0 }}>
                  {p.label}
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>{p.sub}</span>
                </span>
                <strong className="u-num u-nowrap">{p.val}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="panel" style={{ padding: '18px 20px' }}>
          <h3 className="section__title" style={{ marginBottom: 4 }}>
            Qui paie quoi
          </h3>
          <p className="u-muted" style={{ margin: '0 0 12px', fontSize: 12, maxWidth: '70ch' }}>
            Le logement est réparti au nombre de personnes. Forfaits, matériel et cours suivent chaque voyageur. La
            route reste à la charge du foyer qui la fait. Un partage strictement égal entre foyers donnerait{' '}
            {eur(split.even)} chacun.
          </p>

          <div style={{ display: 'grid', gap: 10 }}>
            {split.rows.map((r) => {
              const delta = r.total - split.even
              return (
                <div key={r.home} style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 10 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 15, fontWeight: 600, flex: '1 1 auto', minWidth: 0 }}>{r.home}</span>
                    <strong className="u-num u-nowrap" style={{ fontSize: 17, color: 'var(--accent)' }}>
                      {eur(r.total)}
                    </strong>
                  </div>
                  <p className="u-muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
                    {r.people.map((p) => p.first).join(', ')} — {r.people.length} personne(s) ·{' '}
                    {eur(Math.round(r.total / Math.max(1, r.people.length)))} par personne
                  </p>
                  <p className="u-muted" style={{ margin: '2px 0 0', fontSize: 11 }}>
                    logement {eur(r.lodging)} · forfaits {eur(r.forfaits)}
                    {r.rental ? ` · matériel ${eur(r.rental)}` : ''}
                    {r.lessons ? ` · cours ${eur(r.lessons)}` : ''} · route {eur(r.route)} ({dur(r.dur)},{' '}
                    {fmt(r.dist)} km)
                  </p>
                  <p
                    style={{
                      margin: '3px 0 0',
                      fontSize: 11,
                      fontWeight: 600,
                      color: delta > 0 ? 'var(--warn)' : delta < 0 ? 'var(--ok)' : 'var(--muted)'
                    }}
                  >
                    {delta === 0
                      ? 'à parts égales'
                      : delta > 0
                        ? `+${fmt(delta)} € au-dessus d’un partage égal`
                        : `${fmt(delta)} € sous un partage égal`}
                  </p>
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 16, alignItems: 'center' }}>
            <button
              type="button"
              className="btn"
              onClick={() =>
                patch({ arrDate: ctx.w.arr, depDate: ctx.w.dep, lodgingDomainId: ctx.d.id, tab: 'logements' })
              }
            >
              Changer de logement
            </button>
            <button type="button" className="linkbtn" onClick={() => window.print()}>
              Imprimer
            </button>
            <span className="u-spacer" />
            <button type="button" className="linkbtn linkbtn--muted" onClick={() => patch({ decision: null })}>
              {t('decision_cancel')}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
