/**
 * L'en-tête sous lequel tout le relevé se présente : celui d'un navigateur.
 *
 * Consigne du propriétaire, 24 septembre 2026 : les outils se présentent
 * comme un navigateur, pas comme « Skitrack » — logements, centrales,
 * forfaits, scripts. C'était déjà celui de Playwright et des collecteurs de
 * logements ; les relevés qui s'annonçaient en robot applicatif s'y alignent.
 *
 * Le nom sous lequel on lit les règles de `robots.txt` est une autre affaire
 * (`politesse.UA_AGENT`, `centrales/robots.AGENT_CENTRALES`) : il ne part
 * pas dans les requêtes.
 */
export const UA_NAVIGATEUR =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
