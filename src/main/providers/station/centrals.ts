/**
 * Les centrales de réservation des stations — **fichier généré**.
 *
 * Régénéré par `npm run centrales:import` depuis
 * `docs/sources/centrales-selecteurs.xlsx`, le relevé fait à la main dans
 * l'inspecteur du navigateur. Toute correction se fait dans le classeur : une
 * modification écrite ici disparaîtrait au prochain import.
 *
 * ## Ce que cette table est
 *
 * 73 stations + 2 OTA (Airbnb, Booking.com), ~52 hosts distincts.
 * Plusieurs stations partagent la même centrale : Val d'Arly en dessert six,
 * et son `controls.station` porte les valeurs qui les distinguent.
 * Pour chacune, les **contrôles du formulaire de recherche** : le champ
 * d'arrivée, la durée, le nombre de personnes, le bouton qui lance la recherche.
 *
 * Airbnb et Booking.com sont des plateformes globales (OTA) : on recherche
 * par nom de station / géolocalisation, pas via un formulaire station-spécifique.
 * Leur entrée porte le type `ota` et des sélecteurs du moteur de recherche
 * générique. Le mapping station → query de localisation est à faire côté
 * scraper (ex. "Chamonix, France", "Les 2 Alpes, Isère").
 *
 * ## Ce qu'elle n'est pas
 *
 * Elle ne dit pas comment **lire les résultats**. Sur les centrales locales,
 * 73 n'ont aucun sélecteur de prix, 67 aucun sélecteur de carte. Le prix est
 * pourtant ce qu'on vient chercher : il se relève sur les pages de résultats,
 * plateforme par plateforme, et c'est l'objet de la reconnaissance
 * (`npm run centrales:recon`, rapport dans `docs/diagnostics/`).
 *
 * Un contrôle dont `selector` vaut `null` n'a pas pu être dérivé : la cellule
 * ne contenait pas un élément exploitable. Son texte est gardé dans `raw` pour
 * qu'on puisse le reprendre, jamais deviné.
 *
 * ## Nettoyage appliqué (2026-08-19)
 *
 * - Suppression des artefacts `cards` / `title` / `link` contenant du HTML
 *   tronqué d'`<option>` (copier-coller du select personnes).
 * - Suppression des contrôles `cards` / `title` / `price` / `link` à sélecteur
 *   null sans valeur informative (réservés à la phase recon).
 * - Conservation des `raw` uniquement quand le tag est exploitable (span,
 *   input readonly, etc.) pour permettre une reprise manuelle.
 * - Doublons de station conservés quand l'URL / host diffère (centrales
 *   distinctes).
 *
 * ## Ajout OTA (2026-08-20)
 *
 * - Airbnb et Booking.com ajoutés comme plateformes de type `ota`.
 * - Sélecteurs basés sur les formulaires de recherche publics (sujets à
 *   changement fréquent + protections anti-bot fortes : Cloudflare, fingerprint,
 *   rate-limit). Préférer API officielles ou partenaires si disponibles.
 */

/** Un contrôle du formulaire de recherche d'une centrale. */
export interface CentralControl {
  /**
   * Sélecteur CSS dérivé du relevé, `null` si la cellule n'était pas un
   * élément. Bâti sur `[name]` en priorité, jamais sur un identifiant qui
   * porte une empreinte de session.
   */
  selector: string | null
  /** Absent quand la cellule n'était pas un élément : voir `raw`. */
  tag?: string
  name?: string
  type?: string
  placeholder?: string
  /** Choix d'un `<select>`, hors listes de dates — elles ne valent que pour la
   *  saison du relevé. */
  options?: { value: string; label: string }[]
  /** Le HTML relevé, gardé quand aucun sélecteur n'a pu en être tiré. */
  raw?: string
  /**
   * Attribut data-* ou aria-* utile pour cibler (ex. data-testid Airbnb).
   * Préférer ces attributs aux classes hashées quand disponibles.
   */
  testId?: string
}

/**
 * Type de plateforme.
 * - `central` : site de réservation d'une (ou plusieurs) station(s)
 * - `ota`     : plateforme globale (Airbnb, Booking…) — recherche par lieu
 */
export type CentralKind = "central" | "ota"

export interface Central {
  /** La station telle que le relevé la nomme. Pour les OTA : nom de la plateforme. */
  station: string
  url: string
  host: string
  /** Défaut : "central". Les OTA (Airbnb, Booking) sont de type "ota". */
  kind?: CentralKind
  controls: {
    /** Champ de localisation / destination (surtout OTA). */
    location?: CentralControl
    station?: CentralControl
    lodging?: CentralControl
    stayType?: CentralControl
    checkIn?: CentralControl
    checkOut?: CentralControl
    duration?: CentralControl
    guests?: CentralControl
    /** Adultes / enfants séparés (Airbnb, Booking). */
    adults?: CentralControl
    children?: CentralControl
    infants?: CentralControl
    pets?: CentralControl
    submit?: CentralControl
    cards?: CentralControl
    title?: CentralControl
    price?: CentralControl
    link?: CentralControl
  }
  notes?: string
  /**
   * Configuration anti-bot (délais, proxy, concurrence).
   * Si absent : "high" pour kind=ota, "low" pour les centrales locales.
   */
  antiBot?: {
    level: "low" | "medium" | "high"
    preferBrowser?: boolean
    minDelayMs?: number
    maxDelayMs?: number
    maxConcurrency?: number
    requireResidentialProxy?: boolean
    cooldownOnChallengeMs?: number
    maxConsecutiveFailures?: number
  }
}

export const CENTRALS: Central[] = [
  {
    station: "Les 2 Alpes",
    url: "https://reservation.les2alpes.com/location-appartement-2-alpes.html",
    host: "reservation.les2alpes.com",
    controls: {
      checkIn: {
        selector: "input.datepicker",
        tag: "input",
        type: "text",
        placeholder: "Choisir une date"
      },
      checkOut: {
        selector: "input.datepicker",
        tag: "input",
        type: "text",
        placeholder: "Choisir une date"
      },
      guests: {
        selector: 'button[type="button"]',
        tag: "button",
        type: "button"
      },
      submit: {
        selector: 'input[name="search"]',
        tag: "input",
        name: "search",
        type: "button"
      }
    }
  },
  {
    station: "Chamonix",
    url: "https://booking.chamonix.com/fr/",
    host: "booking.chamonix.com",
    controls: {
      lodging: {
        selector: "div.custom-search-engine-select__control",
        tag: "div"
      },
      checkIn: {
        selector: 'input[placeholder="Date d\'arrivée"]',
        tag: "input",
        placeholder: "Date d'arrivée"
      },
      checkOut: {
        selector: 'input[placeholder="Date de départ"]',
        tag: "input",
        placeholder: "Date de départ"
      },
      guests: {
        selector: "div.elem-custom-input.close",
        tag: "div"
      },
      submit: {
        selector: "button.elem-button-primary.search-engine-submit",
        tag: "button",
        type: "submit"
      }
    }
  },
  {
    station: "Arêches Beaufort",
    url: "https://reservation.areches-beaufort.com/",
    host: "reservation.areches-beaufort.com",
    controls: {
      lodging: {
        selector: 'select[name="type_prestataire"]',
        tag: "select",
        name: "type_prestataire",
        options: [
          { value: "G", label: "Appartement, Chalet, Résidence" },
          { value: "H", label: "Hôtel, Chambre d'hôtes" }
        ]
      },
      stayType: {
        selector: 'select[name="type_date"]',
        tag: "select",
        name: "type_date",
        options: [
          { value: "SS", label: "Du samedi au samedi" },
          { value: "DD", label: "Du dimanche au dimanche" },
          { value: "LL", label: "Week-end et court séjour" }
        ]
      },
      checkIn: {
        selector: 'select[name="datedeb"]',
        tag: "select",
        name: "datedeb"
      },
      duration: {
        selector: 'select[name="duree"]',
        tag: "select",
        name: "duree",
        options: [
          { value: "7", label: "1 semaine" },
          { value: "14", label: "2 semaines" },
          { value: "21", label: "3 semaines" },
          { value: "28", label: "4 semaines" }
        ]
      },
      guests: {
        selector: 'select[name="personnes"]',
        tag: "select",
        name: "personnes",
        options: [
          { value: "1", label: "1 personne" },
          { value: "2", label: "2 personnes" },
          { value: "3", label: "3 personnes" },
          { value: "4", label: "4 personnes" },
          { value: "5", label: "5 personnes" },
          { value: "6", label: "6 personnes" },
          { value: "7", label: "7 personnes" },
          { value: "8", label: "8 personnes" },
          { value: "9", label: "9 personnes" },
          { value: "10", label: "10 personnes" },
          { value: "11", label: "11 personnes" },
          { value: "12", label: "12 personnes" },
          { value: "13", label: "13 personnes" },
          { value: "14", label: "14 personnes" },
          { value: "15", label: "15 personnes" },
          { value: "16", label: "16 personnes" }
        ]
      },
      submit: {
        selector: 'input[name="search"]',
        tag: "input",
        name: "search",
        type: "button"
      }
    }
  },
  {
    station: "Crest-Voland",
    url: "https://reservation.valdarly-montblanc.com/",
    host: "reservation.valdarly-montblanc.com",
    controls: {
      station: {
        selector: 'select[name="criteres[]"]',
        tag: "select",
        name: "criteres[]",
        options: [
          { value: "", label: "Station Village" },
          { value: "LOCALISATIONVALDARLY|CRESTVOLANDCOHENNOZ|G", label: "Crest-Voland / Cohennoz" },
          { value: "LOCALISATIONVALDARLY|FLUMETSTNICOLASLACHAPELLE|G", label: "Flumet / St Nicolas la Chapelle" },
          { value: "LOCALISATIONVALDARLY|LAGIETTAZENARAVIS|G", label: "La Giettaz en Aravis" },
          { value: "LOCALISATIONVALDARLY|NOTREDAMEDEBELLECOMBE|G", label: "Notre Dame de Bellecombe" }
        ]
      },
      lodging: {
        selector: 'select[name="type_prestataire"]',
        tag: "select",
        name: "type_prestataire",
        options: [
          { value: "G", label: "Appartement, Chalet, Résidence" },
          { value: "H", label: "Hôtel" }
        ]
      },
      stayType: {
        selector: 'select[name="type_date"]',
        tag: "select",
        name: "type_date",
        options: [
          { value: "SS", label: "Du samedi au samedi" },
          { value: "DD", label: "Du dimanche au dimanche" },
          { value: "LL", label: "Week-end et court séjour" }
        ]
      },
      checkIn: {
        selector: 'select[name="datedeb"]',
        tag: "select",
        name: "datedeb"
      },
      duration: {
        selector: 'select[name="duree"]',
        tag: "select",
        name: "duree",
        options: [
          { value: "7", label: "1 semaine" },
          { value: "14", label: "2 semaines" },
          { value: "21", label: "3 semaines" },
          { value: "28", label: "4 semaines" }
        ]
      },
      guests: {
        selector: 'select[name="personnes"]',
        tag: "select",
        name: "personnes",
        options: [
          { value: "1", label: "1 personne" },
          { value: "2", label: "2 personnes" },
          { value: "3", label: "3 personnes" },
          { value: "4", label: "4 personnes" },
          { value: "5", label: "5 personnes" },
          { value: "6", label: "6 personnes" },
          { value: "7", label: "7 personnes" },
          { value: "8", label: "8 personnes" },
          { value: "9", label: "9 personnes" },
          { value: "10", label: "10 personnes" },
          { value: "11", label: "11 personnes" },
          { value: "12", label: "12 personnes" },
          { value: "13", label: "13 personnes" },
          { value: "14", label: "14 personnes" },
          { value: "15", label: "15 personnes" },
          { value: "16", label: "16 personnes" },
          { value: "17", label: "17 personnes" },
          { value: "18", label: "18 personnes" }
        ]
      },
      submit: {
        selector: 'input[name="search"]',
        tag: "input",
        name: "search",
        type: "button"
      }
    }
  },
  {
    station: "Cohennoz",
    url: "https://reservation.valdarly-montblanc.com/",
    host: "reservation.valdarly-montblanc.com",
    controls: {
      station: {
        selector: 'select[name="criteres[]"]',
        tag: "select",
        name: "criteres[]",
        options: [
          { value: "", label: "Station Village" },
          { value: "LOCALISATIONVALDARLY|CRESTVOLANDCOHENNOZ|G", label: "Crest-Voland / Cohennoz" },
          { value: "LOCALISATIONVALDARLY|FLUMETSTNICOLASLACHAPELLE|G", label: "Flumet / St Nicolas la Chapelle" },
          { value: "LOCALISATIONVALDARLY|LAGIETTAZENARAVIS|G", label: "La Giettaz en Aravis" },
          { value: "LOCALISATIONVALDARLY|NOTREDAMEDEBELLECOMBE|G", label: "Notre Dame de Bellecombe" }
        ]
      },
      lodging: {
        selector: 'select[name="type_prestataire"]',
        tag: "select",
        name: "type_prestataire",
        options: [
          { value: "G", label: "Appartement, Chalet, Résidence" },
          { value: "H", label: "Hôtel" }
        ]
      },
      stayType: {
        selector: 'select[name="type_date"]',
        tag: "select",
        name: "type_date",
        options: [
          { value: "SS", label: "Du samedi au samedi" },
          { value: "DD", label: "Du dimanche au dimanche" },
          { value: "LL", label: "Week-end et court séjour" }
        ]
      },
      checkIn: {
        selector: 'select[name="datedeb"]',
        tag: "select",
        name: "datedeb"
      },
      duration: {
        selector: 'select[name="duree"]',
        tag: "select",
        name: "duree",
        options: [
          { value: "7", label: "1 semaine" },
          { value: "14", label: "2 semaines" },
          { value: "21", label: "3 semaines" },
          { value: "28", label: "4 semaines" }
        ]
      },
      guests: {
        selector: 'select[name="personnes"]',
        tag: "select",
        name: "personnes",
        options: [
          { value: "1", label: "1 personne" },
          { value: "2", label: "2 personnes" },
          { value: "3", label: "3 personnes" },
          { value: "4", label: "4 personnes" },
          { value: "5", label: "5 personnes" },
          { value: "6", label: "6 personnes" },
          { value: "7", label: "7 personnes" },
          { value: "8", label: "8 personnes" },
          { value: "9", label: "9 personnes" },
          { value: "10", label: "10 personnes" },
          { value: "11", label: "11 personnes" },
          { value: "12", label: "12 personnes" },
          { value: "13", label: "13 personnes" },
          { value: "14", label: "14 personnes" },
          { value: "15", label: "15 personnes" },
          { value: "16", label: "16 personnes" },
          { value: "17", label: "17 personnes" },
          { value: "18", label: "18 personnes" }
        ]
      },
      submit: {
        selector: 'input[name="search"]',
        tag: "input",
        name: "search",
        type: "button"
      }
    }
  },
  {
    station: "Flumet",
    url: "https://reservation.valdarly-montblanc.com/",
    host: "reservation.valdarly-montblanc.com",
    controls: {
      station: {
        selector: 'select[name="criteres[]"]',
        tag: "select",
        name: "criteres[]",
        options: [
          { value: "", label: "Station Village" },
          { value: "LOCALISATIONVALDARLY|CRESTVOLANDCOHENNOZ|G", label: "Crest-Voland / Cohennoz" },
          { value: "LOCALISATIONVALDARLY|FLUMETSTNICOLASLACHAPELLE|G", label: "Flumet / St Nicolas la Chapelle" },
          { value: "LOCALISATIONVALDARLY|LAGIETTAZENARAVIS|G", label: "La Giettaz en Aravis" },
          { value: "LOCALISATIONVALDARLY|NOTREDAMEDEBELLECOMBE|G", label: "Notre Dame de Bellecombe" }
        ]
      },
      lodging: {
        selector: 'select[name="type_prestataire"]',
        tag: "select",
        name: "type_prestataire",
        options: [
          { value: "G", label: "Appartement, Chalet, Résidence" },
          { value: "H", label: "Hôtel" }
        ]
      },
      stayType: {
        selector: 'select[name="type_date"]',
        tag: "select",
        name: "type_date",
        options: [
          { value: "SS", label: "Du samedi au samedi" },
          { value: "DD", label: "Du dimanche au dimanche" },
          { value: "LL", label: "Week-end et court séjour" }
        ]
      },
      checkIn: {
        selector: 'select[name="datedeb"]',
        tag: "select",
        name: "datedeb"
      },
      duration: {
        selector: 'select[name="duree"]',
        tag: "select",
        name: "duree",
        options: [
          { value: "7", label: "1 semaine" },
          { value: "14", label: "2 semaines" },
          { value: "21", label: "3 semaines" },
          { value: "28", label: "4 semaines" }
        ]
      },
      guests: {
        selector: 'select[name="personnes"]',
        tag: "select",
        name: "personnes",
        options: [
          { value: "1", label: "1 personne" },
          { value: "2", label: "2 personnes" },
          { value: "3", label: "3 personnes" },
          { value: "4", label: "4 personnes" },
          { value: "5", label: "5 personnes" },
          { value: "6", label: "6 personnes" },
          { value: "7", label: "7 personnes" },
          { value: "8", label: "8 personnes" },
          { value: "9", label: "9 personnes" },
          { value: "10", label: "10 personnes" },
          { value: "11", label: "11 personnes" },
          { value: "12", label: "12 personnes" },
          { value: "13", label: "13 personnes" },
          { value: "14", label: "14 personnes" },
          { value: "15", label: "15 personnes" },
          { value: "16", label: "16 personnes" },
          { value: "17", label: "17 personnes" },
          { value: "18", label: "18 personnes" }
        ]
      },
      submit: {
        selector: 'input[name="search"]',
        tag: "input",
        name: "search",
        type: "button"
      }
    }
  },
  {
    station: "Saint-Nicolas-la-Chapelle",
    url: "https://reservation.valdarly-montblanc.com/",
    host: "reservation.valdarly-montblanc.com",
    controls: {
      station: {
        selector: 'select[name="criteres[]"]',
        tag: "select",
        name: "criteres[]",
        options: [
          { value: "", label: "Station Village" },
          { value: "LOCALISATIONVALDARLY|CRESTVOLANDCOHENNOZ|G", label: "Crest-Voland / Cohennoz" },
          { value: "LOCALISATIONVALDARLY|FLUMETSTNICOLASLACHAPELLE|G", label: "Flumet / St Nicolas la Chapelle" },
          { value: "LOCALISATIONVALDARLY|LAGIETTAZENARAVIS|G", label: "La Giettaz en Aravis" },
          { value: "LOCALISATIONVALDARLY|NOTREDAMEDEBELLECOMBE|G", label: "Notre Dame de Bellecombe" }
        ]
      },
      lodging: {
        selector: 'select[name="type_prestataire"]',
        tag: "select",
        name: "type_prestataire",
        options: [
          { value: "G", label: "Appartement, Chalet, Résidence" },
          { value: "H", label: "Hôtel" }
        ]
      },
      stayType: {
        selector: 'select[name="type_date"]',
        tag: "select",
        name: "type_date",
        options: [
          { value: "SS", label: "Du samedi au samedi" },
          { value: "DD", label: "Du dimanche au dimanche" },
          { value: "LL", label: "Week-end et court séjour" }
        ]
      },
      checkIn: {
        selector: 'select[name="datedeb"]',
        tag: "select",
        name: "datedeb"
      },
      duration: {
        selector: 'select[name="duree"]',
        tag: "select",
        name: "duree",
        options: [
          { value: "7", label: "1 semaine" },
          { value: "14", label: "2 semaines" },
          { value: "21", label: "3 semaines" },
          { value: "28", label: "4 semaines" }
        ]
      },
      guests: {
        selector: 'select[name="personnes"]',
        tag: "select",
        name: "personnes",
        options: [
          { value: "1", label: "1 personne" },
          { value: "2", label: "2 personnes" },
          { value: "3", label: "3 personnes" },
          { value: "4", label: "4 personnes" },
          { value: "5", label: "5 personnes" },
          { value: "6", label: "6 personnes" },
          { value: "7", label: "7 personnes" },
          { value: "8", label: "8 personnes" },
          { value: "9", label: "9 personnes" },
          { value: "10", label: "10 personnes" },
          { value: "11", label: "11 personnes" },
          { value: "12", label: "12 personnes" },
          { value: "13", label: "13 personnes" },
          { value: "14", label: "14 personnes" },
          { value: "15", label: "15 personnes" },
          { value: "16", label: "16 personnes" },
          { value: "17", label: "17 personnes" },
          { value: "18", label: "18 personnes" }
        ]
      },
      submit: {
        selector: 'input[name="search"]',
        tag: "input",
        name: "search",
        type: "button"
      }
    }
  },
  {
    station: "La Giettaz en Aravis",
    url: "https://reservation.valdarly-montblanc.com/",
    host: "reservation.valdarly-montblanc.com",
    controls: {
      station: {
        selector: 'select[name="criteres[]"]',
        tag: "select",
        name: "criteres[]",
        options: [
          { value: "", label: "Station Village" },
          { value: "LOCALISATIONVALDARLY|CRESTVOLANDCOHENNOZ|G", label: "Crest-Voland / Cohennoz" },
          { value: "LOCALISATIONVALDARLY|FLUMETSTNICOLASLACHAPELLE|G", label: "Flumet / St Nicolas la Chapelle" },
          { value: "LOCALISATIONVALDARLY|LAGIETTAZENARAVIS|G", label: "La Giettaz en Aravis" },
          { value: "LOCALISATIONVALDARLY|NOTREDAMEDEBELLECOMBE|G", label: "Notre Dame de Bellecombe" }
        ]
      },
      lodging: {
        selector: 'select[name="type_prestataire"]',
        tag: "select",
        name: "type_prestataire",
        options: [
          { value: "G", label: "Appartement, Chalet, Résidence" },
          { value: "H", label: "Hôtel" }
        ]
      },
      stayType: {
        selector: 'select[name="type_date"]',
        tag: "select",
        name: "type_date",
        options: [
          { value: "SS", label: "Du samedi au samedi" },
          { value: "DD", label: "Du dimanche au dimanche" },
          { value: "LL", label: "Week-end et court séjour" }
        ]
      },
      checkIn: {
        selector: 'select[name="datedeb"]',
        tag: "select",
        name: "datedeb"
      },
      duration: {
        selector: 'select[name="duree"]',
        tag: "select",
        name: "duree",
        options: [
          { value: "7", label: "1 semaine" },
          { value: "14", label: "2 semaines" },
          { value: "21", label: "3 semaines" },
          { value: "28", label: "4 semaines" }
        ]
      },
      guests: {
        selector: 'select[name="personnes"]',
        tag: "select",
        name: "personnes",
        options: [
          { value: "1", label: "1 personne" },
          { value: "2", label: "2 personnes" },
          { value: "3", label: "3 personnes" },
          { value: "4", label: "4 personnes" },
          { value: "5", label: "5 personnes" },
          { value: "6", label: "6 personnes" },
          { value: "7", label: "7 personnes" },
          { value: "8", label: "8 personnes" },
          { value: "9", label: "9 personnes" },
          { value: "10", label: "10 personnes" },
          { value: "11", label: "11 personnes" },
          { value: "12", label: "12 personnes" },
          { value: "13", label: "13 personnes" },
          { value: "14", label: "14 personnes" },
          { value: "15", label: "15 personnes" },
          { value: "16", label: "16 personnes" },
          { value: "17", label: "17 personnes" },
          { value: "18", label: "18 personnes" }
        ]
      },
      submit: {
        selector: 'input[name="search"]',
        tag: "input",
        name: "search",
        type: "button"
      }
    }
  },
  {
    station: "Notre-Dame-de-Bellecombe",
    url: "https://reservation.valdarly-montblanc.com/",
    host: "reservation.valdarly-montblanc.com",
    controls: {
      station: {
        selector: 'select[name="criteres[]"]',
        tag: "select",
        name: "criteres[]",
        options: [
          { value: "", label: "Station Village" },
          { value: "LOCALISATIONVALDARLY|CRESTVOLANDCOHENNOZ|G", label: "Crest-Voland / Cohennoz" },
          { value: "LOCALISATIONVALDARLY|FLUMETSTNICOLASLACHAPELLE|G", label: "Flumet / St Nicolas la Chapelle" },
          { value: "LOCALISATIONVALDARLY|LAGIETTAZENARAVIS|G", label: "La Giettaz en Aravis" },
          { value: "LOCALISATIONVALDARLY|NOTREDAMEDEBELLECOMBE|G", label: "Notre Dame de Bellecombe" }
        ]
      },
      lodging: {
        selector: 'select[name="type_prestataire"]',
        tag: "select",
        name: "type_prestataire",
        options: [
          { value: "G", label: "Appartement, Chalet, Résidence" },
          { value: "H", label: "Hôtel" }
        ]
      },
      stayType: {
        selector: 'select[name="type_date"]',
        tag: "select",
        name: "type_date",
        options: [
          { value: "SS", label: "Du samedi au samedi" },
          { value: "DD", label: "Du dimanche au dimanche" },
          { value: "LL", label: "Week-end et court séjour" }
        ]
      },
      checkIn: {
        selector: 'select[name="datedeb"]',
        tag: "select",
        name: "datedeb"
      },
      duration: {
        selector: 'select[name="duree"]',
        tag: "select",
        name: "duree",
        options: [
          { value: "7", label: "1 semaine" },
          { value: "14", label: "2 semaines" },
          { value: "21", label: "3 semaines" },
          { value: "28", label: "4 semaines" }
        ]
      },
      guests: {
        selector: 'select[name="personnes"]',
        tag: "select",
        name: "personnes",
        options: [
          { value: "1", label: "1 personne" },
          { value: "2", label: "2 personnes" },
          { value: "3", label: "3 personnes" },
          { value: "4", label: "4 personnes" },
          { value: "5", label: "5 personnes" },
          { value: "6", label: "6 personnes" },
          { value: "7", label: "7 personnes" },
          { value: "8", label: "8 personnes" },
          { value: "9", label: "9 personnes" },
          { value: "10", label: "10 personnes" },
          { value: "11", label: "11 personnes" },
          { value: "12", label: "12 personnes" },
          { value: "13", label: "13 personnes" },
          { value: "14", label: "14 personnes" },
          { value: "15", label: "15 personnes" },
          { value: "16", label: "16 personnes" },
          { value: "17", label: "17 personnes" },
          { value: "18", label: "18 personnes" }
        ]
      },
      submit: {
        selector: 'input[name="search"]',
        tag: "input",
        name: "search",
        type: "button"
      }
    }
  },
  {
    station: "La Norma",
    url: "https://reservation.haute-maurienne-vanoise.com/ac54-la-norma.htm",
    host: "reservation.haute-maurienne-vanoise.com",
    controls: {
      lodging: {
        selector: 'select[name="selectionpage"]',
        tag: "select",
        name: "selectionpage",
        options: [
          { value: "56", label: "Tous nos studios & appartements" },
          { value: "110", label: "Appartements de particuliers" },
          { value: "140", label: "Appartements en Résidences, Professionnels" }
        ]
      },
      checkIn: {
        selector: 'input[name="datearrivee"]',
        tag: "input",
        name: "datearrivee",
        type: "text",
        placeholder: "jj/mm/aaaa"
      },
      checkOut: {
        selector: 'input[name="datedepart"]',
        tag: "input",
        name: "datedepart",
        type: "text",
        placeholder: "jj/mm/aaaa"
      },
      guests: {
        selector: 'select[name="nbpers"]',
        tag: "select",
        name: "nbpers",
        options: [
          { value: "1", label: "Indifférent" },
          { value: "1", label: "1" },
          { value: "2", label: "2" },
          { value: "3", label: "3" },
          { value: "4", label: "4" },
          { value: "5", label: "5" },
          { value: "6", label: "6" },
          { value: "7", label: "7" },
          { value: "8", label: "8" },
          { value: "9", label: "9" },
          { value: "10", label: "10" },
          { value: "12", label: "12 personnes et +" }
        ]
      },
      submit: {
        selector: null,
        tag: "span",
        raw: "<span>Rechercher</span>"
      }
    }
  },
  {
    station: "Plagne Aime 2000",
    url: "https://www.laplagneresort.com/",
    host: "www.laplagneresort.com",
    controls: {
      station: {
        selector: "div.custom-select__placeholder",
        tag: "div"
      },
      checkIn: {
        selector: "input.elem-custom-input.open-datepicker",
        tag: "input",
        type: "text",
        placeholder: "Date de départ"
      },
      duration: {
        selector: "div.custom-select__placeholder",
        tag: "div"
      },
      submit: {
        selector: "button.elem-button-primary",
        tag: "button",
        type: "submit"
      }
    }
  },
  {
    station: "Belle Plagne",
    url: "https://www.laplagneresort.com/",
    host: "www.laplagneresort.com",
    controls: {
      station: {
        selector: "div.custom-select__placeholder",
        tag: "div"
      },
      checkIn: {
        selector: "input.elem-custom-input.open-datepicker",
        tag: "input",
        type: "text",
        placeholder: "Date de départ"
      },
      duration: {
        selector: "div.custom-select__placeholder",
        tag: "div"
      },
      submit: {
        selector: "button.elem-button-primary",
        tag: "button",
        type: "submit"
      }
    }
  },
  {
    station: "Champagny en Vanoise",
    url: "https://www.laplagneresort.com/",
    host: "www.laplagneresort.com",
    controls: {
      station: {
        selector: "div.custom-select__placeholder",
        tag: "div"
      },
      checkIn: {
        selector: "input.elem-custom-input.open-datepicker",
        tag: "input",
        type: "text",
        placeholder: "Date de départ"
      },
      duration: {
        selector: "div.custom-select__placeholder",
        tag: "div"
      },
      submit: {
        selector: "button.elem-button-primary",
        tag: "button",
        type: "submit"
      }
    }
  },
  {
    station: "Plagne Montalbert",
    url: "https://www.laplagneresort.com/",
    host: "www.laplagneresort.com",
    controls: {
      station: {
        selector: "div.custom-select__placeholder",
        tag: "div"
      },
      checkIn: {
        selector: "input.elem-custom-input.open-datepicker",
        tag: "input",
        type: "text",
        placeholder: "Date de départ"
      },
      duration: {
        selector: "div.custom-select__placeholder",
        tag: "div"
      },
      submit: {
        selector: "button.elem-button-primary",
        tag: "button",
        type: "submit"
      }
    }
  },
  {
    station: "Montchavin les Coches",
    url: "https://www.laplagneresort.com/",
    host: "www.laplagneresort.com",
    controls: {
      station: {
        selector: "div.custom-select__placeholder",
        tag: "div"
      },
      checkIn: {
        selector: "input.elem-custom-input.open-datepicker",
        tag: "input",
        type: "text",
        placeholder: "Date de départ"
      },
      duration: {
        selector: "div.custom-select__placeholder",
        tag: "div"
      },
      submit: {
        selector: "button.elem-button-primary",
        tag: "button",
        type: "submit"
      }
    }
  },
  {
    station: "Plagne 1800",
    url: "https://www.laplagneresort.com/",
    host: "www.laplagneresort.com",
    controls: {
      station: {
        selector: "div.custom-select__placeholder",
        tag: "div"
      },
      checkIn: {
        selector: "input.elem-custom-input.open-datepicker",
        tag: "input",
        type: "text",
        placeholder: "Date de départ"
      },
      duration: {
        selector: "div.custom-select__placeholder",
        tag: "div"
      },
      submit: {
        selector: "button.elem-button-primary",
        tag: "button",
        type: "submit"
      }
    }
  },
  {
    station: "Plagne Bellecote",
    url: "https://www.laplagneresort.com/",
    host: "www.laplagneresort.com",
    controls: {
      station: {
        selector: "div.custom-select__placeholder",
        tag: "div"
      },
      checkIn: {
        selector: "input.elem-custom-input.open-datepicker",
        tag: "input",
        type: "text",
        placeholder: "Date de départ"
      },
      duration: {
        selector: "div.custom-select__placeholder",
        tag: "div"
      },
      submit: {
        selector: "button.elem-button-primary",
        tag: "button",
        type: "submit"
      }
    }
  },
  {
    station: "Plagne Centre",
    url: "https://www.laplagneresort.com/",
    host: "www.laplagneresort.com",
    controls: {
      station: {
        selector: "div.custom-select__placeholder",
        tag: "div"
      },
      checkIn: {
        selector: "input.elem-custom-input.open-datepicker",
        tag: "input",
        type: "text",
        placeholder: "Date de départ"
      },
      duration: {
        selector: "div.custom-select__placeholder",
        tag: "div"
      },
      submit: {
        selector: "button.elem-button-primary",
        tag: "button",
        type: "submit"
      }
    }
  },
  {
    station: "Plagne Soleil",
    url: "https://www.laplagneresort.com/",
    host: "www.laplagneresort.com",
    controls: {
      station: {
        selector: "div.custom-select__placeholder",
        tag: "div"
      },
      checkIn: {
        selector: "input.elem-custom-input.open-datepicker",
        tag: "input",
        type: "text",
        placeholder: "Date de départ"
      },
      duration: {
        selector: "div.custom-select__placeholder",
        tag: "div"
      },
      submit: {
        selector: "button.elem-button-primary",
        tag: "button",
        type: "submit"
      }
    }
  },
  {
    station: "Plagne Villages",
    url: "https://www.laplagneresort.com/",
    host: "www.laplagneresort.com",
    controls: {
      station: {
        selector: "div.custom-select__placeholder",
        tag: "div"
      },
      checkIn: {
        selector: "input.elem-custom-input.open-datepicker",
        tag: "input",
        type: "text",
        placeholder: "Date de départ"
      },
      duration: {
        selector: "div.custom-select__placeholder",
        tag: "div"
      },
      submit: {
        selector: "button.elem-button-primary",
        tag: "button",
        type: "submit"
      }
    }
  },
  {
    station: "Les Hameaux de la Roche",
    url: "https://www.laplagneresort.com/",
    host: "www.laplagneresort.com",
    controls: {
      station: {
        selector: "div.custom-select__placeholder",
        tag: "div"
      },
      checkIn: {
        selector: "input.elem-custom-input.open-datepicker",
        tag: "input",
        type: "text",
        placeholder: "Date de départ"
      },
      duration: {
        selector: "div.custom-select__placeholder",
        tag: "div"
      },
      submit: {
        selector: "button.elem-button-primary",
        tag: "button",
        type: "submit"
      }
    }
  },
  {
    station: "Vallée",
    url: "https://www.laplagneresort.com/",
    host: "www.laplagneresort.com",
    controls: {
      station: {
        selector: "div.custom-select__placeholder",
        tag: "div"
      },
      checkIn: {
        selector: "input.elem-custom-input.open-datepicker",
        tag: "input",
        type: "text",
        placeholder: "Date de départ"
      },
      duration: {
        selector: "div.custom-select__placeholder",
        tag: "div"
      },
      submit: {
        selector: "button.elem-button-primary",
        tag: "button",
        type: "submit"
      }
    }
  },
  {
    station: "La Rosière",
    url: "https://reservation.larosiere.net/",
    host: "reservation.larosiere.net",
    controls: {
      lodging: {
        selector: 'select[name="type_prestataire"]',
        tag: "select",
        name: "type_prestataire",
        options: [
          { value: "G", label: "Appartement, Chalet, Résidence" },
          { value: "H", label: "Hôtel" }
        ]
      },
      checkIn: {
        selector: "input.datepicker",
        tag: "input",
        type: "text",
        placeholder: "Choisir une date"
      },
      checkOut: {
        selector: "input.datepicker",
        tag: "input",
        type: "text",
        placeholder: "Choisir une date"
      },
      guests: {
        selector: 'button[type="button"]',
        tag: "button",
        type: "button"
      },
      submit: {
        selector: 'input[name="search"]',
        tag: "input",
        name: "search",
        type: "button"
      }
    }
  },
  {
    station: "Les Karellis",
    url: "https://www.karellis.com/",
    host: "www.karellis.com",
    controls: {
      checkIn: {
        selector: 'input[name="sqs_date_range_begin"]',
        tag: "input",
        name: "sqs_date_range_begin",
        type: "hidden"
      },
      checkOut: {
        selector: 'input[name="sqs_date_range_end"]',
        tag: "input",
        name: "sqs_date_range_end",
        type: "hidden"
      },
      guests: {
        selector: "div#sqs_personnes_content",
        tag: "div"
      },
      submit: {
        selector: "button#submitForm",
        tag: "button",
        type: "submit"
      }
    }
  },
  {
    station: "Les Saisies",
    url: "https://reservation.lessaisies.com/",
    host: "reservation.lessaisies.com",
    controls: {
      stayType: {
        selector: 'select[name="type_date"]',
        tag: "select",
        name: "type_date",
        options: [
          { value: "SS", label: "Du samedi au samedi" },
          { value: "DD", label: "Du dimanche au dimanche" },
          { value: "LL", label: "Arrivée libre" },
          { value: "NOEL", label: "Noël, Jour de l'An" }
        ]
      },
      checkIn: {
        selector: 'select[name="datedeb"]',
        tag: "select",
        name: "datedeb"
      },
      duration: {
        selector: 'select[name="duree"]',
        tag: "select",
        name: "duree",
        options: [
          { value: "7", label: "1 semaine" },
          { value: "14", label: "2 semaines" },
          { value: "21", label: "3 semaines" },
          { value: "28", label: "4 semaines" }
        ]
      },
      guests: {
        selector: 'select[name="adultes"]',
        tag: "select",
        name: "adultes",
        options: [
          { value: "1", label: "1 adulte" },
          { value: "2", label: "2 adultes" },
          { value: "3", label: "3 adultes" },
          { value: "4", label: "4 adultes" },
          { value: "5", label: "5 adultes" },
          { value: "6", label: "6 adultes" },
          { value: "7", label: "7 adultes" },
          { value: "8", label: "8 adultes" },
          { value: "9", label: "9 adultes" },
          { value: "10", label: "10 adultes" },
          { value: "11", label: "11 adultes" },
          { value: "12", label: "12 adultes" },
          { value: "13", label: "13 adultes" },
          { value: "14", label: "14 adultes" },
          { value: "15", label: "15 adultes" },
          { value: "16", label: "16 adultes" },
          { value: "17", label: "17 adultes" },
          { value: "18", label: "18 adultes" },
          { value: "19", label: "19 adultes" },
          { value: "20", label: "20 adultes" }
        ]
      },
      submit: {
        selector: 'input[name="search"]',
        tag: "input",
        name: "search",
        type: "button"
      }
    }
  },
  {
    station: "Pralognan la Vanoise",
    url: "https://www.reservationpralognan.fr/",
    host: "www.reservationpralognan.fr",
    controls: {
      checkIn: {
        selector: 'input[name="startDate"]',
        tag: "input",
        name: "startDate",
        type: "text",
        placeholder: "Date d'arrivée"
      },
      checkOut: {
        selector: 'input[name="endDate"]',
        tag: "input",
        name: "endDate",
        type: "text",
        placeholder: "Date de départ"
      },
      guests: {
        selector: "div.SearchBox_Elem_Title",
        tag: "div"
      },
      submit: {
        selector: "a.btn.btn-secondary",
        tag: "a"
      }
    }
  },
  {
    station: "Saint François Longchamp",
    url: "https://reservation.saintfrancoislongchamp.com/",
    host: "reservation.saintfrancoislongchamp.com",
    controls: {
      checkIn: {
        selector: "input.input_field__6J6T4",
        tag: "input",
        type: "text",
        placeholder: "Date d'arrivée"
      },
      checkOut: {
        selector: "input.input_field__6J6T4",
        tag: "input",
        type: "text",
        placeholder: "Date de départ"
      },
      guests: {
        selector: "input.input_field__6J6T4",
        tag: "input",
        type: "text",
        placeholder: "1 adulte"
      },
      submit: {
        selector: "button.button_button__cl3hC.search-filters__submit.button_iconOnly__0LkKw",
        tag: "button",
        type: "submit"
      }
    }
  },
  {
    station: "Saint Martin de Belleville",
    url: "https://fr.locationsaintmartin.com/",
    host: "fr.locationsaintmartin.com",
    controls: {
      checkIn: {
        selector: "input.datepicker",
        tag: "input",
        type: "text",
        placeholder: "Choisir une date"
      },
      checkOut: {
        selector: "input.datepicker",
        tag: "input",
        type: "text",
        placeholder: "Choisir une date"
      },
      guests: {
        selector: 'button[type="button"]',
        tag: "button",
        type: "button"
      },
      submit: {
        selector: 'input[name="search"]',
        tag: "input",
        name: "search",
        type: "button"
      }
    }
  },
  {
    station: "Sainte-Foy Tarentaise",
    url: "https://www.saintefoy-reservation.com/fr/",
    host: "www.saintefoy-reservation.com",
    controls: {
      checkIn: {
        selector: "input.input_field__6J6T4",
        tag: "input",
        type: "text",
        placeholder: "Date d'arrivée"
      },
      checkOut: {
        selector: "input.input_field__6J6T4",
        tag: "input",
        type: "text",
        placeholder: "Date de départ"
      },
      guests: {
        selector: "input.input_field__6J6T4",
        tag: "input",
        type: "text",
        placeholder: "1 adulte"
      },
      submit: {
        selector: "button.button_button__cl3hC.search-filters__submit.button_iconOnly__0LkKw",
        tag: "button",
        type: "submit"
      }
    }
  },
  {
    station: "Val Cenis",
    url: "https://reservation.haute-maurienne-vanoise.com/ac57-val-cenis.htm",
    host: "reservation.haute-maurienne-vanoise.com",
    controls: {
      checkIn: {
        selector: 'input[name="datearrivee"]',
        tag: "input",
        name: "datearrivee",
        type: "text",
        placeholder: "jj/mm/aaaa"
      },
      checkOut: {
        selector: 'input[name="datedepart"]',
        tag: "input",
        name: "datedepart",
        type: "text",
        placeholder: "jj/mm/aaaa"
      },
      guests: {
        selector: 'select[name="nbpers"]',
        tag: "select",
        name: "nbpers",
        options: [
          { value: "1", label: "Indifférent" },
          { value: "1", label: "1" },
          { value: "2", label: "2" },
          { value: "3", label: "3" },
          { value: "4", label: "4" },
          { value: "5", label: "5" },
          { value: "6", label: "6" },
          { value: "7", label: "7" },
          { value: "8", label: "8" },
          { value: "9", label: "9" },
          { value: "10", label: "10" },
          { value: "12", label: "12 personnes et +" }
        ]
      },
      submit: {
        selector: null,
        tag: "span",
        raw: "<span>Rechercher</span>"
      }
    }
  },
  {
    station: "Valloire",
    url: "https://www.valloire.com/",
    host: "www.valloire.com",
    controls: {
      stayType: {
        selector: 'select[name="type_date"]',
        tag: "select",
        name: "type_date",
        options: [
          { value: "SS", label: "Du samedi au samedi" },
          { value: "DD", label: "Du dimanche au dimanche" },
          { value: "LL", label: "Week-end et dates libres" }
        ]
      },
      checkIn: {
        selector: 'select[name="datedeb"]',
        tag: "select",
        name: "datedeb"
      },
      duration: {
        selector: 'select[name="duree"]',
        tag: "select",
        name: "duree",
        options: [
          { value: "7", label: "1 semaine" },
          { value: "14", label: "2 semaines" },
          { value: "21", label: "3 semaines" },
          { value: "28", label: "4 semaines" }
        ]
      },
      guests: {
        selector: 'select[name="personnes"]',
        tag: "select",
        name: "personnes",
        options: [
          { value: "1", label: "1 personne" },
          { value: "2", label: "2 personnes" },
          { value: "3", label: "3 personnes" },
          { value: "4", label: "4 personnes" },
          { value: "5", label: "5 personnes" },
          { value: "6", label: "6 personnes" },
          { value: "7", label: "7 personnes" },
          { value: "8", label: "8 personnes" },
          { value: "9", label: "9 personnes" },
          { value: "10", label: "10 personnes" },
          { value: "11P", label: "11 personnes et +" }
        ]
      },
      submit: {
        selector: 'input[name="search"]',
        tag: "input",
        name: "search",
        type: "button"
      }
    }
  },
  {
    station: "Valmeinier",
    url: "https://www.valmeinier-reservation.com/hiver",
    host: "www.valmeinier-reservation.com",
    controls: {
      checkIn: {
        selector: 'select[name="datedeb"]',
        tag: "select",
        name: "datedeb"
      },
      duration: {
        selector: 'select[name="duree"]',
        tag: "select",
        name: "duree",
        options: [
          { value: "7", label: "1 semaine" },
          { value: "14", label: "2 semaines" },
          { value: "21", label: "3 semaines" },
          { value: "28", label: "4 semaines" }
        ]
      },
      guests: {
        selector: 'select[name="personnes"]',
        tag: "select",
        name: "personnes",
        options: [
          { value: "2", label: "2 personnes" },
          { value: "3", label: "3 personnes" },
          { value: "4", label: "4 personnes" },
          { value: "5", label: "5 personnes" },
          { value: "6", label: "6 personnes" },
          { value: "7", label: "7 personnes" },
          { value: "8", label: "8 personnes" },
          { value: "9", label: "9 personnes" },
          { value: "10", label: "10 personnes" }
        ]
      },
      submit: {
        selector: 'input[name="search"]',
        tag: "input",
        name: "search",
        type: "button"
      }
    }
  },
  {
    station: "Valmorel",
    url: "https://www.valmorel.com/",
    host: "www.valmorel.com",
    controls: {
      station: {
        selector: "select.geos",
        tag: "select",
        options: [
          { value: "0", label: "Localisation" },
          { value: "1", label: "DOUCY" },
          { value: "2", label: "GRAND-AIGUEBLANCHE" },
          { value: "3", label: "VALMOREL" },
          { value: "4", label: "Crêve-coeur" },
          { value: "5", label: "Fontaine" },
          { value: "6", label: "La forêt" },
          { value: "7", label: "Le bois de la Croix" },
          { value: "8", label: "Le Bourg" },
          { value: "9", label: "Le Mottet" },
          { value: "10", label: "Planchamp" },
          { value: "11", label: "La Charmette" },
          { value: "12", label: "Le Crey" },
          { value: "13", label: "Le Pré" },
          { value: "14", label: "Les Avanchers" }
        ]
      },
      checkIn: {
        selector: "input#OsFiltrePick_0",
        tag: "input",
        type: "text"
      },
      checkOut: {
        selector: "input#OsFiltrePick_1",
        tag: "input",
        type: "text"
      },
      guests: {
        selector: "select.OsFiltreCombo.OsFiltreSelNbAdulte",
        tag: "select",
        options: [
          { value: "1", label: "1 adulte" },
          { value: "2", label: "2 adultes" },
          { value: "3", label: "3 adultes" },
          { value: "4", label: "4 adultes" },
          { value: "5", label: "5 adultes" },
          { value: "6", label: "6 adultes" },
          { value: "7", label: "7 adultes" },
          { value: "8", label: "8 adultes" },
          { value: "9", label: "9 adultes" },
          { value: "10", label: "10 adultes" },
          { value: "11", label: "11 adultes" },
          { value: "12", label: "12 adultes" },
          { value: "13", label: "13 adultes" },
          { value: "14", label: "14 adultes" },
          { value: "15", label: "15 adultes" }
        ]
      },
      submit: {
        selector: "a.OsFiltreBtnRecherche.OsBtnEnvoi",
        tag: "a"
      }
    }
  },
  {
    station: "Combloux",
    url: "https://reservation.combloux.com/?lang=fr_FR",
    host: "reservation.combloux.com",
    controls: {
      checkIn: {
        selector: null,
        tag: "input",
        raw: '<input placeholder="" readonly="" value="mar. 18 août">'
      },
      checkOut: {
        selector: null,
        tag: "input",
        raw: '<input placeholder="" readonly="" value="mer. 19 août">'
      },
      guests: {
        selector: "div.elem-custom-input.close",
        tag: "div"
      },
      submit: {
        selector: "button.elem-button-primary.search-engine-submit",
        tag: "button",
        type: "submit"
      }
    }
  },
  {
    station: "La Clusaz",
    url: "https://www.laclusaz.com/",
    host: "www.laclusaz.com",
    controls: {
      checkIn: {
        selector: 'input[name="dateFrom"]',
        tag: "input",
        name: "dateFrom",
        type: "text"
      },
      checkOut: {
        selector: 'input[name="dateTo"]',
        tag: "input",
        name: "dateTo",
        type: "text"
      },
      guests: {
        selector: null,
        tag: "span",
        raw: "<span>2</span>"
      },
      submit: {
        selector: "button.submit-btn.btn",
        tag: "button",
        type: "submit"
      }
    }
  },
  {
    station: "Alpe d'Huez Grand Domaine",
    url: "https://reservation.alpedhuez.com/?user-facet=winter",
    host: "reservation.alpedhuez.com",
    controls: {
      checkIn: {
        selector: "input.input_field__6J6T4",
        tag: "input",
        type: "text",
        placeholder: "Arrivée le..."
      },
      checkOut: {
        selector: "input.input_field__6J6T4",
        tag: "input",
        type: "text",
        placeholder: "Départ le..."
      },
      guests: {
        selector: "input.input_field__6J6T4",
        tag: "input",
        type: "text",
        placeholder: "1 adulte"
      },
      submit: {
        selector: "button.search-filters__submit",
        tag: "button",
        type: "submit"
      }
    }
  },
  {
    station: "Aussois",
    url: "https://reservation.haute-maurienne-vanoise.com/ac62-aussois.htm",
    host: "reservation.haute-maurienne-vanoise.com",
    controls: {
      checkIn: {
        selector: 'input[name="datearrivee"]',
        tag: "input",
        name: "datearrivee",
        type: "text",
        placeholder: "jj/mm/aaaa"
      },
      checkOut: {
        selector: 'input[name="datedepart"]',
        tag: "input",
        name: "datedepart",
        type: "text",
        placeholder: "jj/mm/aaaa"
      },
      guests: {
        selector: 'select[name="nbpers"]',
        tag: "select",
        name: "nbpers",
        options: [
          { value: "1", label: "Indifférent" },
          { value: "1", label: "1" },
          { value: "2", label: "2" },
          { value: "3", label: "3" },
          { value: "4", label: "4" },
          { value: "5", label: "5" },
          { value: "6", label: "6" },
          { value: "7", label: "7" },
          { value: "8", label: "8" },
          { value: "9", label: "9" },
          { value: "10", label: "10" },
          { value: "12", label: "12 personnes et +" }
        ]
      },
      submit: {
        selector: null,
        tag: "span",
        raw: "<span>Rechercher</span>"
      }
    }
  },
  {
    station: "Bonneval-sur-Arc",
    url: "https://reservation.haute-maurienne-vanoise.com/ac64-bonneval-sur-arc.htm",
    host: "reservation.haute-maurienne-vanoise.com",
    controls: {
      checkIn: {
        selector: 'input[name="datearrivee"]',
        tag: "input",
        name: "datearrivee",
        type: "text",
        placeholder: "jj/mm/aaaa"
      },
      checkOut: {
        selector: 'input[name="datedepart"]',
        tag: "input",
        name: "datedepart",
        type: "text",
        placeholder: "jj/mm/aaaa"
      },
      guests: {
        selector: 'select[name="nbpers"]',
        tag: "select",
        name: "nbpers",
        options: [
          { value: "1", label: "Indifférent" },
          { value: "1", label: "1" },
          { value: "2", label: "2" },
          { value: "3", label: "3" },
          { value: "4", label: "4" },
          { value: "5", label: "5" },
          { value: "6", label: "6" },
          { value: "7", label: "7" },
          { value: "8", label: "8" },
          { value: "9", label: "9" },
          { value: "10", label: "10" },
          { value: "12", label: "12 personnes et +" }
        ]
      },
      submit: {
        selector: null,
        tag: "span",
        raw: "<span>Rechercher</span>"
      }
    }
  },
  {
    station: "Courchevel",
    url: "https://reservation.courchevel.com/?lang=fr_FR",
    host: "reservation.courchevel.com",
    controls: {
      checkIn: {
        selector: "input.datepicker",
        tag: "input",
        type: "text",
        placeholder: "Choisir une date"
      },
      checkOut: {
        selector: "input.datepicker",
        tag: "input",
        type: "text",
        placeholder: "Choisir une date"
      },
      guests: {
        selector: 'button[type="button"]',
        tag: "button",
        type: "button"
      },
      submit: {
        selector: 'input[name="search"]',
        tag: "input",
        name: "search",
        type: "button"
      }
    }
  },
  {
    station: "Les Trois Vallées",
    url: "https://fr.locationlesmenuires.com/",
    host: "fr.locationlesmenuires.com",
    controls: {
      checkIn: {
        selector: "input.datepicker",
        tag: "input",
        type: "text",
        placeholder: "Choisir une date"
      },
      checkOut: {
        selector: "input.datepicker",
        tag: "input",
        type: "text",
        placeholder: "Choisir une date"
      },
      guests: {
        selector: 'button[type="button"]',
        tag: "button",
        type: "button"
      },
      submit: {
        selector: 'input[name="search"]',
        tag: "input",
        name: "search",
        type: "button"
      }
    }
  },
  {
    station: "Les Trois Vallées",
    url: "https://reservations.meribel.net/?lang=fr_FR&mtm_campaign=bouton_reservation&mtm_source=sticky_menu&mtm_medium=cta_site&_gl=1*n5v1n8*_gcl_au*MTIxOTgxNTY2Ni4xNzg2ODgwMjcw*FPAU*MTI5MzE4NjQ0LjE3ODY4ODAyNzE.&pk_vid=ff8cafc98168075017868802749ba7a4",
    host: "reservations.meribel.net",
    controls: {
      checkIn: {
        selector: null,
        tag: "input",
        raw: '<input placeholder="" readonly="" value="sam. 22 août">'
      },
      checkOut: {
        selector: null,
        tag: "input",
        raw: '<input placeholder="" readonly="" value="dim. 23 août">'
      },
      guests: {
        selector: "div.elem-custom-input.close",
        tag: "div"
      },
      submit: {
        selector: "button.elem-button-primary.search-engine-submit",
        tag: "button",
        type: "submit"
      }
    }
  },
  {
    station: "Les Trois Vallées",
    url: "https://reservation.valthorens.com/",
    host: "reservation.valthorens.com",
    controls: {
      stayType: {
        selector: 'select[name="type_date"]',
        tag: "select",
        name: "type_date"
      },
      checkIn: {
        selector: 'select[name="datedeb"]',
        tag: "select",
        name: "datedeb"
      },
      duration: {
        selector: 'select[name="duree"]',
        tag: "select",
        name: "duree",
        options: [
          { value: "7", label: "1 semaine" },
          { value: "14", label: "2 semaines" },
          { value: "21", label: "3 semaines" },
          { value: "28", label: "4 semaines" },
          { value: "35", label: "5 semaines" }
        ]
      },
      guests: {
        selector: 'select[name="personnes"]',
        tag: "select",
        name: "personnes",
        options: [
          { value: "1", label: "1 personne" },
          { value: "2", label: "2 personnes" },
          { value: "3", label: "3 personnes" },
          { value: "4", label: "4 personnes" },
          { value: "5", label: "5 personnes" },
          { value: "6", label: "6 personnes" },
          { value: "7", label: "7 personnes" },
          { value: "8", label: "8 personnes" },
          { value: "9", label: "9 personnes" },
          { value: "10", label: "10 personnes" },
          { value: "11", label: "11 personnes" },
          { value: "12", label: "12 personnes" },
          { value: "13", label: "13 personnes" },
          { value: "14", label: "14 personnes" },
          { value: "15", label: "15 personnes" },
          { value: "16", label: "16 personnes" },
          { value: "17", label: "17 personnes" },
          { value: "18", label: "18 personnes" },
          { value: "19", label: "19 personnes" },
          { value: "20", label: "20 personnes" }
        ]
      },
      submit: {
        selector: 'input[name="search"]',
        tag: "input",
        name: "search",
        type: "button"
      }
    }
  },
  {
    station: "Les Sybelles",
    url: "https://reservation.la-toussuire.com/z14220_fr-.aspx",
    host: "reservation.la-toussuire.com",
    controls: {
      checkIn: {
        selector: "input#OsFiltrePick_0",
        tag: "input",
        type: "text"
      },
      checkOut: {
        selector: "input#OsFiltrePick_1",
        tag: "input",
        type: "text"
      },
      guests: {
        selector: "select.OsFiltreCombo.OsFiltreSelNbAdulte",
        tag: "select",
        options: [
          { value: "1", label: "1 adulte" },
          { value: "2", label: "2 adultes" },
          { value: "3", label: "3 adultes" },
          { value: "4", label: "4 adultes" },
          { value: "5", label: "5 adultes" },
          { value: "6", label: "6 adultes" },
          { value: "7", label: "7 adultes" },
          { value: "8", label: "8 adultes" },
          { value: "9", label: "9 adultes" },
          { value: "10", label: "10 adultes" },
          { value: "11", label: "11 adultes" },
          { value: "12", label: "12 adultes" },
          { value: "13", label: "13 adultes" },
          { value: "14", label: "14 adultes" },
          { value: "15", label: "15 adultes" }
        ]
      },
      submit: {
        selector: "a.OsFiltreBtnRecherche.OsBtnEnvoi",
        tag: "a"
      }
    }
  },
  {
    station: "Les Sybelles",
    url: "https://www.saintsorlindarves.com/hebergements/reservation",
    host: "www.saintsorlindarves.com",
    controls: {
      checkIn: {
        selector: "input#OsFiltrePick_0",
        tag: "input",
        type: "text"
      },
      checkOut: {
        selector: "input#OsFiltrePick_1",
        tag: "input",
        type: "text"
      },
      guests: {
        selector: "select.OsFiltreCombo.OsFiltreSelNbAdulte",
        tag: "select",
        options: [
          { value: "1", label: "1 adulte" },
          { value: "2", label: "2 adultes" },
          { value: "3", label: "3 adultes" },
          { value: "4", label: "4 adultes" },
          { value: "5", label: "5 adultes" },
          { value: "6", label: "6 adultes" },
          { value: "7", label: "7 adultes" },
          { value: "8", label: "8 adultes" },
          { value: "9", label: "9 adultes" },
          { value: "10", label: "10 adultes" },
          { value: "11", label: "11 adultes" },
          { value: "12", label: "12 adultes" },
          { value: "13", label: "13 adultes" },
          { value: "14", label: "14 adultes" },
          { value: "15", label: "15 adultes" }
        ]
      },
      submit: {
        selector: "a.OsFiltreBtnRecherche.OsBtnEnvoi",
        tag: "a"
      }
    }
  },
  {
    station: "Les Arcs",
    url: "https://www.peisey-vallandry.com/",
    host: "www.peisey-vallandry.com",
    controls: {
      lodging: {
        selector: "li#nav-btn-HEBERGEMENT",
        tag: "li"
      },
      checkIn: {
        selector: "input.datepicker",
        tag: "input",
        type: "text",
        placeholder: "Choisir une date"
      },
      checkOut: {
        selector: "input.datepicker",
        tag: "input",
        type: "text",
        placeholder: "Choisir une date"
      },
      guests: {
        selector: 'button[type="button"]',
        tag: "button",
        type: "button"
      },
      submit: {
        selector: 'input[name="search"]',
        tag: "input",
        name: "search",
        type: "button"
      }
    }
  },
  {
    station: "Tignes - Val d'Isère",
    url: "https://reservation.tignes.net/",
    host: "reservation.tignes.net",
    controls: {
      checkIn: {
        selector: "input.datepicker",
        tag: "input",
        type: "text",
        placeholder: "Choisir une date"
      },
      checkOut: {
        selector: "input.datepicker",
        tag: "input",
        type: "text",
        placeholder: "Choisir une date"
      },
      guests: {
        selector: 'button[type="button"]',
        tag: "button",
        type: "button"
      },
      submit: {
        selector: 'input[name="search"]',
        tag: "input",
        name: "search",
        type: "button"
      }
    }
  },
  {
    station: "Tignes - Val d'Isère",
    url: "https://reservation.valdisere.com/",
    host: "reservation.valdisere.com",
    controls: {
      checkIn: {
        selector: "input.datepicker",
        tag: "input",
        type: "text",
        placeholder: "Choisir une date"
      },
      checkOut: {
        selector: "input.datepicker",
        tag: "input",
        type: "text",
        placeholder: "Choisir une date"
      },
      guests: {
        selector: 'select[name="personnes"]',
        tag: "select",
        name: "personnes",
        options: [
          { value: "2", label: "2 personnes" },
          { value: "3", label: "3 personnes" },
          { value: "4", label: "4 personnes" },
          { value: "5", label: "5 personnes" },
          { value: "6", label: "6 personnes" },
          { value: "7", label: "7 personnes" },
          { value: "8", label: "8 personnes" },
          { value: "9", label: "9 personnes" },
          { value: "10", label: "10 personnes" },
          { value: "11P", label: "11 personnes et +" }
        ]
      },
      submit: {
        selector: 'input[name="search"]',
        tag: "input",
        name: "search",
        type: "button"
      }
    }
  },
  {
    station: "Valfréjus",
    url: "https://www.valfrejus.com/",
    host: "www.valfrejus.com",
    controls: {
      checkIn: {
        selector: null,
        tag: "span",
        raw: "<span>Choisir les dates de mon séjour</span>"
      },
      guests: {
        selector: null,
        tag: "span",
        raw: "<span>Choisir un nombre de personnes</span>"
      },
      submit: {
        selector: "button.MotorAlliance-submit.Button-primary.__altimax_alliance_filters_btn",
        tag: "button"
      }
    }
  },
  {
    station: "Chamrousse",
    url: "https://www.chamrousse.com/hiver",
    host: "www.chamrousse.com",
    controls: {
      stayType: {
        selector: 'select[name="type_date"]',
        tag: "select",
        name: "type_date",
        options: [
          { value: "SS", label: "Du samedi au samedi" },
          { value: "DD", label: "Du dimanche au dimanche" },
          { value: "LL", label: "Autres dates" }
        ]
      },
      checkIn: {
        selector: 'select[name="datedeb"]',
        tag: "select",
        name: "datedeb"
      },
      duration: {
        selector: 'select[name="duree"]',
        tag: "select",
        name: "duree",
        options: [
          { value: "7", label: "1 semaine" },
          { value: "14", label: "2 semaines" },
          { value: "21", label: "3 semaines" },
          { value: "28", label: "4 semaines" }
        ]
      },
      guests: {
        selector: 'select[name="personnes"]',
        tag: "select",
        name: "personnes",
        options: [
          { value: "1", label: "1 personne" },
          { value: "2", label: "2 personnes" },
          { value: "3", label: "3 personnes" },
          { value: "4", label: "4 personnes" },
          { value: "5", label: "5 personnes" },
          { value: "6", label: "6 personnes" },
          { value: "7", label: "7 personnes" },
          { value: "8", label: "8 personnes" },
          { value: "9", label: "9 personnes" },
          { value: "10", label: "10 personnes" },
          { value: "12", label: "12 personnes" },
          { value: "14", label: "14 personnes" },
          { value: "16", label: "16 personnes" }
        ]
      },
      submit: {
        selector: 'input[name="search"]',
        tag: "input",
        name: "search",
        type: "button"
      }
    }
  },
  {
    station: "Le Collet d'Allevard",
    url: "https://reservation.lecollet.com/",
    host: "reservation.lecollet.com",
    controls: {
      stayType: {
        selector: 'select[name="type_date"]',
        tag: "select",
        name: "type_date",
        options: [
          { value: "SS", label: "Du samedi au samedi" },
          { value: "DD", label: "Du dimanche au dimanche" },
          { value: "LL", label: "Week-end et court séjour" }
        ]
      },
      checkIn: {
        selector: 'select[name="datedeb"]',
        tag: "select",
        name: "datedeb"
      },
      duration: {
        selector: 'select[name="duree"]',
        tag: "select",
        name: "duree",
        options: [
          { value: "7", label: "1 semaine" },
          { value: "14", label: "2 semaines" },
          { value: "21", label: "3 semaines" },
          { value: "28", label: "4 semaines" },
          { value: "35", label: "5 semaines" }
        ]
      },
      guests: {
        selector: 'select[name="adultes"]',
        tag: "select",
        name: "adultes",
        options: [
          { value: "1", label: "1 adulte" },
          { value: "2", label: "2 adultes" },
          { value: "3", label: "3 adultes" },
          { value: "4", label: "4 adultes" },
          { value: "5", label: "5 adultes" },
          { value: "6", label: "6 adultes" },
          { value: "7", label: "7 adultes" },
          { value: "8", label: "8 adultes" },
          { value: "9", label: "9 adultes" },
          { value: "10", label: "10 adultes" },
          { value: "11", label: "11 adultes" },
          { value: "12", label: "12 adultes" },
          { value: "13", label: "13 adultes" },
          { value: "14", label: "14 adultes" },
          { value: "15", label: "15 adultes" },
          { value: "16", label: "16 adultes" }
        ]
      },
      submit: {
        selector: 'input[name="search"]',
        tag: "input",
        name: "search",
        type: "button"
      }
    }
  },
  {
    station: "Isola 2000",
    url: "https://isola2000.com/reservez-votre-sejour/#/lodgings",
    host: "isola2000.com",
    controls: {},
    notes: "Formulaire SPA / non inspecté — contrôles vides"
  },
  {
    station: "Dévoluy",
    url: "https://reservation.ledevoluy.com/",
    host: "reservation.ledevoluy.com",
    controls: {
      checkIn: {
        selector: "input#OsFiltrePick_0",
        tag: "input",
        type: "text"
      },
      checkOut: {
        selector: "input#OsFiltrePick_1",
        tag: "input",
        type: "text"
      },
      guests: {
        selector: "select.OsFiltreCombo.OsFiltreSelNbAdulte",
        tag: "select",
        options: [
          { value: "1", label: "1 adulte" },
          { value: "2", label: "2 adultes" },
          { value: "3", label: "3 adultes" },
          { value: "4", label: "4 adultes" },
          { value: "5", label: "5 adultes" },
          { value: "6", label: "6 adultes" },
          { value: "7", label: "7 adultes" },
          { value: "8", label: "8 adultes" },
          { value: "9", label: "9 adultes" },
          { value: "10", label: "10 adultes" },
          { value: "11", label: "11 adultes" },
          { value: "12", label: "12 adultes" },
          { value: "13", label: "13 adultes" },
          { value: "14", label: "14 adultes" },
          { value: "15", label: "15 adultes" }
        ]
      },
      submit: {
        selector: "a.OsFiltreBtnRecherche.OsBtnEnvoi",
        tag: "a"
      }
    }
  },
  {
    station: "Orcières Merlette",
    url: "https://reservation.orcieres.com/",
    host: "reservation.orcieres.com",
    controls: {
      checkIn: {
        selector: "input.datepicker",
        tag: "input",
        type: "text",
        placeholder: "Choisir une date"
      },
      checkOut: {
        selector: "input.datepicker",
        tag: "input",
        type: "text",
        placeholder: "Choisir une date"
      },
      guests: {
        selector: 'button[type="button"]',
        tag: "button",
        type: "button"
      },
      submit: {
        selector: 'input[name="search"]',
        tag: "input",
        name: "search",
        type: "button"
      }
    }
  },
  {
    station: "Forêt Blanche : Vars/Risoul",
    url: "https://www.risoul.com/reserver.html",
    host: "www.risoul.com",
    controls: {
      stayType: {
        selector: 'select[name="type_date"]',
        tag: "select",
        name: "type_date",
        options: [
          { value: "SS", label: "Du samedi au samedi" },
          { value: "LL", label: "Weekends, courts séjours, Autres Dates" }
        ]
      },
      checkIn: {
        selector: 'select[name="datedeb"]',
        tag: "select",
        name: "datedeb"
      },
      duration: {
        selector: 'select[name="duree"]',
        tag: "select",
        name: "duree",
        options: [
          { value: "7", label: "1 semaine" },
          { value: "14", label: "2 semaines" },
          { value: "21", label: "3 semaines" },
          { value: "28", label: "4 semaines" }
        ]
      },
      guests: {
        selector: 'select[name="personnes"]',
        tag: "select",
        name: "personnes",
        options: [
          { value: "1", label: "1 personne" },
          { value: "2", label: "2 personnes" },
          { value: "3", label: "3 personnes" },
          { value: "4", label: "4 personnes" },
          { value: "5", label: "5 personnes" },
          { value: "6", label: "6 personnes" },
          { value: "7", label: "7 personnes" },
          { value: "8", label: "8 personnes" },
          { value: "9", label: "9 personnes" },
          { value: "10", label: "10 personnes" },
          { value: "11", label: "11 personnes" },
          { value: "12", label: "12 personnes" },
          { value: "13", label: "13 personnes" },
          { value: "14", label: "14 personnes" },
          { value: "15", label: "15 personnes" },
          { value: "16", label: "16 personnes" },
          { value: "17", label: "17 personnes" },
          { value: "18", label: "18 personnes" },
          { value: "19", label: "19 personnes" },
          { value: "20", label: "20 personnes" }
        ]
      },
      submit: {
        selector: 'input[name="search"]',
        tag: "input",
        name: "search",
        type: "button"
      }
    }
  },
  {
    station: "Forêt Blanche : Vars/Risoul",
    url: "https://www.alpes-sudlocations.com/reservation-sejour-vars/",
    host: "www.alpes-sudlocations.com",
    controls: {
      checkIn: {
        selector: 'input[name="FieldDate"]',
        tag: "input",
        name: "FieldDate",
        type: "text",
        placeholder: "Date"
      },
      duration: {
        selector: 'select[name="FieldDuration"]',
        tag: "select",
        name: "FieldDuration"
      },
      guests: {
        selector: 'input[name="tbResumeCapa"]',
        tag: "input",
        name: "tbResumeCapa",
        type: "text"
      },
      submit: {
        selector: "button#BtnLaunchBooking",
        tag: "button",
        type: "button"
      }
    }
  },
  {
    station: "Valberg",
    url: "https://www.valberg.com/sejourner/reserver-votre-sejour/#/lodgings",
    host: "www.valberg.com",
    controls: {},
    notes: "Formulaire SPA / non inspecté — contrôles vides"
  },
  {
    station: "Les Orres",
    url: "https://reservation.lesorres.com/",
    host: "reservation.lesorres.com",
    controls: {
      checkIn: {
        selector: "input.datepicker",
        tag: "input",
        type: "text",
        placeholder: "Choisir une date"
      },
      checkOut: {
        selector: "input.datepicker",
        tag: "input",
        type: "text",
        placeholder: "Choisir une date"
      },
      guests: {
        selector: 'button[type="button"]',
        tag: "button",
        type: "button"
      },
      submit: {
        selector: 'input[name="search"]',
        tag: "input",
        name: "search",
        type: "button"
      }
    }
  },
  {
    station: "Montgenèvre",
    url: "https://reservation.montgenevre.com/",
    host: "reservation.montgenevre.com",
    controls: {
      station: {
        selector: "select.geos",
        tag: "select",
        options: [
          { value: "0", label: "Sélectionner une localisation" },
          { value: "1", label: "Montgenèvre" },
          { value: "2", label: "Les Alberts" }
        ]
      },
      checkIn: {
        selector: "input#OsFiltrePick_0",
        tag: "input",
        type: "text"
      },
      checkOut: {
        selector: "input#OsFiltrePick_1",
        tag: "input",
        type: "text"
      },
      submit: {
        selector: "a.OsFiltreBtnRecherche.OsBtnEnvoi",
        tag: "a"
      }
    }
  },
  {
    station: "Les Alberts",
    url: "https://reservation.montgenevre.com/",
    host: "reservation.montgenevre.com",
    controls: {
      station: {
        selector: "select.geos",
        tag: "select",
        options: [
          { value: "0", label: "Sélectionner une localisation" },
          { value: "1", label: "Montgenèvre" },
          { value: "2", label: "Les Alberts" }
        ]
      },
      checkIn: {
        selector: "input#OsFiltrePick_0",
        tag: "input",
        type: "text"
      },
      checkOut: {
        selector: "input#OsFiltrePick_1",
        tag: "input",
        type: "text"
      },
      submit: {
        selector: "a.OsFiltreBtnRecherche.OsBtnEnvoi",
        tag: "a"
      }
    }
  },
  {
    station: "Puy-Saint-Vincent",
    url: "https://www.paysdesecrins.com/hebergements/#/lodgings",
    host: "www.paysdesecrins.com",
    controls: {},
    notes: "Formulaire SPA / non inspecté — contrôles vides"
  },
  {
    station: "Serre-Chevalier",
    url: "https://reservation.serre-chevalier.com/",
    host: "reservation.serre-chevalier.com",
    controls: {
      checkIn: {
        selector: "input.datepicker",
        tag: "input",
        type: "text",
        placeholder: "Choisir une date"
      },
      checkOut: {
        selector: "input.datepicker",
        tag: "input",
        type: "text",
        placeholder: "Choisir une date"
      },
      guests: {
        selector: 'button[type="button"]',
        tag: "button",
        type: "button"
      },
      submit: {
        selector: 'input[name="search"]',
        tag: "input",
        name: "search",
        type: "button"
      }
    }
  },
  {
    station: "Val d'Allos - La Foux",
    url: "https://www.valdallos.com/",
    host: "www.valdallos.com",
    controls: {
      stayType: {
        selector: 'select[name="type_date"]',
        tag: "select",
        name: "type_date",
        options: [
          { value: "SS", label: "Du samedi au samedi" },
          { value: "LL", label: "Week-end et court séjour" }
        ]
      },
      checkIn: {
        selector: 'select[name="datedeb"]',
        tag: "select",
        name: "datedeb"
      },
      duration: {
        selector: 'select[name="duree"]',
        tag: "select",
        name: "duree",
        options: [
          { value: "7", label: "1 semaine" },
          { value: "14", label: "2 semaines" },
          { value: "21", label: "3 semaines" },
          { value: "28", label: "4 semaines" }
        ]
      },
      guests: {
        selector: 'select[name="personnes"]',
        tag: "select",
        name: "personnes",
        options: [
          { value: "1", label: "1 personne" },
          { value: "2", label: "2 personnes" },
          { value: "3", label: "3 personnes" },
          { value: "4", label: "4 personnes" },
          { value: "5", label: "5 personnes" },
          { value: "6", label: "6 personnes" },
          { value: "7", label: "7 personnes" },
          { value: "8P", label: "8 personnes et +" }
        ]
      },
      submit: {
        selector: 'input[name="search"]',
        tag: "input",
        name: "search",
        type: "button"
      }
    }
  },
  {
    station: "Val d'Allos - Le Seignus",
    url: "https://www.valdallos.com/",
    host: "www.valdallos.com",
    controls: {
      stayType: {
        selector: 'select[name="type_date"]',
        tag: "select",
        name: "type_date",
        options: [
          { value: "SS", label: "Du samedi au samedi" },
          { value: "LL", label: "Week-end et court séjour" }
        ]
      },
      checkIn: {
        selector: 'select[name="datedeb"]',
        tag: "select",
        name: "datedeb"
      },
      duration: {
        selector: 'select[name="duree"]',
        tag: "select",
        name: "duree",
        options: [
          { value: "7", label: "1 semaine" },
          { value: "14", label: "2 semaines" },
          { value: "21", label: "3 semaines" },
          { value: "28", label: "4 semaines" }
        ]
      },
      guests: {
        selector: 'select[name="personnes"]',
        tag: "select",
        name: "personnes",
        options: [
          { value: "1", label: "1 personne" },
          { value: "2", label: "2 personnes" },
          { value: "3", label: "3 personnes" },
          { value: "4", label: "4 personnes" },
          { value: "5", label: "5 personnes" },
          { value: "6", label: "6 personnes" },
          { value: "7", label: "7 personnes" },
          { value: "8P", label: "8 personnes et +" }
        ]
      },
      submit: {
        selector: 'input[name="search"]',
        tag: "input",
        name: "search",
        type: "button"
      }
    }
  },
  {
    station: "Ax 3 Domaines",
    url: "https://reservation.ax-ski.com/",
    host: "reservation.ax-ski.com",
    controls: {
      station: {
        selector: "select.geos",
        tag: "select",
        options: [
          { value: "0", label: "Indifférent" },
          { value: "1", label: "Station Ax 3 Domaines" },
          { value: "2", label: "Village d'Ax-les-Thermes" },
          { value: "3", label: "Pyrénées Ariègoises" }
        ]
      },
      lodging: {
        selector: "select#SelectMoteur",
        tag: "select",
        options: [
          { value: "8269", label: "Tous les hébergements" },
          { value: "8270", label: "Hôtels" },
          { value: "8271", label: "Campings" },
          { value: "8272", label: "Location de vacances" },
          { value: "8273", label: "Villages vacances" },
          { value: "8274", label: "Résidences de Tourisme" },
          { value: "https://www.ax.ski/fr/forfaits-de-ski", label: "Forfaits de ski" }
        ]
      },
      checkIn: {
        selector: "input#OsFiltrePick_6",
        tag: "input",
        type: "text"
      },
      checkOut: {
        selector: "input#OsFiltrePick_7",
        tag: "input",
        type: "text"
      },
      submit: {
        selector: "a.OsFiltreBtnRecherche.OsBtnEnvoi",
        tag: "a"
      }
    }
  },
  {
    station: "Grand Tourmalet",
    url: "https://www.n-py.com/fr/ete/sejour-pyrenees/hebergement",
    host: "www.n-py.com",
    controls: {
      station: {
        selector: "span.station-label",
        tag: "span"
      },
      checkIn: {
        selector: "span.arrival",
        tag: "span"
      },
      checkOut: {
        selector: "span.departure",
        tag: "span"
      },
      guests: {
        selector: "div#person_counter",
        tag: "div"
      },
      submit: {
        selector: "input#search-form",
        tag: "input",
        type: "submit"
      }
    }
  },
  {
    station: "Les Angles",
    url: "https://lesangles.com/offres-hebergements/",
    host: "lesangles.com",
    controls: {},
    notes: "Formulaire SPA / non inspecté — contrôles vides"
  },
  {
    station: "Saint Lary",
    url: "https://resa.saintlary.com/",
    host: "resa.saintlary.com",
    controls: {
      stayType: {
        selector: 'select[name="type_date"]',
        tag: "select",
        name: "type_date",
        options: [
          { value: "SS", label: "Du samedi au samedi" },
          { value: "NOEL", label: "Cures thermales" },
          { value: "LL", label: "Week-end et court séjour" }
        ]
      },
      checkIn: {
        selector: 'select[name="datedeb"]',
        tag: "select",
        name: "datedeb"
      },
      duration: {
        selector: 'select[name="duree"]',
        tag: "select",
        name: "duree",
        options: [
          { value: "7", label: "1 semaine" },
          { value: "14", label: "2 semaines" },
          { value: "21", label: "3 semaines" },
          { value: "28", label: "4 semaines" }
        ]
      },
      guests: {
        selector: 'select[name="adultes"]',
        tag: "select",
        name: "adultes",
        options: [
          { value: "1", label: "1 adulte" },
          { value: "2", label: "2 adultes" },
          { value: "3", label: "3 adultes" },
          { value: "4", label: "4 adultes" },
          { value: "5", label: "5 adultes" },
          { value: "6", label: "6 adultes" },
          { value: "7", label: "7 adultes" },
          { value: "8", label: "8 adultes" },
          { value: "9", label: "9 adultes" },
          { value: "10", label: "10 adultes" },
          { value: "11", label: "11 adultes" },
          { value: "12", label: "12 adultes" },
          { value: "13", label: "13 adultes" },
          { value: "14", label: "14 adultes" }
        ]
      },
      submit: {
        selector: 'input[name="search"]',
        tag: "input",
        name: "search",
        type: "button"
      }
    }
  },
  {
    station: "Super Besse",
    url: "https://www.sancy.com/hebergement/",
    host: "www.sancy.com",
    controls: {
      checkIn: {
        selector: "input#lae-dispo-accueil-1-arrival",
        tag: "input",
        type: "date"
      },
      checkOut: {
        selector: "input#lae-dispo-accueil-1-departure",
        tag: "input",
        type: "date"
      },
      submit: {
        selector: "button.btn-reserver",
        tag: "button",
        type: "submit"
      }
    }
  },
  {
    station: "le Mont Dore",
    url: "https://www.sancy.com/hebergement/",
    host: "www.sancy.com",
    controls: {
      checkIn: {
        selector: "input#lae-dispo-accueil-1-arrival",
        tag: "input",
        type: "date"
      },
      checkOut: {
        selector: "input#lae-dispo-accueil-1-departure",
        tag: "input",
        type: "date"
      },
      submit: {
        selector: "button.btn-reserver",
        tag: "button",
        type: "submit"
      }
    }
  },
  {
    station: "La Bresse Hohneck",
    url: "https://www.labresse.net/hebergements-a-la-bresse-hautes-vosges/",
    host: "www.labresse.net",
    controls: {
      checkIn: {
        selector: 'input[name="opensystem_du"]',
        tag: "input",
        name: "opensystem_du",
        type: "text"
      },
      checkOut: {
        selector: 'input[name="opensystem_au"]',
        tag: "input",
        name: "opensystem_au",
        type: "text"
      },
      guests: {
        selector: 'input[name="opensystem_nbpers"]',
        tag: "input",
        name: "opensystem_nbpers",
        type: "number"
      },
      submit: {
        selector: "button.btn.btn-reserver.--btn-dark.--medium",
        tag: "button",
        type: "submit"
      }
    }
  },
  {
    station: "Saint Maurice sur Moselle",
    url: "https://www.ballons-hautes-vosges.com/",
    host: "www.ballons-hautes-vosges.com",
    controls: {
      stayType: {
        selector: 'select[name="type_date"]',
        tag: "select",
        name: "type_date",
        options: [
          { value: "SS", label: "Du samedi au samedi" },
          { value: "DD", label: "Du dimanche au dimanche" },
          { value: "LL", label: "Autres dates" },
          { value: "NOEL", label: "Noël et Nouvel An" }
        ]
      },
      checkIn: {
        selector: 'select[name="datedeb"]',
        tag: "select",
        name: "datedeb"
      },
      duration: {
        selector: 'select[name="duree"]',
        tag: "select",
        name: "duree",
        options: [
          { value: "7", label: "1 semaine" },
          { value: "14", label: "2 semaines" },
          { value: "21", label: "3 semaines" },
          { value: "28", label: "4 semaines" }
        ]
      },
      guests: {
        selector: 'select[name="adultes"]',
        tag: "select",
        name: "adultes",
        options: [
          { value: "1", label: "1 adulte (+ de 18ans)" },
          { value: "2", label: "2 adultes (+ de 18ans)" },
          { value: "3", label: "3 adultes (+ de 18ans)" },
          { value: "4", label: "4 adultes (+ de 18ans)" },
          { value: "5", label: "5 adultes (+ de 18ans)" },
          { value: "6", label: "6 adultes (+ de 18ans)" },
          { value: "7", label: "7 adultes (+ de 18ans)" },
          { value: "8", label: "8 adultes (+ de 18ans)" },
          { value: "9", label: "9 adultes (+ de 18ans)" },
          { value: "10", label: "10 adultes (+ de 18ans)" },
          { value: "11", label: "11 adultes (+ de 18ans)" },
          { value: "12", label: "12 adultes (+ de 18ans)" },
          { value: "13", label: "13 adultes (+ de 18ans)" },
          { value: "14", label: "14 adultes (+ de 18ans)" }
        ]
      },
      submit: {
        selector: 'input[name="search"]',
        tag: "input",
        name: "search",
        type: "button"
      }
    }
  },
  {
    station: "Gérardmer",
    url: "https://www.gerardmer-reservation.net/",
    host: "www.gerardmer-reservation.net",
    controls: {
      station: {
        selector: 'select[name="criteres[]"]',
        tag: "select",
        name: "criteres[]",
        options: [
          { value: "", label: "Toutes les Hautes-Vosges" },
          { value: "GGERARDMER|GERARDMERSEUL|G", label: "Gérardmer" },
          { value: "GGERARDMER|GERARDMER|G", label: "Gérardmer & Environ" }
        ]
      },
      stayType: {
        selector: 'select[name="type_date"]',
        tag: "select",
        name: "type_date",
        options: [
          { value: "SS", label: "Du samedi au samedi" },
          { value: "LL", label: "Week-end et court séjour" }
        ]
      },
      checkIn: {
        selector: 'select[name="datedeb"]',
        tag: "select",
        name: "datedeb"
      },
      duration: {
        selector: 'select[name="duree"]',
        tag: "select",
        name: "duree",
        options: [
          { value: "7", label: "1 semaine" },
          { value: "14", label: "2 semaines" },
          { value: "21", label: "3 semaines" },
          { value: "28", label: "4 semaines" }
        ]
      },
      guests: {
        selector: 'select[name="personnes"]',
        tag: "select",
        name: "personnes",
        options: [
          { value: "1", label: "1 personne" },
          { value: "2", label: "2 personnes" },
          { value: "3", label: "3 personnes" },
          { value: "4", label: "4 personnes" },
          { value: "5", label: "5 personnes" },
          { value: "6", label: "6 personnes" },
          { value: "7", label: "7 personnes" },
          { value: "8", label: "8 personnes" },
          { value: "9", label: "9 personnes" },
          { value: "10", label: "10 personnes" },
          { value: "11", label: "11 personnes" },
          { value: "12", label: "12 personnes" },
          { value: "13", label: "13 personnes" },
          { value: "14", label: "14 personnes" },
          { value: "15", label: "15 personnes" }
        ]
      },
      submit: {
        selector: 'input[name="search"]',
        tag: "input",
        name: "search",
        type: "button"
      }
    }
  },

  // ---------------------------------------------------------------------------
  // OTA — plateformes globales (recherche par localisation)
  // ---------------------------------------------------------------------------

  {
    station: "Airbnb",
    url: "https://www.airbnb.fr/",
    host: "www.airbnb.fr",
    kind: "ota",
    controls: {
      location: {
        selector: 'input[data-testid="structured-search-input-field-query"]',
        tag: "input",
        testId: "structured-search-input-field-query",
        placeholder: "Rechercher une destination"
      },
      checkIn: {
        selector: 'div[data-testid="structured-search-input-field-split-dates-0"]',
        tag: "div",
        testId: "structured-search-input-field-split-dates-0"
      },
      checkOut: {
        selector: 'div[data-testid="structured-search-input-field-split-dates-1"]',
        tag: "div",
        testId: "structured-search-input-field-split-dates-1"
      },
      guests: {
        selector: 'div[data-testid="structured-search-input-field-guests-button"]',
        tag: "div",
        testId: "structured-search-input-field-guests-button"
      },
      adults: {
        selector: 'button[data-testid="stepper-adults-increase-button"]',
        tag: "button",
        testId: "stepper-adults-increase-button"
      },
      children: {
        selector: 'button[data-testid="stepper-children-increase-button"]',
        tag: "button",
        testId: "stepper-children-increase-button"
      },
      infants: {
        selector: 'button[data-testid="stepper-infants-increase-button"]',
        tag: "button",
        testId: "stepper-infants-increase-button"
      },
      pets: {
        selector: 'button[data-testid="stepper-pets-increase-button"]',
        tag: "button",
        testId: "stepper-pets-increase-button"
      },
      submit: {
        selector: 'button[data-testid="structured-search-input-search-button"]',
        tag: "button",
        testId: "structured-search-input-search-button"
      },
      // Sélecteurs résultats (à valider / mettre à jour via recon)
      cards: {
        selector: 'div[data-testid="card-container"]',
        tag: "div",
        testId: "card-container"
      },
      title: {
        selector: 'div[data-testid="listing-card-title"]',
        tag: "div",
        testId: "listing-card-title"
      },
      price: {
        selector: 'span[data-testid="price-availability-row"]',
        tag: "span",
        testId: "price-availability-row"
      },
      link: {
        selector: 'a[data-testid="card-link"]',
        tag: "a",
        testId: "card-link"
      }
    },
    antiBot: {
      level: "high",
      preferBrowser: true,
      requireResidentialProxy: true,
      minDelayMs: 12_000,
      maxDelayMs: 28_000,
      maxConcurrency: 1,
      cooldownOnChallengeMs: 900_000,
      maxConsecutiveFailures: 2
    },
    notes:
      "OTA globale. Rechercher avec le nom de la station + pays (ex. « Chamonix, France »). " +
      "Sélecteurs data-testid relativement stables mais sujets à changement. " +
      "Anti-bot fort (Cloudflare, fingerprint, CAPTCHA). Rate-limit strict. " +
      "Préférer l’API officielle / partenaire si volume important. " +
      "URL de recherche type : https://www.airbnb.fr/s/{query}/homes?checkin=YYYY-MM-DD&checkout=YYYY-MM-DD&adults=N"
  },
  {
    station: "Booking.com",
    url: "https://www.booking.com/",
    host: "www.booking.com",
    kind: "ota",
    controls: {
      location: {
        selector: 'input[name="ss"]',
        tag: "input",
        name: "ss",
        placeholder: "Où allez-vous ?"
      },
      checkIn: {
        selector: 'button[data-testid="date-display-field-start"]',
        tag: "button",
        testId: "date-display-field-start"
      },
      checkOut: {
        selector: 'button[data-testid="date-display-field-end"]',
        tag: "button",
        testId: "date-display-field-end"
      },
      guests: {
        selector: 'button[data-testid="occupancy-config"]',
        tag: "button",
        testId: "occupancy-config"
      },
      adults: {
        selector: 'button[data-testid="occupancy-popup"] input[name="adults"]',
        tag: "input",
        name: "adults"
      },
      children: {
        selector: 'button[data-testid="occupancy-popup"] input[name="children"]',
        tag: "input",
        name: "children"
      },
      submit: {
        selector: 'button[type="submit"][class*="submit"]',
        tag: "button",
        type: "submit"
      },
      // Sélecteurs résultats (à valider / mettre à jour via recon)
      cards: {
        selector: 'div[data-testid="property-card"]',
        tag: "div",
        testId: "property-card"
      },
      title: {
        selector: 'div[data-testid="title"]',
        tag: "div",
        testId: "title"
      },
      price: {
        selector: 'span[data-testid="price-and-discounted-price"]',
        tag: "span",
        testId: "price-and-discounted-price"
      },
      link: {
        selector: 'a[data-testid="title-link"]',
        tag: "a",
        testId: "title-link"
      }
    },
    antiBot: {
      level: "high",
      preferBrowser: true,
      requireResidentialProxy: true,
      minDelayMs: 10_000,
      maxDelayMs: 22_000,
      maxConcurrency: 1,
      cooldownOnChallengeMs: 900_000,
      maxConsecutiveFailures: 2
    },
    notes:
      "OTA globale. Rechercher avec le nom de la station (ex. « Les 2 Alpes »). " +
      "Sélecteurs data-testid / name relativement stables. " +
      "Anti-bot fort (Cloudflare, fingerprint). Respecter robots.txt et rate-limit. " +
      "API partenaire Booking.com recommandée pour un usage intensif. " +
      "URL de recherche type : https://www.booking.com/searchresults.fr.html?ss={query}&checkin=YYYY-MM-DD&checkout=YYYY-MM-DD&group_adults=N&no_rooms=1"
  }
]

/** Les centrales distinctes : plusieurs stations partagent souvent la même. */
export const CENTRAL_HOSTS: string[] = [
  "booking.chamonix.com",
  "fr.locationlesmenuires.com",
  "fr.locationsaintmartin.com",
  "isola2000.com",
  "lesangles.com",
  "resa.saintlary.com",
  "reservation.alpedhuez.com",
  "reservation.areches-beaufort.com",
  "reservation.ax-ski.com",
  "reservation.combloux.com",
  "reservation.courchevel.com",
  "reservation.haute-maurienne-vanoise.com",
  "reservation.la-toussuire.com",
  "reservation.larosiere.net",
  "reservation.lecollet.com",
  "reservation.ledevoluy.com",
  "reservation.les2alpes.com",
  "reservation.lesorres.com",
  "reservation.lessaisies.com",
  "reservation.montgenevre.com",
  "reservation.orcieres.com",
  "reservation.saintfrancoislongchamp.com",
  "reservation.serre-chevalier.com",
  "reservation.tignes.net",
  "reservation.valdarly-montblanc.com",
  "reservation.valdisere.com",
  "reservation.valthorens.com",
  "reservations.meribel.net",
  "www.airbnb.fr",
  "www.alpes-sudlocations.com",
  "www.ballons-hautes-vosges.com",
  "www.booking.com",
  "www.chamrousse.com",
  "www.gerardmer-reservation.net",
  "www.karellis.com",
  "www.labresse.net",
  "www.laclusaz.com",
  "www.laplagneresort.com",
  "www.n-py.com",
  "www.paysdesecrins.com",
  "www.peisey-vallandry.com",
  "www.reservationpralognan.fr",
  "www.risoul.com",
  "www.saintefoy-reservation.com",
  "www.saintsorlindarves.com",
  "www.sancy.com",
  "www.valberg.com",
  "www.valdallos.com",
  "www.valfrejus.com",
  "www.valloire.com",
  "www.valmeinier-reservation.com",
  "www.valmorel.com"
]

/** Hosts des OTA (Airbnb, Booking…). */
export const OTA_HOSTS: string[] = ["www.airbnb.fr", "www.booking.com"]

/** Toutes les entrées de type OTA. */
export const OTAS: Central[] = CENTRALS.filter((c) => c.kind === "ota")

/** Toutes les entrées de type centrale locale. */
export const LOCAL_CENTRALS: Central[] = CENTRALS.filter(
  (c) => c.kind !== "ota"
)
