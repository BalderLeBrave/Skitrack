/**
 * Scrapers web multi-sources (repli hors API).
 *
 * Sources : Booking, Expedia, Gîtes de France, Abritel.
 * CozyCozy n'est pas une source (doublon). Tourinsoft non plus.
 * Airbnb reste dans providers/airbnb (pipeline dédié marque-page / deferred-state).
 */

export {
  createBookingWebProvider,
  createExpediaWebProvider,
  createGitesWebProvider,
  createVrboWebProvider,
  WEB_SCRAPE_PROVIDER_NAMES
} from './providers'
export { closeWebscrapeBrowser } from './shared'