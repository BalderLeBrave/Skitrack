/**
 * Ce que le relevé de neige demande à Open-Meteo.
 *
 * Un seul sujet ici : **le fuseau n'est plus `Europe/Paris` écrit en dur.** Il
 * l'était sur un service pourtant mondial, et l'heure d'un bulletin japonais
 * serait sortie en heure de Paris — « demain matin » n'aurait pas voulu dire
 * demain matin.
 *
 * Le contrôle se fait sur l'URL appelée, parce que c'est la seule chose qui
 * sorte vraiment de la machine. `fetch` est remplacé le temps du test, et
 * l'appel est compté : rien ne part sur le réseau.
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { fetchSnow, fetchSnowPair } from "./openMeteo.server.ts";

const vrai = globalThis.fetch;

/** Remplace `fetch`, retient les URL demandées, et rend une réponse minimale. */
function espion(): string[] {
  const vues: string[] = [];
  globalThis.fetch = (async (url: string | URL) => {
    vues.push(String(url));
    return {
      ok: true,
      json: async () => ({
        elevation: 1800,
        current: { wind_speed_10m: 12, snowfall: 0, snow_depth: 0.4, time: "2026-01-15T09:00" },
        hourly: { snowfall: [], snow_depth: [], wind_speed_10m: [] },
      }),
    };
  }) as typeof fetch;
  return vues;
}

afterEach(() => {
  globalThis.fetch = vrai;
});

describe("le fuseau du relevé de neige", () => {
  it("vaut `auto` par défaut : Open-Meteo le résout au point demandé", async () => {
    const vues = espion();
    // Des coordonnées distinctes à chaque cas : le module garde un cache, et
    // un point déjà vu ne repartirait pas.
    await fetchSnow(36.71, 137.55, 1200);
    assert.equal(vues.length, 1);
    assert.match(vues[0], /[?&]timezone=auto(&|$)/);
    assert.equal(vues[0].includes("Europe%2FParis"), false);
  });

  it("se laisse imposer, quand l'appelant sait mieux", async () => {
    const vues = espion();
    await fetchSnow(46.01, 7.75, 2100, "Europe/Zurich");
    assert.match(vues[0], /[?&]timezone=Europe%2FZurich(&|$)/);
  });

  it("un fuseau demandé change la clé de cache, donc le relevé", async () => {
    const vues = espion();
    await fetchSnow(43.08, -79.07, 900, "America/Toronto");
    await fetchSnow(43.08, -79.07, 900, "Asia/Tokyo");
    // Même point, même altitude : sans le fuseau dans la clé, le second appel
    // aurait resservi la réponse du premier, horodatée à Toronto.
    assert.equal(vues.length, 2);
    assert.match(vues[1], /timezone=Asia%2FTokyo/);
  });

  it("les deux relevés d'une paire partagent le fuseau", async () => {
    const vues = espion();
    await fetchSnowPair(-41.29, 174.78, 800, 2000, "Pacific/Auckland");
    assert.equal(vues.length, 2);
    for (const u of vues) assert.match(u, /timezone=Pacific%2FAuckland/);
    // Et elles diffèrent par l'altitude, qui est tout l'objet d'une paire.
    assert.notEqual(vues[0], vues[1]);
  });
});
