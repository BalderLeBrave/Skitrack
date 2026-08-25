import { useState } from 'react'
import { ResultCard } from '@/components/ResultCard'
import { srcOf } from '@/data/lodgings'
import { lessonsCount } from '@/domain/costs'
import { useFormat } from '@/hooks/useFormat'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'
import { useUserData } from '@/state/userData'
import { useTripShare } from '@/state/tripShare'
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
  const { saveTrip } = useUserData()
  const { shareTrip } = useTripShare()
  // Accusé de réception éphémère : le bouton confirme puis reprend son
  // libellé. Un état persistant laisserait « enregistré » sur un séjour qu'on
  // vient de modifier sans réenregistrer.
  const [justSaved, setJustSaved] = useState(false)
  const [shareMsg, setShareMsg] = useState<string | null>(null)
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
      sub: t('decision_lodging_sub')
        .replace('{l}', ctx.lg.name)
        .replace('{n}', String(ctx.nights))
    },
    {
      label: 'Forfaits',
      val: eur(k.forfaits),
      sub: `${k.adults} adulte(s) et ${k.kids} enfant(s), tarif du domaine`
    },
    {
      label: t('decision_rental_label'),
      val: eur(k.rental),
      sub: k.rental ? '96 € par adulte, 58 € par enfant' : t('decision_option_off')
    },
    {
      label: 'Cours',
      val: eur(k.lessons),
      sub: k.lessons
        ? t('decision_lessons_sub').replace('{n}', String(lessonsCount(state.people)))
        : t('decision_option_off')
    },
    {
      label: 'Route',
      val: eur(k.route),
      sub: t('decision_route_sub')
        .replace('{n}', String(k.cars))
        .replace('{f}', eur(k.fuel))
        .replace('{t}', eur(k.tolls))
    }
  ]

  return (
    <div className="page" style={{ padding: 0 }}>
      {/* Colonne unique de 560 px : le dernier écran avant de réserver n'a plus
          rien à comparer, il a une seule chose à faire lire de haut en bas. */}
      <div className="page__inner decision" style={{ maxWidth: 560, padding: '26px 28px 40px' }}>
        <header className="page-head" style={{ marginBottom: 4 }}>
          <h2>{ctx.d.name}</h2>
          <strong className="u-num" style={{ fontSize: 20, color: 'var(--text)' }}>
            {eur(k.total)}
          </strong>
        </header>
        <p className="u-muted" style={{ margin: '0 0 14px', fontSize: 13 }}>
          {eur(split.perHead)} par personne ·{' '}
          {votes > 0
            ? `Vote du groupe : +${votes}`
            : votes < 0
              ? `Vote du groupe : ${votes}`
              : 'Vote du groupe : aucun avis'}
        </p>

        {/* « Enregistrer ce séjour » capture ce qui est à l'écran : la station,
            les dates de la semaine retenue, le groupe et le plafond de budget
            s'il en existe un. Rien n'est demandé de plus — un formulaire ici
            transformerait un geste de mise de côté en saisie. */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '0 0 14px' }}>
          <button
            type="button"
            className="btn btn--small"
            onClick={() => {
              void saveTrip({
                label: `${ctx.d.name} · ${ctx.w.label}`,
                stationId: ctx.d.id,
                dates: { from: state.arrDate, to: state.depDate },
                party: {
                  adults: Math.max(1, state.travelers - state.children),
                  children: state.children
                },
                budget:
                  state.budgetMax != null && state.budgetMax > 0
                    ? { max: state.budgetMax, mode: state.budgetMode }
                    : null
              })
              setJustSaved(true)
              window.setTimeout(() => setJustSaved(false), 2400)
            }}
          >
            {justSaved ? `✓ ${t('trip_saved')}` : t('trip_save')}
          </button>
          {/* Partager suppose un séjour enregistré : c'est lui qui porte
              l'identité et les paramètres. Le bouton enregistre donc d'abord
              si besoin, puis partage — plutôt que d'exiger deux clics dans le
              bon ordre. */}
          <button
            type="button"
            className="btn btn--small"
            onClick={() => {
              const input = {
                label: `${ctx.d.name} · ${ctx.w.label}`,
                stationId: ctx.d.id,
                dates: { from: state.arrDate, to: state.depDate },
                party: {
                  adults: Math.max(1, state.travelers - state.children),
                  children: state.children
                },
                budget:
                  state.budgetMax != null && state.budgetMax > 0
                    ? { max: state.budgetMax, mode: state.budgetMode }
                    : null
              }
              void saveTrip(input).then((saved) => {
                // Le séjour partagé doit porter l'identité de celui qui vient
                // d'être écrit : un identifiant fabriqué ici se réimporterait
                // en doublon chez le destinataire.
                if (!saved) {
                  setShareMsg(t('trip_share_failed'))
                  window.setTimeout(() => setShareMsg(null), 2400)
                  return
                }
                void shareTrip(saved).then((outcome) => {
                  if (outcome.kind === 'canceled') return
                  setShareMsg(
                    outcome.kind === 'copied'
                      ? t('trip_share_copied')
                      : outcome.kind === 'exported'
                        ? t('trip_share_exported')
                        : t('trip_share_failed')
                  )
                  window.setTimeout(() => setShareMsg(null), 2400)
                })
              })
            }}
          >
            {t('trip_share')}
          </button>
          {shareMsg && (
            <span className="u-muted" style={{ fontSize: 12 }}>
              {shareMsg}
            </span>
          )}
          <button type="button" className="linkbtn" onClick={() => patch({ tab: 'favoris' })}>
            {t('fav_title')}
          </button>
        </div>

        {/* Le logement retenu en tête, au gabarit des écrans de résultats : on
            doit reconnaître la carte cliquée deux écrans plus tôt. */}
        <div style={{ marginBottom: 18 }}>
          <ResultCard
            title={ctx.lg.name}
            place={`${ctx.d.name} · ${ctx.d.massif}`}
            factLeft={`${ctx.w.label} · ${ctx.nights} nuits`}
            factRight={srcOf(ctx.lg)}
            price={{ amount: eur(k.total), unit: t('offers_price_unit').replace('{n}', String(ctx.nights)) }}
            image={ctx.lg.image ?? null}
            ariaLabel={t('offers_card_label')
              .replace('{l}', ctx.lg.name)
              .replace('{d}', ctx.d.name)
              .replace('{p}', eur(k.total))}
          />
        </div>

        <section className="panel decision__card">
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

        <section className="panel decision__card">
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
                <div key={r.home} className="homerow">
                  <div className="homerow__head">
                    {/* Initiales sur pastille : sur trois foyers de deux
                        personnes, la liste des prénoms se lit deux fois plus
                        vite en pastilles qu'en phrase. */}
                    <span className="homerow__avatars" aria-hidden>
                      {r.people.map((p) => (
                        <span key={p.id} className="avatar" title={p.first}>
                          {p.first.slice(0, 1).toUpperCase()}
                        </span>
                      ))}
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 600, flex: '1 1 auto', minWidth: 0 }}>{r.home}</span>
                    <strong className="u-num u-nowrap" style={{ fontSize: 17, color: 'var(--text)' }}>
                      {eur(r.total)}
                    </strong>
                  </div>
                  <p className="u-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                    {r.people.map((p) => p.first).join(', ')} — {r.people.length} personne(s) ·{' '}
                    {eur(Math.round(r.total / Math.max(1, r.people.length)))} par personne
                  </p>
                  <p className="u-muted" style={{ margin: '2px 0 0', fontSize: 11 }}>
                    logement {eur(r.lodging)} · forfaits {eur(r.forfaits)}
                    {r.rental ? ` · ${t('decision_share_rental').replace('{p}', eur(r.rental))}` : ''}
                    {r.lessons ? ` · cours ${eur(r.lessons)}` : ''} · route {eur(r.route)} ({dur(r.dur)},{' '}
                    {fmt(r.dist)} km)
                  </p>
                  {/* L'écart au partage égal est le point de friction réel d'un
                      séjour à plusieurs foyers : il a son propre encart. */}
                  <p className={`decision__delta${delta === 0 ? ' decision__delta--even' : ''}`}>
                    {delta === 0
                      ? t('decision_share_even')
                      : delta > 0
                        ? t('decision_share_above').replace('{d}', fmt(delta))
                        : t('decision_share_below').replace('{d}', fmt(delta))}
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
