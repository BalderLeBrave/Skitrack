/** Tab bar mobile : les trois pas + « Plus ». Affichée sous 760 px par le CSS. */

import { NavLink } from 'react-router-dom'
import { useI18n } from '@/i18n'
import { useApp } from '@/state/appState'
import { PATHS } from '../router'

export function MobileTabBar(): JSX.Element {
  const { state } = useApp()
  const { t } = useI18n()
  const cls = ({ isActive }: { isActive: boolean }): string => `rc-tabbar__item${isActive ? ' rc-tabbar__item--on' : ''}`
  return (
    <nav className="rc-tabbar" aria-label={t('rc_nav_journey')} data-testid="mobile-tabbar">
      <NavLink to={PATHS.home} end className={cls} data-testid="tabbar-home">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>
        {t('nav_home')}
      </NavLink>
      <NavLink to={PATHS.compare} className={cls} data-testid="tabbar-compare">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l6-14 4 8 2-4 4 10z" /></svg>
        {t('rc_nav_compare')}
      </NavLink>
      {state.lodgingDomainId != null ? (
        <NavLink to={PATHS.lodgings} className={cls} data-testid="tabbar-lodgings">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21V9l9-6 9 6v12h-6v-6H9v6z" /></svg>
          {t('nav_lodgings')}
        </NavLink>
      ) : (
        <span className="rc-tabbar__item rc-tabbar__item--locked" data-testid="tabbar-lodgings-locked">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21V9l9-6 9 6v12h-6v-6H9v6z" /></svg>
          {t('nav_lodgings')}
        </span>
      )}
      <NavLink to={PATHS.settings} className={cls} data-testid="tabbar-more">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
        {t('rc_nav_more')}
      </NavLink>
    </nav>
  )
}
