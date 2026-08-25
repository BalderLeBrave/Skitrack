/**
 * Alertes de baisse de prix : quand notifier, et surtout quand se taire.
 *
 * Module pur — aucun accès au stockage, au réseau ni à l'état React. Il ne
 * décide que d'une chose à partir d'un relevé et d'une alerte : faut-il
 * prévenir, et dans quel état l'alerte se retrouve ensuite.
 *
 * ## Deux règles, et elles ne sont pas décoratives
 *
 * **1. Un relevé non mesuré n'existe pas.** L'écran de suivi sait déjà
 * distinguer une courbe simulée d'un historique relevé ; une notification, elle,
 * sort de l'application — elle apparaît dans le centre de notifications du
 * système, survit à la fermeture de la fenêtre, et personne ne la relira en se
 * demandant si le chiffre était une mesure. Notifier sur une estimation, c'est
 * pousser un prix inventé hors de l'application. Le garde-fou est donc ici, en
 * premier, avant même la comparaison au seuil : `origin !== 'measured'` sort
 * immédiatement, sans armer ni déclencher.
 *
 * **2. Hystérésis.** Un prix qui oscille autour du seuil déclencherait une
 * notification par relevé. L'alerte porte donc un cran, `armed` : il se pose
 * quand le prix est observé **au-dessus** du seuil, et il ne se décharge qu'une
 * fois, au passage en dessous. Repasser sous le seuil sans être remonté entre
 * les deux ne produit rien. C'est la différence entre « le prix a baissé » —
 * un événement — et « le prix est bas » — un état, que l'écran affiche déjà.
 */

export type AlertMode = 'total' | 'pp'

export interface PriceAlert {
  /** `TrackedItem.key` de l'élément suivi. */
  trackedKey: string
  /** Seuil sur le total du séjour ou sur le prix par personne. */
  mode: AlertMode
  threshold: number
  active: boolean
  /**
   * Cran armé : le prix a été observé au-dessus du seuil et n'est pas encore
   * redescendu. Voir l'hystérésis en tête de fichier.
   */
  armed: boolean
  /** Dernière notification émise, `null` tant qu'il n'y en a pas eu. */
  lastNotifiedAt: number | null
}

/** Provenance d'un point d'historique. Voir `PriceReading` dans `appState`. */
export type ReadingOrigin = 'measured' | 'estimated'

export interface AlertReading {
  value: number
  origin: ReadingOrigin
  at: number
}

export interface AlertFiring {
  trackedKey: string
  mode: AlertMode
  value: number
  threshold: number
  at: number
}

export interface AlertOutcome {
  /** L'alerte après le relevé — identique à l'entrée si rien n'a changé. */
  alert: PriceAlert
  /** Non nul quand il faut prévenir. */
  fired: AlertFiring | null
}

/**
 * État initial du cran, à la création d'une alerte.
 *
 * Poser un seuil sous le prix courant arme d'emblée : la prochaine baisse
 * franchira le seuil et c'est bien l'événement attendu. Poser un seuil
 * au-dessus du prix courant — le prix est déjà sous l'objectif — n'arme pas :
 * il n'y a pas eu de franchissement, et notifier ici reviendrait à annoncer
 * comme une nouvelle un prix qui s'affiche déjà à l'écran.
 */
export function initialArmed(threshold: number, currentValue: number | null): boolean {
  if (currentValue == null) return false
  return currentValue > threshold
}

/** Valeur comparée au seuil, selon le mode de l'alerte. */
export function valueFor(mode: AlertMode, total: number, pp: number): number {
  return mode === 'pp' ? pp : total
}

/**
 * Confronte un relevé à une alerte.
 *
 * Ne mute rien : renvoie l'alerte telle qu'elle doit être enregistrée. C'est ce
 * qui permet de tester la machine à états sans stockage.
 */
export function evaluateAlert(alert: PriceAlert, reading: AlertReading): AlertOutcome {
  // Règle 1 — hors mesure, on ne fait rien du tout : ni armer, ni déclencher.
  // Armer sur une estimation suffirait à faire notifier le premier vrai relevé
  // sans qu'aucun franchissement mesuré n'ait eu lieu.
  if (reading.origin !== 'measured') return { alert, fired: null }

  if (!alert.active) {
    // Alerte en pause : elle continue de suivre le prix pour ne pas notifier
    // un franchissement survenu pendant la pause au moment de la réactivation.
    return { alert: { ...alert, armed: reading.value > alert.threshold }, fired: null }
  }

  if (reading.value > alert.threshold) {
    // Au-dessus du seuil : on (ré)arme. C'est le seul endroit qui arme.
    return { alert: { ...alert, armed: true }, fired: null }
  }

  // À ou sous le seuil. Sans cran armé, c'est un état déjà connu, pas un
  // franchissement : silence.
  if (!alert.armed) return { alert, fired: null }

  return {
    alert: { ...alert, armed: false, lastNotifiedAt: reading.at },
    fired: {
      trackedKey: alert.trackedKey,
      mode: alert.mode,
      value: reading.value,
      threshold: alert.threshold,
      at: reading.at
    }
  }
}

/**
 * Applique une série de relevés à une alerte, dans l'ordre.
 *
 * Sert au rattrapage : l'application peut rester fermée plusieurs jours, et
 * plusieurs relevés arrivent alors d'un coup. Ne renvoie qu'un déclenchement —
 * le dernier — parce que trois notifications pour trois points d'une même
 * session de rattrapage disent la même chose trois fois.
 */
export function evaluateSeries(alert: PriceAlert, readings: readonly AlertReading[]): AlertOutcome {
  let current = alert
  let last: AlertFiring | null = null
  for (const reading of readings) {
    const outcome = evaluateAlert(current, reading)
    current = outcome.alert
    if (outcome.fired) last = outcome.fired
  }
  return { alert: current, fired: last }
}
