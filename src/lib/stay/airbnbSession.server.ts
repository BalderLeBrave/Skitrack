/**
 * Cookies Airbnb posés par le sidecar Python, relus ici pour les fiches
 * `rooms/`. Sans ça, Node arrive anonyme alors que Python a déjà une session.
 */
import { readFileSync } from "node:fs";

const COOKIE_TTL_MS = 12 * 60 * 60 * 1000;

type CookieRow = { name: string; value: string };

function sessionPath(): string {
  return process.env.SKITRACK_AIRBNB_SESSION?.trim() || "/tmp/skitrack-airbnb-session.json";
}

export function airbnbCookieHeader(): string {
  try {
    const raw = JSON.parse(readFileSync(sessionPath(), "utf8")) as {
      cookies?: unknown;
      cookies_at?: unknown;
    };
    const at = typeof raw.cookies_at === "number" ? raw.cookies_at * 1000 : 0;
    if (at && Date.now() - at > COOKIE_TTL_MS) return "";
    if (!Array.isArray(raw.cookies)) return "";
    const parts: string[] = [];
    for (const row of raw.cookies) {
      if (!row || typeof row !== "object") continue;
      const name = (row as CookieRow).name;
      const value = (row as CookieRow).value;
      if (typeof name === "string" && name && typeof value === "string") {
        parts.push(`${name}=${value}`);
      }
    }
    return parts.join("; ");
  } catch {
    return "";
  }
}
