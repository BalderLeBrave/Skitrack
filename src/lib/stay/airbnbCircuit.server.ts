/**
 * Coupe-circuit Airbnb, fichier partagé avec le sidecar Python.
 *
 * Après des 429, on ne relance pas : Relancer pendant la pause ne martèle pas.
 */
import { mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { CIRCUIT_COOLDOWN_MS } from "./http429.ts";
import { avecVerrouFichier, lireTexte } from "./taux.server.ts";

/** Le dossier temporaire de l'utilisateur : le même que Python (`tempfile.gettempdir()`). */
export const AIRBNB_CIRCUIT_PATH =
  process.env.SKITRACK_AIRBNB_CIRCUIT?.trim() || join(tmpdir(), "skitrack-airbnb-429");

function lireFin(): number {
  // Relu s'il est vide : un écrivain le réécrit peut-être en place.
  const t = Number((lireTexte(AIRBNB_CIRCUIT_PATH) ?? "").trim() || "0");
  return Number.isFinite(t) ? t : 0;
}

export function airbnbCircuitOpen(): boolean {
  return Date.now() / 1000 < lireFin();
}

/** Ce qu'il reste de la pause, en millisecondes (0 si fermé). */
export function airbnbCircuitRestantMs(): number {
  return Math.max(0, lireFin() * 1000 - Date.now());
}

/**
 * Ouvre pour `max(45 s, waitMs)`. Une pause plus longue déjà posée — par
 * Python, ou par un Retry-After plus long — reste. Rend la pause posée.
 */
export function tripAirbnbCircuit(waitMs: number): number {
  const holdMs = Math.max(CIRCUIT_COOLDOWN_MS, waitMs);
  // Lecture et écriture sous le même verrou que Python (`Circuit.trip`) :
  // deux refus simultanés ne raccourcissent pas la pause l'un de l'autre.
  avecVerrouFichier(`${AIRBNB_CIRCUIT_PATH}.lock`, () => {
    const fin = Math.max(lireFin(), Date.now() / 1000 + holdMs / 1000);
    const tmp = `${AIRBNB_CIRCUIT_PATH}.${process.pid}.tmp`;
    try {
      mkdirSync(dirname(AIRBNB_CIRCUIT_PATH), { recursive: true });
      writeFileSync(tmp, String(fin));
      for (let essai = 0; ; essai++) {
        try {
          renameSync(tmp, AIRBNB_CIRCUIT_PATH);
          return;
        } catch (err) {
          const code = (err as NodeJS.ErrnoException).code;
          // Windows : Python lit le fichier à cet instant. On réessaie, puis
          // on écrit en place : une pause perdue rouvrirait Airbnb trop tôt.
          if ((code !== "EPERM" && code !== "EACCES" && code !== "EBUSY") || essai >= 4) {
            writeFileSync(AIRBNB_CIRCUIT_PATH, String(fin));
            return;
          }
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10 * (essai + 1));
        }
      }
    } catch {
      /* tmp plein : le sidecar Python a le même fichier, ou pas */
    } finally {
      try {
        unlinkSync(tmp);
      } catch {
        /* déjà renommé */
      }
    }
  });
  return holdMs;
}
