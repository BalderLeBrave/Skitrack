/**
 * Magasin des notes et des votes de la sélection.
 *
 * ## Pourquoi une base plutôt que les préférences
 *
 * Jusqu'ici, les notes voyageaient dans le même bloc `localStorage` que le
 * thème, la langue et la densité. Une remise à zéro des réglages emportait
 * donc les commentaires du groupe avec elle, et rien ne le signalait. Ce
 * fichier les sort de là : `selection.db` vit dans `userData`, à côté des
 * autres fichiers du processus principal, et ne dépend plus du profil du
 * renderer.
 *
 * ## Ce que la base apporte au-delà du rangement
 *
 * Les votes étaient indexés **par rang de votant** dans le tableau des
 * voyageurs. Retirer quelqu'un décalait tous les rangs suivants et
 * réattribuait silencieusement leurs votes. La clé primaire
 * `(kind, target_id, voter_id)` supprime ce décalage : un vote appartient à
 * une personne, pas à une position dans une liste.
 *
 * ## Ce que la base ne garantit pas
 *
 * `target_id` désigne un domaine ou un logement qui ne vit pas ici : les
 * domaines viennent du référentiel, les logements d'un relevé. Aucune clé
 * étrangère ne peut donc être posée, et une note peut survivre à la
 * disparition de sa cible. Ce n'est pas un défaut à corriger en base, c'est
 * un fait à afficher côté écran.
 */

import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import Database from 'better-sqlite3'
import type {
  SelectionMutation,
  SelectionNoteRow,
  SelectionSnapshot,
  SelectionVoteRow
} from '@shared/ipc-contract'

let db: Database.Database | null = null

function fichier(): string {
  return join(app.getPath('userData'), 'selection.db')
}

/**
 * Ouvre la base, la crée au besoin, et pose le schéma.
 *
 * `CREATE TABLE IF NOT EXISTS` plutôt qu'un système de migrations : il n'y a
 * pour l'instant qu'une version du schéma. Le jour où il y en aura deux, la
 * table `meta` ci-dessous portera le numéro et le remplacement se fera ici.
 */
function ouvrir(): Database.Database {
  if (db) return db
  const chemin = fichier()
  const dossier = dirname(chemin)
  if (!existsSync(dossier)) mkdirSync(dossier, { recursive: true })

  const base = new Database(chemin)
  // `WAL` pour que la lecture ne bloque pas l'écriture ; `NORMAL` parce qu'une
  // note perdue en cas de coupure de courant est un moindre mal comparé à un
  // `fsync` à chaque frappe.
  base.pragma('journal_mode = WAL')
  base.pragma('synchronous = NORMAL')

  base.exec(`
    CREATE TABLE IF NOT EXISTS selection_notes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      kind       TEXT    NOT NULL CHECK (kind IN ('domain','lodging')),
      target_id  INTEGER NOT NULL,
      author_id  INTEGER NOT NULL,
      created_at TEXT    NOT NULL,
      body       TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_selection_notes_cible
      ON selection_notes (kind, target_id, id);

    CREATE TABLE IF NOT EXISTS selection_votes (
      kind      TEXT    NOT NULL CHECK (kind IN ('domain','lodging')),
      target_id INTEGER NOT NULL,
      voter_id  INTEGER NOT NULL,
      value     INTEGER NOT NULL CHECK (value IN (-1, 0, 1)),
      PRIMARY KEY (kind, target_id, voter_id)
    );

    CREATE TABLE IF NOT EXISTS meta (
      cle    TEXT PRIMARY KEY,
      valeur TEXT NOT NULL
    );
  `)

  db = base
  return base
}

function lireMeta(base: Database.Database, cle: string): string | null {
  const ligne = base.prepare('SELECT valeur FROM meta WHERE cle = ?').get(cle) as
    | { valeur: string }
    | undefined
  return ligne?.valeur ?? null
}

function ecrireMeta(base: Database.Database, cle: string, valeur: string): void {
  base
    .prepare('INSERT INTO meta (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur')
    .run(cle, valeur)
}

/** L'état complet, tel que le renderer le tient en mémoire. */
export function loadSelection(): SelectionSnapshot {
  const base = ouvrir()
  const notes = base
    .prepare(
      `SELECT id, kind, target_id AS targetId, author_id AS authorId,
              created_at AS createdAt, body
         FROM selection_notes
        ORDER BY id`
    )
    .all() as SelectionNoteRow[]
  // Un vote à zéro est un vote retiré : il ne remonte pas, et la ligne est
  // effacée à l'écriture. Le filtre est une ceinture, pas une bretelle.
  const votes = base
    .prepare(
      `SELECT kind, target_id AS targetId, voter_id AS voterId, value
         FROM selection_votes
        WHERE value <> 0
        ORDER BY kind, target_id, voter_id`
    )
    .all() as SelectionVoteRow[]
  return { notes, votes, legacyImported: lireMeta(base, 'legacyImported') === '1' }
}

/**
 * Applique une mutation et rend l'état résultant.
 *
 * Rendre l'état complet après chaque mutation coûte une lecture de deux tables
 * de quelques centaines de lignes, et évite au renderer de tenir un état
 * parallèle qui pourrait diverger. C'est le compromis retenu : l'écriture est
 * ciblée, la lecture est entière.
 */
export function applySelection(mutation: SelectionMutation): SelectionSnapshot {
  const base = ouvrir()

  switch (mutation.type) {
    case 'note-add':
      base
        .prepare(
          `INSERT INTO selection_notes (kind, target_id, author_id, created_at, body)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(
          mutation.kind,
          mutation.targetId,
          mutation.authorId,
          new Date().toISOString(),
          mutation.body
        )
      break

    case 'note-remove':
      base.prepare('DELETE FROM selection_notes WHERE id = ?').run(mutation.id)
      break

    case 'vote-set':
      if (mutation.value === 0) {
        // Retirer son vote efface la ligne : une table de votes ne doit
        // contenir que des votes exprimés, sinon compter devient un filtrage.
        base
          .prepare('DELETE FROM selection_votes WHERE kind = ? AND target_id = ? AND voter_id = ?')
          .run(mutation.kind, mutation.targetId, mutation.voterId)
      } else {
        base
          .prepare(
            `INSERT INTO selection_votes (kind, target_id, voter_id, value)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(kind, target_id, voter_id) DO UPDATE SET value = excluded.value`
          )
          .run(mutation.kind, mutation.targetId, mutation.voterId, mutation.value)
      }
      break

    case 'import-legacy': {
      // Reprise des notes restées dans `localStorage`. Elle n'a lieu qu'une
      // fois : le drapeau est posé même quand il n'y avait rien à reprendre,
      // sans quoi un profil vide relancerait la reprise à chaque démarrage.
      if (lireMeta(base, 'legacyImported') === '1') break
      const insererNote = base.prepare(
        `INSERT INTO selection_notes (kind, target_id, author_id, created_at, body)
         VALUES (?, ?, ?, ?, ?)`
      )
      const insererVote = base.prepare(
        `INSERT INTO selection_votes (kind, target_id, voter_id, value)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(kind, target_id, voter_id) DO UPDATE SET value = excluded.value`
      )
      const tout = base.transaction(() => {
        for (const n of mutation.notes) {
          insererNote.run(n.kind, n.targetId, n.authorId, n.createdAt, n.body)
        }
        // Pas de garde sur le zéro : `SelectionVoteRow.value` ne l'admet pas.
        // Un vote retiré n'est pas une ligne à valeur nulle, c'est une ligne
        // absente, et le type le dit.
        for (const v of mutation.votes) {
          insererVote.run(v.kind, v.targetId, v.voterId, v.value)
        }
        ecrireMeta(base, 'legacyImported', '1')
      })
      tout()
      break
    }
  }

  return loadSelection()
}

/** Ferme la base à la fermeture de l'application. */
export function disposeSelection(): void {
  db?.close()
  db = null
}
