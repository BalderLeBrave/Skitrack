/**
 * Les tracés d’icônes de la maquette Airbnb (`IC`, Skitrack App.dc.html) :
 * trait fin, viewBox 24 × 24, `stroke="currentColor"`, sans remplissage.
 * Une seule table pour l’accueil, les stations, les logements et les filtres.
 */
export const ICONES = {
  big: "M2 20 8.5 9l4 6.5 3-4.5L22 20ZM2 20h20",
  high: "M3 20 10 7l3.5 5.5L16 9l5 11ZM10 7V3l3.5 1.2L10 5.4",
  glacier: "M12 2v20M3.5 7l17 10M20.5 7l-17 10M9.5 3.5 12 5l2.5-1.5M9.5 20.5 12 19l2.5 1.5",
  linked: "M2 20l5-8 4 8M13 20l4-8 5 8M7 12V6M17 12V6M3 5l18 2",
  family:
    "M8.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2.5 20a6 6 0 0 1 12 0M16.5 11a2.5 2.5 0 1 0 0-5M17 14a5 5 0 0 1 4.5 6",
  steep: "M12 3l9 9-9 9-9-9z",
  lift: "M2 4l20-2M12 3v6M6.5 9h11l-1.5 7h-8zM9 16v5M15 16v5M7 21h10",
  skis: "M6 21 16 3M10 21 20 3M4 18.5l3.5 1M8 18.5l3.5 1",
  chalet: "M2.5 11.5 12 3l9.5 8.5M5 9.5V21h14V9.5M10 21v-5h4v5",
  appart: "M5 21V3h14v18M3 21h18M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2",
  studio: "M3 21V8l9-5 9 5v13M3 21h18M8 21v-6h8v6M8 11h8",
  res: "M3 21V9h7v12M10 21V4h11v17M2 21h20M13 8h2M17 8h2M13 12h2M17 12h2M13 16h2M17 16h2M5.5 13h2M5.5 17h2",
  flame:
    "M12 22c4 0 7-2.8 7-6.8C19 10 14 8 14 3c-3 2-4.5 5-4.5 7.5C8.5 9.5 8 8.5 8 7c-2 2-3 5-3 8.2C5 19.2 8 22 12 22Z",
  sauna:
    "M8 3c-1.2 1.4 1.2 2.6 0 4M12 3c-1.2 1.4 1.2 2.6 0 4M16 3c-1.2 1.4 1.2 2.6 0 4M3 11h18v10H3zM3 16h18",
  paw: "M12 21c-3.3 0-6-1.8-6-4.5S9 12 12 12s6 1.8 6 4.5-2.7 4.5-6 4.5ZM5 11.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM9 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM15 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM19 11.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  wifi: "M2 8.8a15 15 0 0 1 20 0M5 12.6a10 10 0 0 1 14 0M8.5 16.3a5 5 0 0 1 7 0M12 20h.01",
  parking: "M4 3h16v18H4zM9.5 17V7h3.5a3 3 0 0 1 0 6H9.5",
  lv: "M4 3h16v18H4zM4 7.5h16M12 18a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  skiroom: "M7 21V3M11 21V3M15 3l2 18M19 3l-2 18",
  balcon: "M7 3h10v9H7zM3 12h18M5 12v9M9.5 12v9M14.5 12v9M19 12v9M3 21h18",
  pool: "M2 18c2 0 2-1.5 4-1.5S8 18 10 18s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5M8 15V5a2 2 0 0 1 4 0M16 15V5a2 2 0 0 0-4 0M8 9h8",
  pin: "M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0ZM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  mount: "m8 3 4 8 5-5 5 15H2L8 3z",
  globe:
    "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20",
  map: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2ZM9 4v14M15 6v14",
  list: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  ticket: "M3 7h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4ZM14 7v12",
  trace: "M3 17l5-6 4 4 4-7 5 9",
  check: "M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2",
} as const;

export type CleIcone = keyof typeof ICONES;
