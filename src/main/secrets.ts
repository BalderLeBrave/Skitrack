import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, safeStorage } from 'electron'
import { SECRET_KEYS, type SecretKey, type SecretPresence } from '@shared/ipc-contract'

/**
 * Coffre de clés d'API chiffré au repos.
 *
 * `safeStorage` s'appuie sur DPAPI sous Windows : le chiffrement est lié au
 * compte utilisateur Windows, donc le fichier copié sur une autre machine est
 * illisible. C'est exactement la propriété recherchée, et c'est aussi pourquoi
 * on ne dépend pas de `keytar` (non maintenu, nécessite une compilation native).
 *
 * Le renderer n'obtient jamais les valeurs : `list()` ne renvoie que des noms
 * et un booléen. Les clés en clair ne quittent le processus main que vers le
 * sidecar local, en mémoire.
 */

interface VaultFile {
  version: 1
  /** valeur chiffrée -> base64. Absente si le chiffrement OS est indisponible. */
  entries: Partial<Record<SecretKey, string>>
  encrypted: boolean
}

function vaultPath(): string {
  return join(app.getPath('userData'), 'secrets.enc.json')
}

function emptyVault(): VaultFile {
  return { version: 1, entries: {}, encrypted: safeStorage.isEncryptionAvailable() }
}

function readVault(): VaultFile {
  const path = vaultPath()
  if (!existsSync(path)) return emptyVault()
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as VaultFile
    if (parsed.version !== 1) return emptyVault()
    return parsed
  } catch {
    // Fichier corrompu : repartir vide plutôt que d'empêcher l'app de démarrer.
    return emptyVault()
  }
}

function writeVault(vault: VaultFile): void {
  const path = vaultPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(vault, null, 2), { encoding: 'utf-8', mode: 0o600 })
}

export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

export function listSecrets(): SecretPresence[] {
  const vault = readVault()
  return SECRET_KEYS.map((key) => ({ key, present: Boolean(vault.entries[key]) }))
}

export function setSecret(key: SecretKey, value: string): SecretPresence[] {
  if (!SECRET_KEYS.includes(key)) throw new Error(`Clé inconnue : ${key}`)
  const vault = readVault()
  if (!value) {
    delete vault.entries[key]
  } else if (safeStorage.isEncryptionAvailable()) {
    vault.entries[key] = safeStorage.encryptString(value).toString('base64')
    vault.encrypted = true
  } else {
    // Refus explicite plutôt qu'un stockage en clair silencieux.
    throw new Error(
      "Le chiffrement système n'est pas disponible : la clé n'a pas été enregistrée. " +
        'Sur Windows cela signale un profil utilisateur ou une DPAPI en erreur.'
    )
  }
  writeVault(vault)
  return listSecrets()
}

export function deleteSecret(key: SecretKey): SecretPresence[] {
  const vault = readVault()
  delete vault.entries[key]
  writeVault(vault)
  return listSecrets()
}

/** Déchiffre tout le coffre. Réservé au push vers le sidecar. */
export function decryptAll(): Record<string, string> {
  const vault = readVault()
  const out: Record<string, string> = {}
  for (const [key, encoded] of Object.entries(vault.entries)) {
    if (!encoded) continue
    try {
      out[key] = safeStorage.decryptString(Buffer.from(encoded, 'base64'))
    } catch {
      // Coffre écrit par un autre compte Windows : on ignore la clé illisible.
    }
  }
  return out
}
