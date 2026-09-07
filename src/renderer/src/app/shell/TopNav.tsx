/**
 * Barre haute : marque à gauche, trois pas du parcours au centre, utilitaires
 * repliés à droite. Un seul registre visuel : pas de CTA ici, le corail est
 * réservé à l'action de l'écran.
 */

import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { BrandLogo } from '@/components/BrandLogo'
import { LANGUAGES, LANGUAGE_LABELS, useI18n, type Language } from '@/i18n'
import { useApp } from '@/state/appState'
import { PATHS } from '../router'

export function ThemeToggle(): JSX.Element {
  const { state, patch } = useApp()
  const { t } = useI18n()
  const dark = state.theme === 'dark'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      className="rc-switch"
      title={t('theme_toggle')}
      data-testid="theme-toggle"
      onClick={() => patch({ theme: dark ? 'light' : 'dark' })}
    >
      <span className="rc-switch__track">
        <span className="rc-switch__knob" />
      </span>
      <span>{dark ? t('theme_dark') : t('theme_light')}</span>
    </button>
  )
}

function UtilityMenu(): JSX.Element {
  const { t, lang, setLang } = useI18n()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', away)
    return () => window.removeEventListener('pointerdown', away)
  }, [open])

  useEffect(() => setOpen(false), [pathname])

  const items: [string, string, string][] = [
    [PATHS.favorites, t('nav_favorites'), 'nav-favorites'],
    [PATHS.tracking, t('nav_tracking'), 'nav-tracking'],
    [PATHS.settings, t('nav_settings'), 'nav-settings']
  ]

  return (
    <div className="rc-more" ref={root}>
      <button
        type="button"
        className={`rc-more__btn${open ? ' rc-more__btn--open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="nav-more"
        onClick={() => setOpen((o) => !o)}
      >
        {t('rc_nav_more')}
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="rc-more__menu" role="menu" data-testid="nav-more-menu">
          {items.map(([to, label, tid]) => (
            <NavLink key={to} to={to} role="menuitem" className="rc-more__item" data-testid={tid}>
              {label}
            </NavLink>
          ))}
          <div className="rc-more__sep" />
          <label className="rc-more__row">
            <span>{t('settings_language')}</span>
            <select
              className="rc-select"
              value={lang}
              data-testid="lang-select"
              onChange={(e) => setLang(e.target.value as Language)}
            >
              {LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {LANGUAGE_LABELS[code]}
                </option>
              ))}
            </select>
          </label>
          <div className="rc-more__row">
            <ThemeToggle />
          </div>
        </div>
      )}
    </div>
  )
}

export function TopNav(): JSX.Element {
  const { state, patch } = useApp()
  const { t } = useI18n()
  const lodgingsReady = state.lodgingDomainId != null
  const link = ({ isActive }: { isActive: boolean }): string => `rc-nav__link${isActive ? ' rc-nav__link--on' : ''}`

  return (
    <header className="rc-nav" data-testid="top-nav">
      <NavLink to={PATHS.home} className="rc-nav__brand" data-testid="nav-brand" aria-label={t('appName')}>
        <BrandLogo />
      </NavLink>

      <nav className="rc-nav__journey" aria-label={t('rc_nav_journey')}>
        <NavLink to={PATHS.home} end className={link} data-testid="nav-home">
          {t('nav_home')}
        </NavLink>
        <NavLink to={PATHS.compare} className={link} data-testid="nav-compare">
          <span className="rc-nav__step">1</span>
          {t('rc_nav_compare')}
        </NavLink>
        {lodgingsReady ? (
          <NavLink to={PATHS.lodgings} className={link} data-testid="nav-lodgings">
            <span className="rc-nav__step">2</span>
            {t('nav_lodgings')}
          </NavLink>
        ) : (
          <span className="rc-nav__link rc-nav__link--locked" title={t('rc_nav_lodgings_locked')} data-testid="nav-lodgings-locked">
            <span className="rc-nav__step">2</span>
            {t('nav_lodgings')}
          </span>
        )}
        <span className="rc-nav__link rc-nav__link--locked" data-testid="nav-reservation-step">
          <span className="rc-nav__step">3</span>
          {t('rc_nav_reservation')}
        </span>
      </nav>

      <div className="rc-nav__utils">
        <ThemeToggle />
        <button
          type="button"
          className="rc-chip rc-chip--btn"
          data-testid="nav-travelers"
          onClick={() => patch({ peopleOpen: true })}
        >
          {t('nav_travelers')} · <b className="u-num">{state.travelers}</b>
        </button>
        <UtilityMenu />
      </div>
    </header>
  )
}
