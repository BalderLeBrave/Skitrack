/**
 * Coupe-circuit Airbnb, fichier partagé avec le sidecar Python.
 *
 * Après des 429, on ne relance pas : Relancer pendant la pause ne martèle pas.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { CIRCUIT_COOLDOWN_MS } from "./http429.ts";

export const AIRBNB_CIRCUIT_PATH =
  process.env.SKITRACK_AIRBNB_CIRCUIT?.trim() || "/tmp/skitrack-airbnb-429";

export function airbnbCircuitOpen(): boolean {
  try {
    const t = Number(readFileSync(AIRBNB_CIRCUIT_PATH, "utf8").trim());
    return Number.isFinite(t) && Date.now() / 1000 < t;
  } catch {
    return false;
  }
}

export function tripAirbnbCircuit(waitMs: number): void {
  const hold = Math.max(CIRCUIT_COOLDOWN_MS, waitMs) / 1000;
  try {
    writeFileSync(AIRBNB_CIRCUIT_PATH, String(Date.now() / 1000 + hold));
  } catch {
    /* tmp plein : le sidecar Python a le même fichier, ou pas */
  }
}
