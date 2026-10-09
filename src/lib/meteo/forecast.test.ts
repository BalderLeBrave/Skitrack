import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { jourCourant, veille } from "./forecast.ts";
import { choixModele, enFranceMetropolitaine, levelOf, skyKindOf, skyLabelOf } from "./forecast.server.ts";

describe("skyKindOf — quatre familles, celles que la fiche sait dessiner", () => {
  it("le verglas et l'orage ne sont pas des journées couvertes", () => {
    // Bruine verglaçante, pluie verglaçante, orage : la maquette les range en
    // « pluie » (App.dc.html:812), le code les laissait tomber sur « nuage ».
    for (const code of [56, 57, 66, 67, 95, 96, 99]) {
      assert.equal(skyKindOf(code), "rain", `code ${code}`);
    }
  });

  it("garde les familles déjà justes", () => {
    for (const code of [0, 1]) assert.equal(skyKindOf(code), "sun", `code ${code}`);
    for (const code of [71, 73, 75, 77, 85, 86]) assert.equal(skyKindOf(code), "snow", `code ${code}`);
    for (const code of [51, 53, 55, 61, 63, 65, 80, 81, 82]) {
      assert.equal(skyKindOf(code), "rain", `code ${code}`);
    }
    for (const code of [2, 3, 45, 48]) assert.equal(skyKindOf(code), "cloud", `code ${code}`);
  });

  it("un code absent se dessine en nuage, faute de mieux", () => {
    assert.equal(skyKindOf(null), "cloud");
    assert.equal(skyKindOf(undefined), "cloud");
  });

  it("le dessin et le nom disent la même chose de l'orage", () => {
    for (const code of [95, 96, 99]) {
      assert.equal(skyLabelOf(code), "storm", `code ${code}`);
      assert.notEqual(skyKindOf(code), "cloud", `code ${code}`);
    }
  });
});

describe("neige — le modèle qui suit l'altitude, pas ICON", () => {
  it("la France métropolitaine interroge Arpège, le reste le CEPMMT", () => {
    assert.equal(enFranceMetropolitaine(45.009, 6.122), true);
    assert.equal(choixModele(45.009, 6.122).sourceChutes, "arpege");
    assert.equal(enFranceMetropolitaine(36.1, 138.2), false);
    assert.equal(choixModele(-21.1, 55.5).sourceChutes, "ecmwf");
  });

  it("hier n'est pas affiché comme aujourd'hui", () => {
    const days = [
      { date: "2026-10-08", tempMax: -3, tempMin: -8, rainMm: 6.2, snowCm: 11.2, windMaxKmh: 20, depthCm: 8, kind: "snow" as const },
      { date: "2026-10-09", tempMax: -1, tempMin: -9, rainMm: 0, snowCm: 0.2, windMaxKmh: 15, depthCm: 11, kind: "cloud" as const },
    ];
    assert.equal(veille("2026-10-09"), "2026-10-08");
    assert.equal(jourCourant(days, "2026-10-09")?.snowCm, 0.2);
    assert.notEqual(jourCourant(days, "2026-10-09")?.date, days[0].date);
  });

  it("aux 2 Alpes, le 8 octobre 2026, lit 11 cm et non le 1 cm d'ICON", () => {
    // Réponse réelle d'Open-Meteo, altitude 3 600 m. ICON (best_match) publiait
    // 1,96 cm de neige et 0,01 m au sol. Arpège publie 11,2 cm. Le CEPMMT, 0,11 m.
    const niveau = levelOf(
      {
        daily: {
          time: ["2026-10-08", "2026-10-09"],
          snowfall_sum_meteofrance_arpege_europe: [11.2, 0.21],
          rain_sum_meteofrance_arpege_europe: [6.2, 0],
          precipitation_sum_meteofrance_arpege_europe: [22.2, 0.3],
          temperature_2m_max_meteofrance_arpege_europe: [-3.2, -1],
          temperature_2m_min_meteofrance_arpege_europe: [-8.2, -9],
          wind_speed_10m_max_meteofrance_arpege_europe: [28, 18],
          weather_code_meteofrance_arpege_europe: [71, 1],
          snow_depth_max_meteofrance_arpege_europe: [null, null],
          snowfall_sum_ecmwf_ifs: [7.63, 0.35],
          snow_depth_max_ecmwf_ifs: [0.08, 0.11],
        },
        hourly: {
          time: ["2026-10-09T09:00", "2026-10-09T15:00"],
          temperature_2m_meteofrance_arpege_europe: [-8.1, -1.3],
          weather_code_meteofrance_arpege_europe: [1, 1],
        },
      },
      3600,
      choixModele(45.009, 6.122),
      "2026-10-09",
    );
    assert.equal(niveau.days[0].snowCm, 11.2);
    assert.equal(niveau.days[0].depthCm, 8);
    assert.equal(niveau.days[1].snowCm, 0.2);
    assert.equal(niveau.days[1].depthCm, 11);
    assert.equal(niveau.morning.temp, -8);
    assert.notEqual(niveau.days[1].depthCm, 1);
  });

  it("au-delà des quatre jours d'Arpège, le CEPMMT de la même réponse prend le relais", () => {
    const niveau = levelOf(
      {
        daily: {
          time: ["2026-10-09", "2026-10-14"],
          // Arpège Europe s'arrête à quatre jours : ses colonnes sont nulles ensuite.
          snowfall_sum_meteofrance_arpege_europe: [3.1, null],
          rain_sum_meteofrance_arpege_europe: [0, null],
          temperature_2m_max_meteofrance_arpege_europe: [-2.4, null],
          temperature_2m_min_meteofrance_arpege_europe: [-7.6, null],
          wind_speed_10m_max_meteofrance_arpege_europe: [20, null],
          weather_code_meteofrance_arpege_europe: [71, null],
          snowfall_sum_ecmwf_ifs: [9.9, 4.27],
          rain_sum_ecmwf_ifs: [1, 0.4],
          temperature_2m_max_ecmwf_ifs: [0, -3.4],
          temperature_2m_min_ecmwf_ifs: [-5, -10.6],
          wind_speed_10m_max_ecmwf_ifs: [30, 41],
          weather_code_ecmwf_ifs: [3, 73],
          snow_depth_max_ecmwf_ifs: [0.3, 0.42],
        },
      },
      3600,
      choixModele(45.009, 6.122),
      "2026-10-09",
    );
    // Arpège d'abord, quand il publie.
    assert.equal(niveau.days[0].snowCm, 3.1);
    assert.equal(niveau.days[0].tempMax, -2);
    // Ensuite, le CEPMMT plutôt que rien.
    assert.deepEqual(
      [niveau.days[1].snowCm, niveau.days[1].rainMm, niveau.days[1].tempMax, niveau.days[1].tempMin],
      [4.3, 0.4, -3, -11],
    );
    assert.equal(niveau.days[1].windMaxKmh, 41);
    assert.equal(niveau.days[1].depthCm, 42);
    assert.notEqual(niveau.days[1].kind, skyKindOf(null));
  });
});
