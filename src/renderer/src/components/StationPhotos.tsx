/**
 * Encadré des photos de stations.
 *
 * Deux services, et le second est une obligation.
 *
 * **Revoir l'import.** Les photos viennent de Wikimedia Commons, choisies par
 * position et non par nom : une candidate prise à quatre kilomètres du front de
 * neige peut montrer autre chose que la station. Cet écran met la photo, le
 * titre du fichier et la distance côte à côte pour que l'erreur se voie en une
 * seconde, là où un dossier d'images ne dit rien.
 *
 * **Porter le crédit.** CC-BY et CC-BY-SA exigent l'auteur et la licence à côté
 * de l'image. Ils sont là, avec le lien vers la page Commons. C'est ce qui rend
 * ces photos utilisables plutôt qu'empruntées.
 *
 * Une station sans photo garde sa ligne, marquée comme telle. La faire
 * disparaître donnerait une grille pleine et une couverture imaginaire.
 */

import { useMemo, useState } from 'react'
import { stationPhoto } from '@/components/photos'
import { creditPhoto, slugStation, type CreditPhoto } from '@/data/stationPhotos'
import type { PhotoOverride } from '@/data/photoOverrides'
import { photoOverrideManques, photoOverrideValide } from '@/data/photoOverrides'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'

type Filtre = 'toutes' | 'avec' | 'sans'

interface Ligne {
  id: number
  nom: string
  massif: string
  photo: string | null
  credit: CreditPhoto | null
}

export function StationPhotos(): JSX.Element {
  const { domains, state, patch } = useApp()
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const [filtre, setFiltre] = useState<Filtre>('toutes')
  /** Station dont le formulaire de correction est ouvert, par slug. */
  const [edite, setEdite] = useState<string | null>(null)
  const [brouillon, setBrouillon] = useState<PhotoOverride>({})

  const ouvrir = (nom: string): void => {
    const cle = slugStation(nom)
    setEdite(cle)
    setBrouillon(state.photoOverrides[cle] ?? {})
  }

  const enregistrer = (nom: string): void => {
    const cle = slugStation(nom)
    const aujourdhui = new Date().toISOString().slice(0, 10)
    patch({
      photoOverrides: { ...state.photoOverrides, [cle]: { ...brouillon, saisieLe: aujourdhui } }
    })
    setEdite(null)
  }

  const effacer = (nom: string): void => {
    const next = { ...state.photoOverrides }
    delete next[slugStation(nom)]
    patch({ photoOverrides: next })
    setEdite(null)
  }

  const lignes = useMemo<Ligne[]>(
    () =>
      [...domains]
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
        .map((d) => ({
          id: d.id,
          nom: d.name,
          massif: d.massif,
          photo: stationPhoto(d.slug),
          credit: creditPhoto(d.name)
        })),
    [domains]
  )

  const avec = lignes.filter((l) => l.photo).length

  const vues = useMemo(() => {
    const mot = q.trim().toLowerCase()
    return lignes.filter((l) => {
      if (filtre === 'avec' && !l.photo) return false
      if (filtre === 'sans' && l.photo) return false
      if (!mot) return true
      return `${l.nom} ${l.massif}`.toLowerCase().includes(mot)
    })
  }, [lignes, q, filtre])

  const onglets: { cle: Filtre; texte: string }[] = [
    { cle: 'toutes', texte: t('photos_all').replace('{n}', String(lignes.length)) },
    { cle: 'avec', texte: t('photos_with').replace('{n}', String(avec)) },
    { cle: 'sans', texte: t('photos_without').replace('{n}', String(lignes.length - avec)) }
  ]

  return (
    <section className="stphotos">
      <header className="stphotos__head">
        <h2>{t('photos_title')}</h2>
        <p className="settings__help" style={{ margin: 0 }}>
          {t('photos_lede')}
        </p>
      </header>

      <div className="stphotos__barre">
        <input
          className="crn-champ"
          type="search"
          value={q}
          placeholder={t('photos_search')}
          aria-label={t('photos_search')}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="stphotos__onglets">
          {onglets.map((o) => (
            <button
              key={o.cle}
              type="button"
              className="crn-chip"
              aria-pressed={filtre === o.cle}
              onClick={() => setFiltre(o.cle)}
            >
              {o.texte}
            </button>
          ))}
        </div>
      </div>

      {vues.length === 0 ? (
        <p className="crn-vide">
          <b>{t('photos_none_title')}</b>
          {t('photos_none_body')}
        </p>
      ) : (
        <ul className="stphotos__grille">
          {vues.map((l) => (
            <li key={l.id} className="stphotos__carte">
              {l.photo ? (
                <img
                  className="stphotos__img"
                  src={l.photo}
                  alt={t('photos_alt').replace('{d}', l.nom)}
                  loading="lazy"
                />
              ) : (
                <span className="stphotos__vide">{t('photos_missing')}</span>
              )}
              <div className="stphotos__corps">
                <b>{l.nom}</b>
                <span className="crn-legende">{l.massif}</span>
                {l.credit ? (
                  <>
                    <span className="crn-legende stphotos__fichier" title={l.credit.titre}>
                      {l.credit.titre.replace(/^File:/, '')}
                    </span>
                    <span className="crn-legende">
                      {/* La distance est la seule mesure qui dise si la photo
                          est bien celle de la station. Relevée par l'API : en
                          chasse fixe. Absente : dite absente — jamais un chiffre
                          fabriqué maquillé en mesure. */}
                      {l.credit.distanceM != null ? (
                        <span className="crn-releve u-num">
                          {t('photos_dist').replace('{n}', String(l.credit.distanceM))}
                        </span>
                      ) : (
                        <span className="stphotos__sans">{t('photos_dist_unknown')}</span>
                      )}
                      {' · '}
                      {l.credit.licence}
                      {l.credit.auteur ? ` · ${l.credit.auteur}` : ''}
                    </span>
                    <a
                      className="stphotos__lien crn-legende"
                      href={l.credit.page}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t('photos_source')}
                    </a>
                  </>
                ) : (
                  <span className="crn-legende stphotos__sans">{t('photos_no_credit')}</span>
                )}

                {/* Le référentiel photo est généré et choisit ses images par
                    position : l'écran savait montrer l'erreur, il ne savait pas
                    la corriger. Ces trois gestes — remplacer, re-créditer,
                    rejeter — sont tout ce qu'il manquait. */}
                {(() => {
                  const cle = slugStation(l.nom)
                  const ov = state.photoOverrides[cle]
                  const enEdition = edite === cle
                  const manques = enEdition ? photoOverrideManques(brouillon) : []
                  const prete = enEdition && photoOverrideValide(brouillon)
                  return (
                    <>
                      {ov && !enEdition && (
                        <span
                          className="crn-legende"
                          style={{ color: ov.rejetee ? 'var(--warn)' : 'var(--ok)' }}
                        >
                          {t(ov.rejetee ? 'photo_state_rejected' : 'photo_state_override')}
                        </span>
                      )}
                      <button
                        type="button"
                        className="linkbtn linkbtn--sm"
                        style={{ justifySelf: 'start' }}
                        onClick={() => (enEdition ? setEdite(null) : ouvrir(l.nom))}
                      >
                        {t('photo_fix_open')}
                      </button>

                      {enEdition && (
                        <div className="inset" style={{ padding: 12, display: 'grid', gap: 8, marginTop: 6 }}>
                          <p className="u-muted" style={{ margin: 0, fontSize: 11.5 }}>
                            {t('photo_fix_help')}
                          </p>

                          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                            <input
                              type="checkbox"
                              checked={brouillon.rejetee ?? false}
                              onChange={(e) =>
                                setBrouillon((b) => ({ ...b, rejetee: e.target.checked || undefined }))
                              }
                            />
                            {t('photo_reject_label')}
                          </label>

                          {brouillon.rejetee ? (
                            <p className="u-muted" style={{ margin: 0, fontSize: 11.5 }}>
                              {t('photo_reject_note')}
                            </p>
                          ) : (
                            <>
                              <label style={{ display: 'grid', gap: 3, fontSize: 11.5 }}>
                                {t('photo_url_label')}
                                <input
                                  type="url"
                                  className="field field--panel"
                                  style={{ padding: '5px 7px', fontSize: 12 }}
                                  placeholder={t('photo_url_placeholder')}
                                  value={brouillon.url ?? ''}
                                  onChange={(e) => setBrouillon((b) => ({ ...b, url: e.target.value }))}
                                />
                              </label>
                              <label style={{ display: 'grid', gap: 3, fontSize: 11.5 }}>
                                {t('photo_caption_label')}
                                <input
                                  type="text"
                                  className="field field--panel"
                                  style={{ padding: '5px 7px', fontSize: 12 }}
                                  placeholder={t('photo_caption_placeholder')}
                                  value={brouillon.legende ?? ''}
                                  onChange={(e) => setBrouillon((b) => ({ ...b, legende: e.target.value }))}
                                />
                              </label>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <label style={{ display: 'grid', gap: 3, fontSize: 11.5, flex: '1 1 120px' }}>
                                  {t('photo_author_label')}
                                  <input
                                    type="text"
                                    className="field field--panel"
                                    style={{ padding: '5px 7px', fontSize: 12, minWidth: 0 }}
                                    value={brouillon.auteur ?? ''}
                                    onChange={(e) => setBrouillon((b) => ({ ...b, auteur: e.target.value }))}
                                  />
                                </label>
                                <label style={{ display: 'grid', gap: 3, fontSize: 11.5, flex: '1 1 120px' }}>
                                  {t('photo_licence_label')}
                                  <input
                                    type="text"
                                    className="field field--panel"
                                    style={{ padding: '5px 7px', fontSize: 12, minWidth: 0 }}
                                    placeholder={t('photo_licence_placeholder')}
                                    value={brouillon.licence ?? ''}
                                    onChange={(e) => setBrouillon((b) => ({ ...b, licence: e.target.value }))}
                                  />
                                </label>
                              </div>
                              <label style={{ display: 'grid', gap: 3, fontSize: 11.5 }}>
                                {t('photo_page_label')}
                                <input
                                  type="url"
                                  className="field field--panel"
                                  style={{ padding: '5px 7px', fontSize: 12 }}
                                  value={brouillon.page ?? ''}
                                  onChange={(e) => setBrouillon((b) => ({ ...b, page: e.target.value }))}
                                />
                              </label>
                            </>
                          )}

                          <p
                            className="crn-legende"
                            style={{ margin: 0, color: prete ? 'var(--ok)' : 'var(--warn)' }}
                          >
                            {prete
                              ? t('photo_will_save')
                              : t('photo_needs').replace('{l}', manques.join(', '))}
                          </p>

                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="btn btn--small btn--primary"
                              disabled={!prete}
                              onClick={() => enregistrer(l.nom)}
                            >
                              {t('photo_save')}
                            </button>
                            <button type="button" className="btn btn--small" onClick={() => setEdite(null)}>
                              {t('cancel')}
                            </button>
                            {ov && (
                              <button
                                type="button"
                                className="linkbtn linkbtn--sm"
                                onClick={() => effacer(l.nom)}
                              >
                                {t('photo_clear')}
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="settings__help" style={{ marginTop: 12 }}>
        {t('photos_licence_note')}
      </p>
    </section>
  )
}
