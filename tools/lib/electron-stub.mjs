/**
 * Bouchon d'Electron, pour faire tourner un connecteur hors de l'application.
 *
 * Les connecteurs vivent dans le processus principal et demandent à Electron un
 * seul service : le dossier de profil du navigateur de relevé
 * (`app.getPath('userData')`). Les outils de `tools/` — balayage des centrales,
 * diagnostics — ont besoin du connecteur, pas d'Electron : ce bouchon rend un
 * dossier temporaire et rien d'autre.
 *
 * Il n'est jamais empaqueté avec l'application : `electron-vite` résout le vrai
 * module. Seuls les scripts d'outillage l'aliasent explicitement.
 */

import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const app = {
  getPath: (name) => join(tmpdir(), `skitrack-tools-${name}`)
}

export default { app }
