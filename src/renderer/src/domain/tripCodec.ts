/**
 * Sérialisation d'un séjour, pour le partage.
 *
 * Un séjour tient dans un lien ou dans un fichier. Les deux portent la même
 * charge — le même JSON, encodé en base64url — et repassent par le même
 * validateur que le stockage local, `parseSavedTrip`. Deux chemins d'entrée,
 * un seul contrôle : sinon le plus laxiste des deux finit par faire loi.
 *
 * ## Un lien reçu est une donnée, jamais du code
 *
 * `decodeTrip` ne fait que décoder et valider. Rien n'est évalué, aucune URL
 * du payload n'est suivie, aucun champ n'est recopié sans passer par les
 * bornes de `parseSavedTrip`. Un payload malformé renvoie `null` — l'appelant
 * affiche un refus, il ne tente pas de réparer.
 *
 * ## Pourquoi base64url et pas base64
 *
 * Le payload voyage dans un `skitrack://trip/<payload>`. `+`, `/` et `=` y
 * seraient réencodés par tout ce qui manipule des URL au passage (client de
 * messagerie, presse-papier enrichi), et le lien reviendrait cassé. L'alphabet
 * URL-safe évite le problème plutôt que de le rattraper.
 *
 * ## Pourquoi un plafond de taille
 *
 * Windows tronque les lignes de commande longues, et les clients de messagerie
 * coupent les URL au-delà de quelques centaines de caractères. Un lien coupé
 * est pire qu'un lien absent : il a l'air valide et ne se décode pas. Au-delà
 * de `LINK_MAX_CHARS`, l'interface propose le fichier — voir `isLinkTooLong`.
 */

import { parseSavedTrip, type SavedTrip } from '@/store/userData'

/** Schéma de la charge, pour refuser d'emblée un format futur inconnu. */
export const TRIP_PAYLOAD_VERSION = 1

/** Protocole personnalisé enregistré par le processus principal. */
export const TRIP_PROTOCOL = 'skitrack'

/** Extension du fichier de séjour. */
export const TRIP_FILE_EXT = '.skitrip'

/**
 * Longueur maximale d'un lien partageable, caractères compris.
 *
 * Choisie sous la limite pratique des clients de messagerie et bien sous celle
 * d'une ligne de commande Windows. Ce n'est pas une limite du format : un
 * séjour plus gros s'exporte en fichier, sans perte.
 */
export const LINK_MAX_CHARS = 1500

interface TripPayload {
  v: number
  trip: SavedTrip
}

// --- base64url, sûr en UTF-8 ---------------------------------------------

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  // Par blocs : `String.fromCharCode(...bytes)` dépasse la taille de pile des
  // arguments dès quelques dizaines de milliers d'octets.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(payload: string): string | null {
  try {
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

// --- Encodage / décodage --------------------------------------------------

/** Charge partageable d'un séjour. */
export function encodeTrip(trip: SavedTrip): string {
  const payload: TripPayload = { v: TRIP_PAYLOAD_VERSION, trip }
  return toBase64Url(JSON.stringify(payload))
}

/**
 * Relit une charge.
 *
 * Renvoie `null` sur tout ce qui n'est pas un séjour valide de la version
 * connue : base64 illisible, JSON illisible, version future, séjour hors
 * bornes. Aucune de ces situations n'est rattrapée.
 */
export function decodeTrip(payload: string): SavedTrip | null {
  if (typeof payload !== 'string' || payload.length === 0) return null
  // Un payload démesuré n'est pas décodé du tout : `atob` sur plusieurs
  // mégaoctets bloquerait le fil d'exécution avant même la validation.
  if (payload.length > 200_000) return null

  const json = fromBase64Url(payload)
  if (json == null) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const envelope = parsed as Record<string, unknown>
  // Une version inconnue est refusée plutôt que lue au mieux : un champ dont
  // le sens a changé se relirait sans erreur et poserait une valeur fausse.
  if (envelope.v !== TRIP_PAYLOAD_VERSION) return null

  return parseSavedTrip(envelope.trip)
}

// --- Lien -----------------------------------------------------------------

export function tripLink(trip: SavedTrip): string {
  return `${TRIP_PROTOCOL}://trip/${encodeTrip(trip)}`
}

export function isLinkTooLong(link: string): boolean {
  return link.length > LINK_MAX_CHARS
}

/**
 * Extrait la charge d'un lien `skitrack://trip/<payload>`.
 *
 * Tolère la casse du protocole et une barre oblique finale — un presse-papier
 * ou un client de messagerie en ajoute volontiers. Refuse tout autre hôte que
 * `trip` : le protocole pourra en porter d'autres, et un lien d'une version
 * future ne doit pas être interprété comme un séjour.
 */
export function parseTripLink(url: string): string | null {
  if (typeof url !== 'string') return null
  const match = /^skitrack:\/\/trip\/([A-Za-z0-9\-_]+)\/?$/i.exec(url.trim())
  return match ? match[1] : null
}

/** Séjour porté par un lien, ou `null`. */
export function decodeTripLink(url: string): SavedTrip | null {
  const payload = parseTripLink(url)
  return payload ? decodeTrip(payload) : null
}

// --- Fichier --------------------------------------------------------------

/**
 * Contenu d'un fichier `.skitrip`.
 *
 * Le fichier porte la charge encodée et non le JSON en clair : un même
 * validateur pour les deux chemins, et le fichier reste recopiable dans un
 * message sans être reformaté par un éditeur.
 */
export function tripFileContent(trip: SavedTrip): string {
  return `${TRIP_PROTOCOL}:trip:${TRIP_PAYLOAD_VERSION}\n${encodeTrip(trip)}\n`
}

/** Séjour porté par un fichier `.skitrip`, ou `null`. */
export function decodeTripFile(content: string): SavedTrip | null {
  if (typeof content !== 'string') return null
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) return null
  if (!/^skitrack:trip:\d+$/i.test(lines[0])) return null
  return decodeTrip(lines[1])
}

/** Nom de fichier proposé — sans caractère interdit par Windows. */
export function tripFileName(trip: SavedTrip): string {
  const safe = trip.label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${safe || 'sejour'}${TRIP_FILE_EXT}`
}
