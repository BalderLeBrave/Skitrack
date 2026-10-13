/**
 * Les pictogrammes propres à la fiche d'annonce : les équipements, et la
 * grille de « Voir toutes les photos ». Même grille de 24 et même trait que
 * le registre commun (`Icon.tsx`), en plus fin (1,5) comme la maquette du
 * 12 oct. 2026 ; la couleur vient du contexte.
 */

/** Tracés par clé d'équipement (`EQUIPEMENTS_FICHE`). */
const EQUIPEMENT: Record<string, string> = {
  balcon: "M7 3h10v9H7zM3 12h18M5 12v9M9.5 12v9M14.5 12v9M19 12v9M3 21h18",
  cheminee:
    "M12 22c4 0 7-2.8 7-6.8C19 10 14 8 14 3c-3 2-4.5 5-4.5 7.5C8.5 9.5 8 8.5 8 7c-2 2-3 5-3 8.2C5 19.2 8 22 12 22Z",
  wifi: "M2 8.8a15 15 0 0 1 20 0M5 12.6a10 10 0 0 1 14 0M8.5 16.3a5 5 0 0 1 7 0M12 20h.01",
  lave_vaisselle: "M4 3h16v18H4zM4 7.5h16M12 18a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  lave_linge: "M4 3h16v18H4zM4 7.5h16M12 18a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM7 5.2h.01",
  seche_linge: "M4 3h16v18H4zM4 7.5h16M12 18a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM10 14h4",
  linge_fourni: "M4 7h16v13H4zM8 7V4h8v3M4 12h16",
  parking: "M4 3h16v18H4zM9.5 17V7h3.5a3 3 0 0 1 0 6H9.5",
  animaux:
    "M12 21c-3.3 0-6-1.8-6-4.5S9 12 12 12s6 1.8 6 4.5-2.7 4.5-6 4.5ZM5 11.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM9 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM15 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM19 11.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  casier_skis: "M7 21V3M11 21V3M15 3l2 18M19 3l-2 18",
  ski_aux_pieds: "M3 18l18-6M6 21l15-5M8 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM8 8l3 5-4 2",
  sauna:
    "M8 3c-1.2 1.4 1.2 2.6 0 4M12 3c-1.2 1.4 1.2 2.6 0 4M16 3c-1.2 1.4 1.2 2.6 0 4M3 11h18v10H3zM3 16h18",
  sauna_spa:
    "M8 3c-1.2 1.4 1.2 2.6 0 4M12 3c-1.2 1.4 1.2 2.6 0 4M16 3c-1.2 1.4 1.2 2.6 0 4M3 11h18v10H3zM3 16h18",
  jacuzzi:
    "M3 12h18v4a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5zM7 8c-1-1.2 1-2.3 0-3.5M12 8c-1-1.2 1-2.3 0-3.5M17 8c-1-1.2 1-2.3 0-3.5",
  piscine:
    "M2 18c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5M8 15V5a2 2 0 0 1 4 0M16 15V5a2 2 0 0 0-4 0M8 9h8",
  ascenseur: "M5 3h14v18H5zM12 3v18M8.5 9.5 10 8l1.5 1.5M12.5 14.5 14 16l1.5-1.5",
  television: "M3 5h18v12H3zM8 21h8M12 17v4",
  seche_cheveux: "M14 4a6 6 0 1 0 0 12h7V4zM10 16l-2 6h3l2-6M14 8a2 2 0 1 0 0 4",
  fer: "M3 18h18v-3a6 6 0 0 0-6-6H8M3 18l2-6a3 3 0 0 1 3-3",
  climatisation: "M12 2v20M4.9 4.9l14.2 14.2M2 12h20M4.9 19.1 19.1 4.9",
  chauffage: "M6 4v14M10 4v14M14 4v14M18 4v14M4 18h16M4 21h16",
  barbecue:
    "M4 10h16a8 8 0 0 1-16 0ZM8 18l-2 4M16 18l2 4M9 6c-1-1.2 1-2.3 0-3.5M15 6c-1-1.2 1-2.3 0-3.5",
  vue: "M2 20l7-11 4 6 3-4 6 9zM16 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
};

/** Un équipement sans tracé propre : une coche ronde. */
const AUTRE = "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8.5 12.5l2.5 2.5 4.5-5";

export function PictoEquipement({ id }: { id: string }) {
  return (
    <svg
      className="fl-picto"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={EQUIPEMENT[id] ?? AUTRE} />
    </svg>
  );
}

export function PictoGrille() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

/** Les tracés d'interface de la maquette, à leur taille et leur épaisseur. */
const UI = {
  retour: { d: "m15 18-6-6 6-6", taille: 14, ep: 2.4 },
  partager: {
    d: "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13",
    taille: 15,
    ep: 2,
  },
  croix: { d: "M18 6 6 18M6 6l12 12", taille: 14, ep: 2.4 },
  croixPlein: { d: "M18 6 6 18M6 6l12 12", taille: 16, ep: 2.4 },
  precedent: { d: "m15 18-6-6 6-6", taille: 14, ep: 2.4 },
  suivant: { d: "m9 18 6-6-6-6", taille: 14, ep: 2.4 },
  flechePrec: { d: "m15 18-6-6 6-6", taille: 18, ep: 2.4 },
  flecheSuiv: { d: "m9 18 6-6-6-6", taille: 18, ep: 2.4 },
  externe: { d: "M7 17 17 7M7 7h10v10", taille: 11, ep: 2.4 },
  externeGrand: { d: "M7 17 17 7M7 7h10v10", taille: 12, ep: 2.4 },
  alerte: {
    d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3M12 9v4M12 17h.01",
    taille: 16,
    ep: 2,
  },
  chevron: { d: "m9 18 6-6-6-6", taille: 12, ep: 2.4 },
  coche: { d: "M20 6 9 17l-5-5", taille: 14, ep: 3 },
  bas: { d: "m6 9 6 6 6-6", taille: 16, ep: 2 },
} as const;

export function PictoUi({ nom }: { nom: keyof typeof UI }) {
  const t = UI[nom];
  return (
    <svg
      viewBox="0 0 24 24"
      width={t.taille}
      height={t.taille}
      fill="none"
      stroke="currentColor"
      strokeWidth={t.ep}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={t.d} />
    </svg>
  );
}

/** Le cœur « Enregistrer » de l'en-tête, plein quand le logement est enregistré. */
export function PictoCoeur({ plein }: { plein: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={15}
      height={15}
      fill={plein ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}
