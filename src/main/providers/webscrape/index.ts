/**
 * Scrapers web multi-sources (repli hors API).
 *
 * Sources : Booking, Expedia, Gîtes de France, CozyCozy, VRBO.
 * Airbnb reste dans providers/airbnb (pipeline dédié marque-page / deferred-state).
 */

export {
  createBookingWebProvider,
  createCozycozyWebProvider,
  createExpediaWebProvider,
  createGitesWebProvider,
  createVrboWebProvider,
  WEB_SCRAPE_PROVIDER_NAMES
} from './providers'
export { closeWebscrapeBrowser } from './shared'
