import { useRef, useState } from 'react'
import { CloseIcon } from './Icons'
import { resolveSidecarOrigin } from '@/domain/origins'
import { originsOf } from '@/domain/travel'
import type { EsfRate, Person } from '@/domain/costs'
import { HOUR_OPTS, RENTAL_ADULT, RENTAL_KID, isKid, lessonOf, lessonsCost, lessonsCount } from '@/domain/costs'
import { useFormat } from '@/hooks/useFormat'
import { useFocusTrap } from '@/hooks/useShortcuts'
import { useApp } from '@/state/appState'
import type { ResolvedForfait } from '@/state/selectors'
import { useDerived } from '@/state/selectors'
import { useI18n } from '@/i18n'
import { passPrefix } from '@/domain/forfaitLabel'

/**
 * Voyageurs et départs.
 *
 * Ce panneau ne sert pas à « remplir une fiche » : chaque champ pilote un
 * chiffre affiché ailleurs. L'âge décide du tarif enfant ou adulte des
 * forfaits et du matériel, le départ décide du carburant et des péages du
 * foyer, et chaque voyageur pèse une voix dans le vote du groupe. La section
 * « Ce que cela change » rend cette chaîne visible plutôt que de la laisser
 * deviner.
 */
export function PeopleDrawer(): JSX.Element {
  const { t } = useI18n()
  const { dur, eur, fmt } = useFormat()
  const { state, patch, setPeople } = useApp()
  const derived = useDerived()
  const ref = useRef<HTMLElement>(null)
  useFocusTrap(ref)

  // Les tarifs (forfait, moniteur, carburant) varient d'un domaine à l'autre :
  // le panneau prend comme référence le domaine consulté, à défaut le premier
  // résultat courant, pour que les montants affichés soient ceux d'un domaine
  // réel plutôt qu'une moyenne qui ne correspond à rien.
  const d = derived.lodgDomain ?? derived.filtered[0] ?? null
  const forfait: ResolvedForfait = d ? derived.forfaitOf(d) : { estimated: true }
  const pass = d ? derived.passOf(d) : null
  /**
   * Clé sous laquelle les tarifs de cours sont rangés.
   *
   * `d?.id ?? 0` écrivait sous la clé `0` quand aucun domaine n'était résolu :
   * la saisie partait dans une entrée que rien ne relit jamais, sans le moindre
   * signe à l'écran. Sans domaine, les champs sont désormais désactivés.
   */
  const domainKey = d?.id ?? -1
  const rate: EsfRate = d
    ? derived.esfOf(d)
    : { kid: 0, adult: 0, priv: null, ecole: null, releveLe: null, source: 'estimé', privSource: 'estimé' }
  const index = d ? derived.lessonIndexOf(d) : 1
  const trip = d ? derived.sejourInputs(d).trip : { fuel: 0, tolls: 0, total: 0, cars: derived.hh.length }

  const close = (): void => patch({ peopleOpen: false })

  const updatePerson = (i: number, changes: Partial<Person>): void => {
    setPeople(state.people.map((p, j) => (j === i ? { ...p, ...changes } : p)))
  }

  /** État du géocodage par départ, pour dire ce qui se passe sous les champs. */
  const [geo, setGeo] = useState<
    Record<number, { state: 'pending' | 'done' | 'error'; message?: string } | null>
  >({})
  /** Adresse déjà localisée, par départ : évite de regéocoder à chaque blur. */
  const geoAddr = useRef<Record<number, string>>({})

  const updatePlace = (i: number, changes: Partial<(typeof state.places)[number]>): void => {
    patch({ places: state.places.map((p, j) => (j === i ? { ...p, ...changes } : p)) })
  }

  /**
   * Géocode l'adresse d'un départ et enregistre sa position.
   *
   * Déclenché à la sortie des champs d'adresse, pas à chaque frappe : géocoder
   * « 12 ru » puis « 12 rue » puis « 12 rue d… » ferait une requête par
   * caractère pour un résultat qui n'a de sens qu'une fois l'adresse complète.
   *
   * Sans cette étape, `lat`/`lon` restaient nuls à vie : `travelOf` rendait
   * « inconnu » et `computeRoutes` écartait le départ. Saisir une adresse
   * n'avait donc aucun effet sur le temps de route, les péages ou le carburant.
   *
   * L'échec ne bloque rien : le départ reste utilisable, sans trajet, et le
   * motif s'affiche sous les champs.
   */
  const geocode = async (i: number): Promise<void> => {
    const place = state.places[i]
    if (!place) return
    const address = [place.addr, place.cp, place.city].filter(Boolean).join(' ').trim()
    if (!address) {
      setGeo((g) => ({ ...g, [i]: null }))
      return
    }
    // Déjà localisée pour cette adresse : rien à refaire.
    if (place.lat != null && place.lon != null && address === geoAddr.current[i]) return

    setGeo((g) => ({ ...g, [i]: { state: 'pending' } }))
    try {
      const resolved = await resolveSidecarOrigin(originsOf([place])[0])
      geoAddr.current[i] = address
      updatePlace(i, { lat: resolved.lat, lon: resolved.lon, originId: resolved.id })
      setGeo((g) => ({ ...g, [i]: { state: 'done' } }))
    } catch (err) {
      setGeo((g) => ({
        ...g,
        [i]: { state: 'error', message: err instanceof Error ? err.message : String(err) }
      }))
    }
  }

  const impacts = [
    {
      // Le libellé porte la durée réelle du séjour : « Forfaits 6 jours » en dur
      // annonçait six jours sur un week-end, et le montant suivait.
      label: pass ? t('pass_days_label').replace('{n}', String(pass.jours)) : t('pass_none'),
      val: eur(pass ? pass.adulte * derived.adults + pass.enfant * derived.kids : 0),
      sub: pass
        ? `${derived.adults} × ${passPrefix(pass)}${eur(pass.adulte)} adulte + ${derived.kids} × ${passPrefix(pass)}${eur(pass.enfant)} enfant`
        : t('pass_none')
    },
    {
      label: 'Location de matériel',
      val: eur(derived.adults * RENTAL_ADULT + derived.kids * RENTAL_KID),
      sub: '96 € par adulte, 58 € par enfant — si l’option est cochée'
    },
    {
      label: 'Cours de ski et de snowboard',
      val: eur(lessonsCost(state.people, rate, index)),
      sub: `${lessonsCount(state.people)} inscrit(s) sur ${state.people.length}${d ? ` · tarifs ${d.name} (indice × ${String(index).replace('.', ',')})` : ''}`
    },
    {
      label: 'Route',
      val: eur(trip.total),
      sub: `${trip.cars} foyer(s) · carburant ${eur(trip.fuel)} · péages ${eur(trip.tolls)}`
    },
    {
      label: 'Vote du groupe',
      val: `${state.people.length} voix`,
      sub: 'une voix par voyageur inscrit'
    }
  ]

  return (
    <>
      <div className="scrim" style={{ zIndex: 17 }} onClick={close} />
      <aside
        ref={ref}
        className="drawer"
        style={{ width: 'min(560px, 96%)', zIndex: 18 }}
        role="dialog"
        aria-modal="true"
        aria-label="Voyageurs et départs"
      >
        <div className="drawer__head">
          <h3>{t('travelers_departures')}</h3>
          <button type="button" className="iconbtn" onClick={close} aria-label="Fermer">
            <CloseIcon />
          </button>
        </div>

        <div className="drawer__body">
          <div>
            <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600 }}>
              {derived.adults} adulte(s) · {derived.kids} enfant(s) de moins de 13 ans · {derived.hh.length} foyer(s) au
              départ
            </p>
            <p className="u-muted" style={{ margin: 0, fontSize: 12, maxWidth: '52ch' }}>
              Ces informations pilotent le tarif enfant ou adulte des forfaits, la location de matériel, les cours ESF,
              le carburant et les péages par foyer, et le nombre de voix dans le vote du groupe.
            </p>
          </div>

          <section className="drawer__section">
            <h4>Le groupe</h4>
            {state.people.map((p, i) => {
              const lesson = lessonOf(p, rate, index)
              const home = derived.origins[p.home]
              return (
                <div key={p.id} className="personcard">
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                      type="text"
                      className="field field--panel"
                      style={{ flex: '1 1 96px', minWidth: 0 }}
                      value={p.first}
                      placeholder="Prénom"
                      aria-label="Prénom"
                      onChange={(e) => updatePerson(i, { first: e.target.value })}
                    />
                    <input
                      type="text"
                      className="field field--panel"
                      style={{ flex: '1 1 96px', minWidth: 0 }}
                      value={p.last}
                      placeholder="Nom"
                      aria-label="Nom"
                      onChange={(e) => updatePerson(i, { last: e.target.value })}
                    />
                    <input
                      type="number"
                      min={0}
                      max={99}
                      className="field field--panel u-num"
                  disabled={!d}
                      style={{ flex: '0 0 68px' }}
                      value={p.age}
                      aria-label="Âge"
                      onChange={(e) =>
                        updatePerson(i, { age: Math.max(0, Math.min(99, parseInt(e.target.value, 10) || 0)) })
                      }
                    />
                    <select
                      className="field field--panel"
                      style={{ flex: '1 1 118px', minWidth: 0 }}
                      value={p.home}
                      aria-label="Départ"
                      onChange={(e) => updatePerson(i, { home: parseInt(e.target.value, 10) || 0 })}
                    >
                      {derived.origins.map((o, j) => (
                        <option key={o.id} value={j}>
                          {o.short}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="iconbtn iconbtn--bare"
                      aria-label={`Retirer ${p.first}`}
                      onClick={() => {
                        if (state.people.length <= 1) return
                        setPeople(state.people.filter((_, j) => j !== i))
                      }}
                    >
                      <CloseIcon />
                    </button>
                  </div>

                  <p style={{ margin: 0, fontSize: 11, color: isKid(p) ? 'var(--link)' : 'var(--muted)' }}>
                    {isKid(p) ? 'tarif enfant · matériel 58 €' : 'tarif adulte · matériel 96 €'} · départ{' '}
                    {home?.short ?? '—'}
                  </p>

                  <div className="personcard__lessons">
                    <div className="seg">
                      <button
                        type="button"
                        className={`seg__btn${!lesson ? ' seg__btn--on' : ''}`}
                        onClick={() => updatePerson(i, { lesson: null })}
                      >
                        Sans cours
                      </button>
                      <button
                        type="button"
                        className={`seg__btn${lesson?.type === 'col' ? ' seg__btn--on' : ''}`}
                        onClick={() =>
                          updatePerson(i, { lesson: 'col', lesDays: p.lesDays ?? 6, lesHours: p.lesHours ?? 2.5 })
                        }
                      >
                        Collectif
                      </button>
                      <button
                        type="button"
                        className={`seg__btn${lesson?.type === 'priv' ? ' seg__btn--on' : ''}`}
                        onClick={() =>
                          updatePerson(i, { lesson: 'priv', lesDays: p.lesDays ?? 3, lesHours: p.lesHours ?? 2 })
                        }
                      >
                        Particulier
                      </button>
                    </div>
                    {lesson && (
                      <strong className="u-num u-nowrap" style={{ marginLeft: 'auto' }}>
                        {eur(lesson.price)}
                      </strong>
                    )}
                  </div>

                  {lesson && (
                    <>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <select
                          className="field field--panel"
                          style={{ flex: '1 1 108px', minWidth: 0 }}
                          value={lesson.days}
                          aria-label="Nombre de jours"
                          onChange={(e) => updatePerson(i, { lesDays: parseInt(e.target.value, 10) || 6 })}
                        >
                          {[1, 2, 3, 4, 5, 6].map((v) => (
                            <option key={v} value={v}>
                              {v} jour{v > 1 ? 's' : ''}
                            </option>
                          ))}
                        </select>
                        <select
                          className="field field--panel"
                          style={{ flex: '1 1 128px', minWidth: 0 }}
                          value={lesson.hours}
                          aria-label="Heures par jour"
                          onChange={(e) => updatePerson(i, { lesHours: parseFloat(e.target.value) || 2.5 })}
                        >
                          {HOUR_OPTS.map((o) => (
                            <option key={o.v} value={o.v}>
                              {o.label} par jour
                            </option>
                          ))}
                        </select>
                        <div className="seg">
                          <button
                            type="button"
                            className={`seg__btn${(p.disc ?? 'ski') === 'ski' ? ' seg__btn--on' : ''}`}
                            onClick={() => updatePerson(i, { disc: 'ski' })}
                          >
                            Ski
                          </button>
                          <button
                            type="button"
                            className={`seg__btn${p.disc === 'snow' ? ' seg__btn--on' : ''}`}
                            onClick={() => updatePerson(i, { disc: 'snow' })}
                          >
                            Snow
                          </button>
                        </div>
                      </div>
                      <p className="u-muted" style={{ margin: 0, fontSize: 11 }}>
                        {lesson.sub}
                      </p>
                    </>
                  )}
                </div>
              )
            })}

            <div className="esfrates">
              <span className="u-muted" style={{ fontSize: 12, flex: '1 1 130px', minWidth: 0 }}>
                Tarif horaire collectif
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                enfant
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  className="field field--panel u-num"
                  disabled={!d}
                  style={{ width: 66, padding: '5px 7px' }}
                  value={rate.kid}
                  aria-label="Tarif horaire enfant"
                  onChange={(e) =>
                    patch({
                      esfRates: {
                        ...state.esfRates,
                        [domainKey]: {
                          ...(state.esfRates[domainKey] ?? {}),
                          kid: parseFloat(String(e.target.value).replace(',', '.')) || 0
                        }
                      }
                    })
                  }
                />
                €/h
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                adulte
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  className="field field--panel u-num"
                  disabled={!d}
                  style={{ width: 66, padding: '5px 7px' }}
                  value={rate.adult}
                  aria-label="Tarif horaire adulte"
                  onChange={(e) =>
                    patch({
                      esfRates: {
                        ...state.esfRates,
                        [domainKey]: {
                          ...(state.esfRates[domainKey] ?? {}),
                          adult: parseFloat(String(e.target.value).replace(',', '.')) || 0
                        }
                      }
                    })
                  }
                />
                €/h
              </label>
              <button
                type="button"
                className="linkbtn linkbtn--sm"
                onClick={() => {
                  const next = { ...state.esfRates }
                  if (d) delete next[d.id]
                  patch({ esfRates: next })
                }}
              >
                {t('reset_lower')}
              </button>
            </div>

            {/* Deuxième rangée : le cours particulier, l'école et la date.
                Le tarif particulier n'était saisissable nulle part — il sortait
                d'un barème en dur (66 / 62 / 58 €/h) indexé sur le forfait, et
                l'écran ne le distinguait pas d'un tarif relevé. */}
            <div className="esfrates">
              <span className="u-muted" style={{ fontSize: 12, flex: '1 1 130px', minWidth: 0 }}>
                {t('lesson_priv_rate')}
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                <input
                  type="number"
                  step={0.5}
                  min={0}
                  className="field field--panel u-num"
                  disabled={!d}
                  style={{ width: 76, padding: '5px 7px' }}
                  value={state.esfRates[domainKey]?.priv ?? ''}
                  placeholder={t('lesson_priv_placeholder')}
                  aria-label={t('lesson_priv_rate')}
                  onChange={(e) =>
                    patch({
                      esfRates: {
                        ...state.esfRates,
                        [domainKey]: {
                          ...(state.esfRates[domainKey] ?? {}),
                          priv: parseFloat(String(e.target.value).replace(',', '.')) || undefined
                        }
                      }
                    })
                  }
                />
                €/h
              </label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 12,
                  flex: '1 1 140px',
                  minWidth: 0
                }}
              >
                <input
                  type="text"
                  className="field field--panel"
                  disabled={!d}
                  style={{ padding: '5px 7px', minWidth: 0 }}
                  value={state.esfRates[domainKey]?.ecole ?? ''}
                  placeholder={t('lesson_school_placeholder')}
                  aria-label={t('lesson_school_label')}
                  onChange={(e) =>
                    patch({
                      esfRates: {
                        ...state.esfRates,
                        [domainKey]: { ...(state.esfRates[domainKey] ?? {}), ecole: e.target.value }
                      }
                    })
                  }
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                <input
                  type="date"
                  className="field field--panel"
                  disabled={!d}
                  style={{ padding: '5px 7px' }}
                  value={state.esfRates[domainKey]?.releveLe ?? ''}
                  aria-label={t('lesson_date_label')}
                  onChange={(e) =>
                    patch({
                      esfRates: {
                        ...state.esfRates,
                        [domainKey]: { ...(state.esfRates[domainKey] ?? {}), releveLe: e.target.value }
                      }
                    })
                  }
                />
              </label>
            </div>

            {/* Les deux formules ne partagent pas leur origine : on peut avoir
                relevé le collectif et pas le particulier. Une seule ligne pour
                les deux effacerait la différence. */}
            <p style={{ margin: 0, fontSize: 11, color: rate.source === 'saisi' ? 'var(--ok)' : 'var(--warn)' }}>
              {t(rate.source === 'saisi' ? 'lesson_group_entered' : 'lesson_group_estimated').replace(
                '{d}',
                d?.name ?? '—'
              )}
              {rate.releveLe ? ` · ${t('lesson_recorded_on').replace('{d}', rate.releveLe)}` : ''}
            </p>
            <p
              style={{
                margin: 0,
                fontSize: 11,
                color: rate.privSource === 'saisi' ? 'var(--ok)' : 'var(--warn)'
              }}
            >
              {t(rate.privSource === 'saisi' ? 'lesson_priv_entered' : 'lesson_priv_estimated')}
            </p>
            <p className="u-muted" style={{ margin: 0, fontSize: 11 }}>
              {t('lesson_scale_note')
                .replace('{d}', d?.name ?? '—')
                .replace('{k}', String(index).replace('.', ','))}
            </p>

            <div>
              <button
                type="button"
                className="btn btn--small"
                onClick={() =>
                  setPeople([
                    ...state.people,
                    { id: Date.now(), first: `Voyageur ${state.people.length + 1}`, last: '', age: 30, home: 0 }
                  ])
                }
              >
                ＋ Ajouter un voyageur
              </button>
            </div>
          </section>

          <section className="drawer__section">
            <h4>{t('the_departures')}</h4>
            {state.places.map((pl, i) => {
              const count = state.people.filter((p) => p.home === i).length
              return (
                <div key={pl.id} className="personcard">
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="text"
                      className="field field--panel"
                      style={{ flex: 1, minWidth: 0, fontWeight: 600 }}
                      value={pl.label}
                      placeholder="Nom du départ"
                      aria-label="Nom du départ"
                      onChange={(e) => updatePlace(i, { label: e.target.value })}
                    />
                    <button
                      type="button"
                      className="iconbtn iconbtn--bare"
                      aria-label={`Retirer ${pl.label}`}
                      onClick={() => {
                        if (state.places.length <= 1) return
                        const places = state.places.filter((_, j) => j !== i)
                        // Les voyageurs rattachés au départ supprimé basculent
                        // sur le premier ; les index au-dessus se décalent.
                        const people = state.people.map((p) => ({
                          ...p,
                          home: p.home === i ? 0 : p.home > i ? p.home - 1 : p.home
                        }))
                        patch({ places })
                        setPeople(people)
                      }}
                    >
                      <CloseIcon />
                    </button>
                  </div>
                  <input
                    type="text"
                    className="field field--panel"
                    value={pl.addr}
                    placeholder="Adresse"
                    aria-label="Adresse"
                    onChange={(e) => updatePlace(i, { addr: e.target.value })}
                    onBlur={() => void geocode(i)}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      className="field field--panel u-num"
                  disabled={!d}
                      style={{ flex: '0 0 110px' }}
                      value={pl.cp}
                      placeholder="Code postal"
                      aria-label="Code postal"
                      onChange={(e) => updatePlace(i, { cp: e.target.value })}
                    onBlur={() => void geocode(i)}
                    />
                    <input
                      type="text"
                      className="field field--panel"
                      style={{ flex: 1, minWidth: 0 }}
                      value={pl.city}
                      placeholder="Ville"
                      aria-label="Ville"
                      onChange={(e) => updatePlace(i, { city: e.target.value })}
                    onBlur={() => void geocode(i)}
                    />
                  </div>
                  {(() => {
                    const g = geo[i]
                    const located = pl.lat != null && pl.lon != null
                    if (g?.state === 'pending') {
                      return (
                        <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)' }}>
                          {t('geocode_pending')}
                        </p>
                      )
                    }
                    if (g?.state === 'error') {
                      return (
                        <p style={{ margin: 0, fontSize: 11, color: 'var(--warn)' }}>{g.message}</p>
                      )
                    }
                    if (located) {
                      return (
                        <p style={{ margin: 0, fontSize: 11, color: 'var(--ok)' }}>
                          {t('geocode_done')}
                        </p>
                      )
                    }
                    // Adresse saisie mais jamais localisée : le dire, parce que
                    // c'est ce qui prive l'écran de tout calcul de route.
                    return [pl.addr, pl.cp, pl.city].some(Boolean) ? (
                      <p style={{ margin: 0, fontSize: 11, color: 'var(--warn)' }}>
                        {t('geocode_none')}
                      </p>
                    ) : null
                  })()}
                  <p style={{ margin: 0, fontSize: 11, color: count ? 'var(--muted)' : 'var(--warn)' }}>
                    {count
                      ? `${count} voyageur(s) · 1 voiture${d ? ` · ${dur(derived.travelOf(d, derived.origins[i]).dur)} jusqu’à ${d.name}` : ''}`
                      : 'aucun voyageur rattaché — ce départ est ignoré'}
                  </p>
                </div>
              )
            })}
            <div>
              <button
                type="button"
                className="btn btn--small"
                onClick={() =>
                  patch({
                    places: [
                      ...state.places,
                      {
                        id: Date.now(),
                        label: `Départ ${state.places.length + 1}`,
                        addr: '',
                        cp: '',
                        city: '',
                        lat: null,
                        lon: null
                      }
                    ]
                  })
                }
              >
                {t('add_departure')}
              </button>
            </div>
          </section>

          <section className="drawer__section" style={{ gap: 8 }}>
            <h4>Ce que cela change</h4>
            {impacts.map((im) => (
              <div key={im.label} className="posteline">
                <span style={{ fontSize: 13, flex: 1, minWidth: 0 }}>
                  {im.label}
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>{im.sub}</span>
                </span>
                <strong className="u-num u-nowrap">{im.val}</strong>
              </div>
            ))}
            <p className="u-muted" style={{ margin: 0, fontSize: 11 }}>
              Forfait de référence : {d?.name ?? '—'}, {fmt(forfait.j6 ?? 0)} € les 6 jours{forfait.estimated ? ' (estimé)' : ''}.
            </p>
          </section>
        </div>
      </aside>
    </>
  )
}
