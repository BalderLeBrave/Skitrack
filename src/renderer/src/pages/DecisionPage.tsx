import { ResultCard } from '@/components/ResultCard'
import { srcOf } from '@/data/lodgings'
import { lessonsCount } from '@/domain/costs'
import { useFormat } from '@/hooks/useFormat'
import { fmtStay } from '@/domain/format'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'
import { useState } from 'react'
import { useI18n } from '@/i18n'
import { StayReport } from '@/components/StayReport'

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
  const { t, lang } = useI18n()
  const { dur, eur, fmt } = useFormat()
  const { state, patch } = useApp()
  const derived = useDerived()
  const [pdfBusy, setPdfBusy] = useState(false)
  /** Le rapport n'existe dans le DOM que pendant l'export. */
  const [reportMonte, setReportMonte] = useState(false)
  const [pdfMsg, setPdfMsg] = useState<string | null>(null)
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

  /**
   * Attend que les images du rapport soient réellement décodées.
   *
   * `printToPDF` photographie la page à l'instant où on l'appelle : une tuile
   * encore en vol donnerait un carré blanc dans le PDF. `decode()` résout quand
   * l'image est prête ; une tuile en erreur est ignorée plutôt que de bloquer
   * l'export — le PDF sort avec un trou, ce qui est mieux qu'un export qui ne
   * sort jamais.
   */
  const attendreImages = async (): Promise<void> => {
    const rapport = document.getElementById('stay-report')
    if (!rapport) return
    const images = [...rapport.querySelectorAll('img')]
    await Promise.all(images.map((img) => img.decode().catch(() => undefined)))
  }

  const exportPdf = async (): Promise<void> => {
    setPdfBusy(true)
    setPdfMsg(null)
    setReportMonte(true)
    document.documentElement.setAttribute('data-print', 'rapport')
    try {
      // Un tour de boucle pour que React ait posé le rapport dans le DOM, puis
      // l'attente des tuiles.
      await new Promise((r) => setTimeout(r, 0))
      await attendreImages()
      const nom = `skitrack-${ctx.d.name}-${ctx.w.arr}`.replace(/[^\w.-]+/g, '-')
      const res = await window.skitrack.reportPdf({ suggestedName: nom })
      // Une annulation n'est pas un échec : elle ne dit rien à l'écran.
      if (res.cancelled) setPdfMsg(null)
      else if (res.ok && res.path) setPdfMsg(t('report_saved').replace('{p}', res.path))
      else setPdfMsg(t('report_failed').replace('{e}', res.error ?? '—'))
    } catch (err) {
      setPdfMsg(t('report_failed').replace('{e}', err instanceof Error ? err.message : String(err)))
    } finally {
      document.documentElement.removeAttribute('data-print')
      setReportMonte(false)
      setPdfBusy(false)
    }
  }
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
        {/* Le récapitulatif imprimable vit dans l'arbre en permanence mais n'est
            visible qu'à l'impression : `printToPDF` rend la page telle quelle,
            et un composant monté à la volée n'aurait pas fini de charger ses
            tuiles de fond au moment du rendu. */}
        {/* Le rapport n'est monté que le temps de l'export.
            Le laisser dans l'arbre en permanence le faisait charger neuf tuiles
            IGN et interroger le moteur local **à chaque ouverture de cet
            écran** — `display: none` n'empêche pas un navigateur de télécharger
            les images. L'export attend explicitement que les tuiles soient
            décodées avant d'appeler `printToPDF` ; c'est ce qu'`attendreImages`
            fait, et c'est plus sûr qu'un composant monté « au cas où ». */}
        {reportMonte && <StayReport />}

        <header className="page-head" style={{ marginBottom: 4 }}>
          <h2>{ctx.d.name}</h2>
          <strong className="u-num crn-calcul" style={{ fontSize: 20, color: 'var(--text)' }}>
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
          {/* Le prix du logement est celui du relevé, à ses propres dates.
              Il était jusqu'ici reprojeté sur la semaine retenue par l'écart de
              saisonnalité national, ce qui produisait un montant que personne
              n'avait jamais vu chez la centrale — et c'est le montant que cet
              écran présente comme le budget du séjour. La reprojection est
              partie ; l'écart de dates, lui, se dit. */}
          {ctx.lg.priceCheckIn && ctx.lg.priceCheckIn !== ctx.w.arr && (
            <p className="u-muted" style={{ margin: '6px 0 0', fontSize: 11.5 }}>
              {t('decision_price_other_dates').replace(
                '{p}',
                fmtStay(ctx.lg.priceCheckIn, ctx.lg.priceCheckOut ?? ctx.lg.priceCheckIn, lang)
              )}
            </p>
          )}
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
              {t('print_label')}
            </button>
            {/* L'export bascule la page en vue « rapport », demande le PDF au
                processus principal, puis remet l'écran comme il était — quoi
                qu'il arrive, y compris si l'utilisateur annule. */}
            <button
              type="button"
              className="linkbtn"
              disabled={pdfBusy}
              onClick={() => void exportPdf()}
            >
              {pdfBusy ? t('report_exporting') : t('report_export')}
            </button>
            <span className="u-spacer" />
            <button type="button" className="linkbtn linkbtn--muted" onClick={() => patch({ decision: null })}>
              {t('decision_cancel')}
            </button>
          </div>
          {pdfMsg && (
            <p className="u-muted" style={{ margin: '8px 0 0', fontSize: 11.5, wordBreak: 'break-all' }}>
              {pdfMsg}
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
