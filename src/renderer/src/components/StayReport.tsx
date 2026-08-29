/**
 * Récapitulatif imprimable du séjour retenu.
 *
 * ## Ce qu'il fait, et ce qu'il ne fait pas
 *
 * Il met en page ce que l'application sait déjà. Il ne relève rien, il ne
 * calcule rien de neuf, et surtout il **n'invente rien** : chaque valeur y
 * porte son origine — relevée, saisie, estimée — exactement comme à l'écran.
 * Une valeur absente reste absente, et la dernière section les énumère plutôt
 * que de les passer sous silence. C'est la section la plus utile du document :
 * un récapitulatif qui tait ses trous laisse croire qu'il n'en a pas.
 *
 * ## Le seul réseau
 *
 * Les tuiles du fond de carte, et elles seules. Aucun relevé de prix, aucun
 * appel de connecteur : le document se compose sur ce qui est en mémoire.
 *
 * ## Les plans de pistes officiels
 *
 * Aucun n'est intégré. Ce sont des œuvres graphiques protégées, et le catalogue
 * en porte pourtant l'URL pour chaque station (`franceMontagnesStations.map`).
 * La carte est dessinée par l'application — voir `StayReportMap`.
 */

import { forfaitIncertain } from '@/domain/forfait'
import { passOriginText } from '@/domain/forfaitLabel'
import { accessTimeOf } from '@/data/accessTime'
import { BRA_LABELS, braLevelOf, braKeyOf } from '@/data/bra'
import { srcOf } from '@/data/lodgings'
import { creditPhoto, legendePhoto, slugStation } from '@/data/stationPhotos'
import { photoOverrideValide } from '@/data/photoOverrides'
import { routeOriginOf } from '@/domain/costs'
import { fmtStay } from '@/domain/format'
import { useFormat } from '@/hooks/useFormat'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'
import { useDerived } from '@/state/selectors'
import { useWeather } from '@/state/weather'
import { StayReportMap } from './StayReportMap'

/**
 * D'où vient un montant du récapitulatif.
 *
 * `néant` est le quatrième cas, et il manquait : un poste à zéro **par
 * décision** — matériel décoché, cours décochés, aucun foyer sur la route —
 * n'est pas une estimation. Le tagger « estimé » puis l'inscrire dans « Ce qui
 * manque » revenait à reprocher à l'application de ne pas avoir relevé un
 * chiffre que personne ne lui a demandé.
 */
type Origine = 'relevé' | 'saisi' | 'estimé' | 'néant'

interface Poste {
  label: string
  montant: number
  origine: Origine
  detail?: string
}

export function StayReport(): JSX.Element | null {
  const { t, lang } = useI18n()
  const { eur, fmt } = useFormat()
  const { state } = useApp()
  const derived = useDerived()
  const { weatherOf, lastSuccessAt } = useWeather()

  const ctx = derived.decisionCtx
  if (!ctx) return null

  const { d, lg, nights } = ctx
  const k = ctx.cost
  const pass = derived.passOf(d)
  const esf = derived.esfOf(d)
  const routeOrigin = routeOriginOf(state.routeBudget, state.avoidTolls)
  const trip = derived.sejourInputs(d).trip
  const weather = weatherOf(d.id)
  const bra = braLevelOf(d, state.braManual)
  const braAt = state.braManual[braKeyOf(d)]?.at ?? null

  const acces = lg.accessComputed ? accessTimeOf(lg.dist, lg.accessType) : null

  const override = state.photoOverrides[slugStation(d.name)]
  const credit = photoOverrideValide(override) && !override?.rejetee ? null : creditPhoto(d.name)

  /**
   * Origine du poste « Cours », croisée avec les formules réellement suivies.
   *
   * Un groupe qui ne prend que du collectif ne dépend pas du tarif particulier,
   * et réciproquement. Le poste n'est « saisi » que si **toutes** les formules
   * présentes dans le groupe ont un tarif relevé.
   */
  const formules = new Set(state.people.map((p) => p.lesson).filter(Boolean))
  const origineCours: Origine =
    [...formules].every((f) => (f === 'priv' ? esf.privSource === 'saisi' : esf.source === 'saisi')) &&
    formules.size > 0
      ? 'saisi'
      : 'estimé'

  /** Les postes, dans l'ordre de `domain/costs.ts`, chacun avec son origine. */
  const postes: Poste[] = [
    { label: t('report_item_lodging'), montant: k.lodging, origine: 'relevé', detail: lg.name },
    {
      label: t('report_item_passes'),
      montant: k.forfaits,
      origine: pass == null ? 'estimé' : pass.origine === 'saisi' ? 'saisi' : forfaitIncertain(pass.origine) ? 'estimé' : 'relevé',
      detail: pass ? passOriginText(pass, t) : t('pass_none')
    },
    {
      label: t('report_item_lessons'),
      montant: k.lessons,
      // `EsfRate` porte **deux** origines : le collectif et le particulier se
      // relèvent séparément. Ne lire que `source` faisait taguer « saisi » un
      // cours particulier tiré du barème 66/62/58 €/h dès que le tarif
      // collectif avait été relevé — et disparaître la mention correspondante
      // de « Ce qui manque ».
      origine: state.optLessons ? origineCours : 'néant',
      detail: state.optLessons ? (esf.ecole ?? undefined) : t('report_option_off')
    },
    {
      label: t('report_item_rental'),
      montant: k.rental,
      origine: state.optRental ? 'estimé' : 'néant',
      detail: state.optRental ? undefined : t('report_option_off')
    },
    // Un forfait de route saisi n'a pas de décomposition : l'éclater en
    // « carburant » et « péages » inventerait une répartition que personne n'a
    // donnée. Une seule ligne, nommée pour ce qu'elle est.
    // Aucun foyer sur la route : il n'y a pas de trajet à chiffrer, et zéro est
    // alors exact. Un barème kilométrique appliqué à zéro kilomètre n'est pas
    // une estimation, c'est une absence.
    ...(k.cars === 0
      ? [{ label: t('report_item_route'), montant: 0, origine: 'néant' as Origine, detail: t('report_no_car') }]
      : trip.flat
        ? [{ label: t('report_item_route_flat'), montant: k.route, origine: 'saisi' as Origine }]
        : [
            {
              label: t('report_item_fuel'),
              montant: k.fuel,
              origine: (routeOrigin.fuel === 'saisi' ? 'saisi' : 'estimé') as Origine
            },
            {
              label: t('report_item_tolls'),
              montant: k.tolls,
              origine: (routeOrigin.tolls === 'saisi' ? 'saisi' : 'estimé') as Origine
            }
          ])
  ]

  const chiffre = postes
    .filter((p) => p.origine === 'relevé' || p.origine === 'saisi')
    .reduce((n, p) => n + p.montant, 0)
  const estime = postes.filter((p) => p.origine === 'estimé').reduce((n, p) => n + p.montant, 0)

  /**
   * Ce qui manque.
   *
   * Construit à partir des mêmes conditions que les écrans, pas d'une liste
   * tenue à la main : une liste à la main se désynchronise et finit par
   * affirmer qu'il ne manque rien.
   */
  const manques: string[] = []
  if (pass == null) manques.push(t('report_missing_pass'))
  else if (forfaitIncertain(pass.origine)) manques.push(t('report_missing_pass_interp'))
  if (state.optLessons && origineCours !== 'saisi' && k.lessons > 0) manques.push(t('report_missing_lessons'))
  if (k.cars > 0 && !trip.flat && routeOrigin.fuel !== 'saisi') manques.push(t('report_missing_fuel'))
  if (k.cars > 0 && !trip.flat && routeOrigin.tolls !== 'saisi') manques.push(t('report_missing_tolls'))
  if (state.optRental && k.rental > 0) manques.push(t('report_missing_rental'))
  if (weather == null) manques.push(t('report_missing_snow'))
  else if (weather.snowBas == null && weather.snowHaut == null) manques.push(t('report_missing_snow'))
  if (bra == null) manques.push(t('report_missing_bra'))
  if (lg.lat == null || lg.lon == null) manques.push(t('report_missing_position'))
  if (!lg.accessComputed) manques.push(t('report_missing_access'))
  if (!lg.url) manques.push(t('report_missing_link'))

  const tag = (o: Origine): JSX.Element => (
    <span
      className="report__tag"
      style={{
        fontSize: 9.5,
        fontWeight: 700,
        color:
          o === 'estimé'
            ? 'var(--warn)'
            : o === 'saisi'
              ? 'var(--brand)'
              : o === 'néant'
                ? 'var(--muted)'
                : 'var(--ok)'
      }}
    >
      {t(
        o === 'estimé'
          ? 'prov_estimated'
          : o === 'saisi'
            ? 'prov_manual'
            : o === 'néant'
              ? 'report_origin_none'
              : 'prov_measured'
      )}
    </span>
  )

  return (
    <article className="report" id="stay-report">
      <header className="report__head">
        <h1 style={{ margin: 0, fontSize: 22 }}>{d.name}</h1>
        <p className="u-muted" style={{ margin: '2px 0 0', fontSize: 12.5 }}>
          {d.pass ? `${d.pass} · ` : ''}
          {d.massif} · {fmtStay(state.arrDate, state.depDate, lang)} · {nights} {t('dp_nights_word')}
        </p>
        <p className="u-muted" style={{ margin: '2px 0 0', fontSize: 12.5 }}>
          {t('report_group')
            .replace('{a}', String(k.adults))
            .replace('{k}', String(k.kids))
            .replace('{c}', String(k.cars))}
        </p>
        <p className="u-muted" style={{ margin: '2px 0 0', fontSize: 11 }}>
          {t('report_edited_on').replace('{d}', new Date().toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB'))}
        </p>
      </header>

      <section className="report__section">
        <h2>{t('report_map_title')}</h2>
        <StayReportMap
          domainId={d.engineId ?? d.id}
          domainName={d.name}
          lat={lg.lat ?? null}
          lon={lg.lon ?? null}
          centreLat={d.lat}
          centreLon={d.lon}
        />
        <p style={{ margin: '6px 0 0', fontSize: 12 }}>
          {acces
            ? t('report_access')
                .replace('{n}', fmt(lg.dist))
                .replace('{m}', t(`access_mode_${acces.mode}` as 'access_mode_a_pied'))
                .replace('{t}', acces.minutes != null ? `${acces.minutes} min` : '—')
            : t('report_access_unknown')}
        </p>
      </section>

      <section className="report__section">
        <h2>{t('report_domain_title')}</h2>
        <dl className="report__grid">
          <div>
            <dt>{t('filter_km_range')}</dt>
            <dd className="u-num">{fmt(d.km)} km</dd>
          </div>
          <div>
            <dt>{t('altitude_span')}</dt>
            <dd className="u-num">
              {fmt(d.min)} – {fmt(d.max)} m
            </dd>
          </div>
          <div>
            <dt>{t('lifts_plural')}</dt>
            <dd className="u-num">{fmt(d.lifts)}</dd>
          </div>
          <div>
            <dt>{t('report_snow')}</dt>
            <dd className="u-num">
              {weather?.snowBas != null || weather?.snowHaut != null
                ? `${weather.snowBas ?? '—'} / ${weather.snowHaut ?? '—'} cm`
                : '—'}
              {lastSuccessAt != null && (weather?.snowBas != null || weather?.snowHaut != null) && (
                <span className="u-muted" style={{ fontSize: 10.5 }}>
                  {' '}
                  {new Date(lastSuccessAt).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB')}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt>{t('report_bra')}</dt>
            <dd>
              {bra != null ? `${bra}/5 — ${BRA_LABELS[bra]}` : '—'}
              {braAt != null && bra != null && (
                <span className="u-muted" style={{ fontSize: 10.5 }}>
                  {' '}
                  {new Date(braAt).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB')}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt>{pass ? t('pass_days_label').replace('{n}', String(pass.jours)) : t('pass_none')}</dt>
            <dd
              className="u-num"
              style={pass && forfaitIncertain(pass.origine) ? { fontStyle: 'italic' } : undefined}
            >
              {pass ? `${eur(pass.adulte)} · ${eur(pass.enfant)} ${t('child_lower')}` : '—'}
            </dd>
          </div>
        </dl>
        {pass && (
          <p className="u-muted" style={{ margin: '4px 0 0', fontSize: 11 }}>
            {passOriginText(pass, t)}
          </p>
        )}
      </section>

      <section className="report__section">
        <h2>{t('report_cost_title')}</h2>
        <table className="report__table">
          <tbody>
            {postes.map((p) => (
              <tr key={p.label}>
                <th scope="row">
                  {p.label}
                  {p.detail && (
                    <span className="u-muted" style={{ display: 'block', fontSize: 10.5, fontWeight: 400 }}>
                      {p.detail}
                    </span>
                  )}
                </th>
                <td>{tag(p.origine)}</td>
                <td className="u-num" style={p.origine === 'estimé' ? { fontStyle: 'italic' } : undefined}>
                  {eur(p.montant)}
                </td>
              </tr>
            ))}
            <tr className="report__total">
              <th scope="row">{t('report_total')}</th>
              <td />
              <td className="u-num">{eur(k.total)}</td>
            </tr>
          </tbody>
        </table>
        <p style={{ margin: '6px 0 0', fontSize: 11.5 }}>
          {t('report_split')
            .replace('{c}', eur(chiffre))
            .replace('{e}', eur(estime))}
        </p>
      </section>

      <section className="report__section">
        <h2>{t('report_lodging_title')}</h2>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{lg.name}</p>
        <p className="u-muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
          {srcOf(lg)}
          {lg.pers ? ` · ${lg.pers} ${t('report_people')}` : ''}
          {lg.ch ? ` · ${lg.ch} ch` : lg.rooms ? ` · ${lg.rooms} p.` : ''}
          {lg.m2 ? ` · ${lg.m2} m²` : ''}
          {` · ${eur(lg.total)}`}
        </p>
        {lg.url && (
          <p className="u-muted" style={{ margin: '2px 0 0', fontSize: 10.5, wordBreak: 'break-all' }}>
            {lg.url}
          </p>
        )}
        {/* La photo de l'annonce, quand elle en publie une, avec son crédit.
            Une légende de crédit sans image en face créditait une photo que le
            document n'affichait pas. */}
        {lg.image && (
          <figure style={{ margin: '8px 0 0' }}>
            <img
              src={lg.image}
              alt={lg.name}
              style={{ maxWidth: 260, width: '100%', height: 'auto', border: '1px solid var(--border)' }}
            />
            <figcaption style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 3 }}>
              {lg.name} — {srcOf(lg)}
            </figcaption>
          </figure>
        )}
        {!lg.image && credit && (
          <figure style={{ margin: '8px 0 0' }}>
            <figcaption style={{ fontSize: 10.5, color: 'var(--muted)' }}>
              {t('report_station_photo')} : {legendePhoto(credit)} · {credit.licence}
              {credit.auteur ? ` · ${credit.auteur}` : ''}
            </figcaption>
          </figure>
        )}
      </section>

      {/* La section la plus utile : ce que le document ne sait pas. */}
      <section className="report__section report__missing">
        <h2>{t('report_missing_title')}</h2>
        {manques.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12 }}>{t('report_missing_none')}</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {manques.map((m, i) => (
              <li key={i} style={{ fontSize: 12 }}>
                {m}
              </li>
            ))}
          </ul>
        )}
        {/* La taxe de séjour n'est pas un poste du calcul : l'application ne la
            relève ni ne l'estime nulle part. Ce n'est donc pas une valeur
            manquante à combler, c'est une limite permanente du document — et
            elle vaut d'être dite à part, sinon la liste au-dessus ne serait
            jamais vide et son cas « rien ne manque » ne se produirait jamais. */}
        <p className="u-muted" style={{ margin: '6px 0 0', fontSize: 11.5 }}>
          {t('report_missing_stay_tax')}
        </p>
      </section>
    </article>
  )
}
