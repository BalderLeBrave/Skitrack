/**
 * Les pages de tarifs à relever, domaine par domaine.
 *
 * L'ancien connecteur partait du site enregistré au catalogue (souvent celui
 * de l'office de tourisme) et devinait sept chemins. L'inventaire du
 * 30 septembre 2026 l'a mesuré : il n'atteignait la page des tarifs que pour
 * 3 domaines sur 93. Les tarifs sont publiés par l'exploitant, souvent sur un
 * autre hôte (boutique eLiberty, N'PY, Labellemontagne, SATA, S3V…).
 *
 * Cette table dit, pour chaque forfait :
 *
 * - les **pages** où il est publié, et comment les lire : `html` (servie telle
 *   quelle), `navigateur` (boutique en JavaScript, rendue par Playwright),
 *   `pdf`, ou `image` (grille en image : non lue, faute de lecture d'image) ;
 * - ses **périmètres** : le forfait du domaine relié, celui de la station
 *   seule, ou les deux. `motif` est ce qui, dans un titre de la page, désigne
 *   ce périmètre (texte plié, sans accents) ; le premier de la liste reçoit
 *   ce qu'aucun titre ne rattache ;
 * - les **stations** couvertes : celles que le catalogue rattache aux domaines
 *   cités (`catalogue`), plus celles nommées (`stations`).
 *
 * Un même domaine relié (Les 3 Vallées, Portes du Soleil, Paradiski…) peut
 * être publié par plusieurs sources : le relevé garde la meilleure grille et
 * réunit leurs stations.
 */

export type Lecteur = "html" | "navigateur" | "pdf" | "image";

export type PageTarifs = { url: string; lecteur: Lecteur };

export type PerimetreSource = {
  type: "station" | "domaine";
  nom: string;
  motif?: string;
  catalogue?: string[];
  stations?: string[];
};

/**
 * Une boutique qui ne montre son prix caisse que produit par produit : la page
 * d'un forfait, pour un premier jour de ski et une catégorie, affiche le prix
 * public (barré) et le prix en ligne. Voir `boutique.ts`.
 */
export type BoutiqueTarifs = {
  /** La page qui publie le calendrier tarifaire : les périodes et leurs bornes. */
  calendrier: PageTarifs;
  /** Le périmètre de ces forfaits : son nom, parmi ceux de la source. */
  perimetre: string;
  /** Comment lire une page produit. */
  lecteur: Lecteur;
  /**
   * Une adresse par durée, `{date}` (premier jour de ski, AAAA-MM-JJ) et
   * `{categorie}` (code de la boutique) remplacés à la lecture. La première,
   * avec la première catégorie, sert de repère pour réunir les périodes au
   * même prix.
   */
  produits: string[];
  /** Les codes de catégorie à demander. Le libellé et les âges sont lus sur la
   *  page, jamais déduits du code. */
  categories: string[];
};

export type SourceTarifs = {
  id: string;
  pages: PageTarifs[];
  perimetres: PerimetreSource[];
  boutique?: BoutiqueTarifs;
};

const html = (url: string): PageTarifs => ({ url, lecteur: "html" });
const nav = (url: string): PageTarifs => ({ url, lecteur: "navigateur" });
const pdf = (url: string): PageTarifs => ({ url, lecteur: "pdf" });
const image = (url: string): PageTarifs => ({ url, lecteur: "image" });

const TROIS_VALLEES: PerimetreSource = {
  type: "domaine",
  nom: "Les 3 Vallées",
  motif: "3 vallees|trois vallees",
  catalogue: [
    "val-thorens-orelle",
    "orelle",
    "courchevel",
    "meribel",
    "meribel-mottaret",
    "brides-les-bains",
    "saint-martin-de-belleville",
  ],
};

const PORTES_DU_SOLEIL: PerimetreSource = {
  type: "domaine",
  nom: "Portes du Soleil",
  motif: "portes du soleil",
  catalogue: ["avoriaz-1800", "chatel", "abondance"],
};

const PARADISKI: PerimetreSource = {
  type: "domaine",
  nom: "Paradiski",
  motif: "paradiski|essentiel",
  catalogue: [
    "la-plagne",
    "aime-2000",
    "montchavin-les-coches",
    "plagne-bellecote",
    "champagny-en-vanoise",
    "villaroger",
  ],
};

const EVASION: PerimetreSource = {
  type: "domaine",
  nom: "Evasion Mont-Blanc",
  motif: "evasion",
  catalogue: ["combloux", "saint-nicolas-de-veroce", "les-contamines-montjoie"],
  stations: ["megeve", "le-bettex", "saint-gervais-mont-blanc"],
};

const ESPACE_DIAMANT: PerimetreSource = {
  type: "domaine",
  nom: "Espace Diamant",
  motif: "espace diamant",
  catalogue: [
    "les-saisies-espace-diamant",
    "bisanne-1500",
    "crest-voland-cohennoz",
    "notre-dame-de-bellecombe",
    "praz-sur-arly",
  ],
};

const ALPE_D_HUEZ: PerimetreSource = {
  type: "domaine",
  nom: "Alpe d'Huez Grand Domaine",
  motif: "alpe d'?huez|grand domaine|espace alpe",
  catalogue: [
    "alpe-d-huez-grand-domaine",
    "auris-en-oisans",
    "oz-en-oisans",
    "vaujany",
    "villard-reculas",
  ],
};

const station = (
  nom: string,
  catalogue: string[],
  motif?: string,
  stations?: string[],
): PerimetreSource => ({
  type: "station",
  nom,
  motif,
  catalogue,
  stations,
});

export const SOURCES_TARIFS: SourceTarifs[] = [
  /* ----- Tarentaise ----- */
  {
    id: "val-thorens-orelle",
    pages: [
      html("https://www.valthorens.com/ski/forfaits/forfait-journee/"),
      html("https://www.valthorens.com/ski/forfaits/forfait-6-jours/"),
      html("https://ski.orelle.net/tarifs/"),
      pdf("https://ski.orelle.net/wp-content/uploads/2026/09/Grilles-tarifaires-saison-2627-1.pdf"),
    ],
    perimetres: [
      TROIS_VALLEES,
      station("Val Thorens - Orelle", ["orelle"], "val thorens|orelle", ["val-thorens"]),
    ],
  },
  {
    id: "courchevel",
    pages: [nav("https://www.skipasscourchevel.com/en/courchevel-skipass-prices")],
    perimetres: [
      TROIS_VALLEES,
      station("Vallée de Courchevel", ["courchevel"], "courchevel", [
        "courchevel-le-praz",
        "courchevel-moriond-1650",
        "courchevel-village-1550",
        "la-tania",
      ]),
    ],
  },
  {
    id: "meribel",
    pages: [
      nav("https://www.skipassmeribelmottaret.com/forfaits-meribel"),
      nav("https://www.skipass-meribel.com/fr/tous-les-forfaits-hiver"),
    ],
    perimetres: [
      TROIS_VALLEES,
      station("Vallée de Méribel", ["meribel", "meribel-mottaret", "brides-les-bains"], "meribel", [
        "meribel-village",
      ]),
    ],
  },
  {
    id: "saint-martin-de-belleville",
    pages: [
      html("https://st-martin-belleville.com/en/ski-passes"),
      pdf("https://static.st-martin-belleville.com/files/ski-pass-prices-3-vallees-fr-en.pdf"),
    ],
    perimetres: [
      TROIS_VALLEES,
      station(
        "Les Menuires - Saint-Martin",
        ["saint-martin-de-belleville"],
        "menuires|saint.martin|st martin",
        ["les-menuires"],
      ),
    ],
  },
  {
    id: "la-plagne",
    pages: [nav("https://www.skipass-laplagne.com/en/public-prices")],
    perimetres: [
      PARADISKI,
      station(
        "La Plagne",
        ["aime-2000", "montchavin-les-coches", "plagne-bellecote", "champagny-en-vanoise"],
        "plagne",
        [
          "belle-plagne",
          "la-plagne",
          "la-plagne-montalbert",
          "les-coches",
          "plagne-1800",
          "plagne-centre",
          "plagne-soleil",
          "plagne-villages",
        ],
      ),
    ],
  },
  {
    id: "les-arcs",
    pages: [html("https://www.lesarcs.com/fr/forfaits-et-pass/forfait-ski")],
    perimetres: [
      PARADISKI,
      station("Les Arcs - Peisey-Vallandry", ["villaroger"], "arcs|peisey|classique", [
        "arc-1600",
        "arc-1800",
        "arc-1950",
        "arc-2000",
        "les-arcs-bourg-st-maurice",
        "peisey-vallandry",
      ]),
    ],
  },
  {
    id: "tignes-val-d-isere",
    pages: [html("https://www.tignes.net/ski/forfaits-ski")],
    perimetres: [
      {
        type: "domaine",
        nom: "Tignes - Val d'Isère",
        motif: "val d'?isere",
        catalogue: ["tignes-val-d-isere", "tignes-le-lac", "tignes-les-brevieres"],
      },
      station("Tignes", ["tignes-le-lac", "tignes-les-brevieres"], "tignes", [
        "tignes",
        "tignes-les-boisses",
        "tignes-val-claret",
      ]),
    ],
  },
  {
    id: "sainte-foy-tarentaise",
    pages: [
      html(
        "https://www.saintefoy-tarentaise.com/a-faire/activites-hiver/ski-et-snowboard/forfaits-de-ski/",
      ),
    ],
    perimetres: [station("Sainte-Foy-Tarentaise", ["sainte-foy-tarentaise"])],
  },
  {
    id: "la-rosiere",
    pages: [html("https://www.larosiere.net/forfaits-de-ski/")],
    perimetres: [
      {
        type: "domaine",
        nom: "Espace San Bernardo",
        motif: "san bernardo",
        catalogue: ["la-rosiere-1850"],
      },
      station("La Rosière", ["la-rosiere-1850"], "rosiere"),
    ],
  },
  {
    id: "areches-beaufort",
    pages: [
      nav("https://www.areches-beaufort.ski/fr/tarifs-forfaitsalpin"),
      pdf(
        "https://www.areches-beaufort.ski/media/download/arechesb2c/cms/media/PDF/Grille%20publique%2026-27.pdf",
      ),
    ],
    perimetres: [station("Arêches-Beaufort", ["areches-beaufort"])],
  },
  {
    id: "grand-domaine-valmorel",
    pages: [
      html("https://skipass.valmorel.com/fr/tarifs-forfaits-valmorel"),
      html("https://stfrancois.labellemontagne.com/fr/hiver/forfaits/"),
    ],
    perimetres: [
      {
        type: "domaine",
        nom: "Valmorel - Le Grand Domaine",
        motif: "grand domaine",
        catalogue: ["valmorel-le-grand-domaine", "saint-francois-longchamp"],
      },
      station("Valmorel", ["valmorel-le-grand-domaine"], "valmorel"),
      station("Saint-François-Longchamp", ["saint-francois-longchamp"], "saint.francois|longchamp"),
    ],
  },

  /* ----- Haute-Savoie ----- */
  {
    id: "abondance",
    pages: [html("https://www.skipass-abondance.com/fr/abdce-mde")],
    perimetres: [station("Abondance", ["abondance"], "abondance"), PORTES_DU_SOLEIL],
  },
  {
    id: "avoriaz",
    pages: [
      html("https://www.avoriaz.com/decouvrir/les-incontournables/tarifs-des-forfaits-hiver/"),
    ],
    perimetres: [PORTES_DU_SOLEIL, station("Avoriaz", ["avoriaz-1800"], "avoriaz", ["avoriaz"])],
  },
  {
    id: "chatel",
    pages: [html("https://www.skipass-chatel.com/fr/tarifs-hiver")],
    perimetres: [PORTES_DU_SOLEIL, station("Espace Liberté", ["chatel"], "liberte")],
    // La page tarifs-hiver ne publie que les prix internet, un par période
    // dans chaque case. Le prix caisse du forfait « Portes du Soleil HIVER »
    // se lit sur la page de chaque produit (vérifié le 30 septembre 2026 :
    // 6 jours adulte, 373 € du 19 décembre au 19 mars, 317 € ensuite).
    boutique: {
      calendrier: html("https://www.skipass-chatel.com/fr/tarifs-hiver"),
      perimetre: "Portes du Soleil",
      lecteur: "navigateur",
      produits: [
        "6-jours",
        "5-heures-",
        "1-jour-f",
        "2-jours",
        "3-jours-",
        "4-jours-",
        "5-jours",
        "7-jours",
        "8-jours",
        "9-jours",
        "10-jours",
        "11-jours",
        "12-jours",
        "13-jours",
        "14-jours",
        "15-jours-",
      ].map(
        (produit) =>
          `https://www.skipass-chatel.com/fr/forfait-ski/${produit}-portes-du-soleil-37710/?s={date}&sk%5B0%5D%5Bcc%5D={categorie}`,
      ),
      // ADULT, CHILD et SENIOR vérifiés ; le code de « Jeune 16-25 ans » n'est
      // pas publié (JUNIOR sert l'enfant, YOUTH rien).
      categories: ["ADULT", "CHILD", "SENIOR"],
    },
  },
  {
    id: "grand-massif",
    pages: [
      html("https://www.flaine.com/forfaits-ski/"),
      html("https://www.grand-massif.com/en/ski-offers/package-rates/"),
    ],
    perimetres: [
      {
        type: "domaine",
        nom: "Le Grand Massif",
        motif: "grand massif",
        catalogue: ["flaine", "morillon", "sixt-fer-a-cheval"],
      },
      station("Flaine", [], "flaine", ["flaine"]),
      station("Pass Villages", ["morillon", "sixt-fer-a-cheval"], "villages", [
        "les-carroz",
        "samoens",
        "samoens-1600",
        "haut-giffre",
      ]),
    ],
  },
  {
    id: "chamonix",
    pages: [
      nav("https://www.montblancnaturalresort.com/fr/billetterie"),
      html(
        "https://en.chamonix.com/things-to-see-and-do/sports-and-outdoor/skiing-in-chamonix-mont-blanc-valley/list-of-ski-areas/ski-area-balme-vallorcine",
      ),
    ],
    perimetres: [
      {
        type: "domaine",
        nom: "Chamonix Le Pass",
        motif: "chamonix le pass|le pass",
        catalogue: ["chamonix-les-grands-montets", "vallorcine"],
        stations: ["argentiere", "le-tour"],
      },
    ],
  },
  {
    id: "les-houches",
    pages: [nav("https://leshouches.montblancnaturalresort.com/fr")],
    perimetres: [station("Les Houches - Saint-Gervais", ["les-houches"])],
  },
  {
    id: "les-contamines",
    pages: [html("https://www.lescontamines.com/hiver/skier/domaine-alpin/tarifs")],
    perimetres: [station("Les Contamines", ["les-contamines-montjoie"], "contamines"), EVASION],
  },
  {
    id: "evasion-mont-blanc",
    pages: [
      html("https://www.ski-saintgervais.com/fr/tarifs-evasion-mont-blanc"),
      html("https://www.combloux.com/profiter/ski/forfaits-ski/"),
      html(
        "https://www.lesportesdumontblanc.fr/hiver/tarifs-hiver-ski-portes-du-mont-blanc-et-evasion/",
      ),
      pdf(
        "https://www.lesportesdumontblanc.fr/hiver/wp-content/uploads/sites/2/2026/08/Tarifs-generaux-2026-2027-1.pdf",
      ),
    ],
    perimetres: [
      EVASION,
      {
        type: "domaine",
        nom: "Les Portes du Mont-Blanc",
        motif: "portes du mont.blanc",
        catalogue: ["combloux"],
        stations: ["la-giettaz", "cordon"],
      },
    ],
  },
  {
    id: "aravis",
    pages: [
      html("https://forfait.laclusaz.com/fr/tarifs-forfait-la-clusaz"),
      html("https://manigod.labellemontagne.com/fr/hiver/forfaits/"),
    ],
    perimetres: [
      {
        type: "domaine",
        nom: "La Clusaz - Manigod",
        motif: "clusaz",
        catalogue: ["la-clusaz", "manigod-la-croix-fry"],
      },
      station("Manigod", ["manigod-la-croix-fry"], "manigod"),
    ],
  },
  {
    id: "le-grand-bornand",
    pages: [html("https://pass.legrandbornand.com/fr/tarifs")],
    perimetres: [station("Le Grand-Bornand", ["le-grand-bornand"])],
  },
  {
    id: "praz-de-lys-sommand",
    pages: [
      html("https://espacedeslys.com/fr/tarifs"),
      pdf(
        "https://espacedeslys.com/media/download/prazdelysb2c/cms/media/PDF/Flyer%20tarifs/flyer%20tarifs%202026-2027.pdf",
      ),
    ],
    perimetres: [station("Praz de Lys - Sommand", ["praz-de-lys-sommand"])],
  },
  {
    id: "les-brasses",
    pages: [nav("https://lesbrasses.axess.shop/fr/Products/Tickets/")],
    perimetres: [station("Les Brasses", ["les-brasses"])],
  },
  {
    id: "thollon-les-memises",
    pages: [
      html(
        "https://www.leman-mountains-explore.com/decouvrir/les-stations/station-de-thollon-les-memises/",
      ),
    ],
    perimetres: [station("Thollon-les-Mémises", ["thollon-les-memises"])],
  },

  /* ----- Savoie : Val d'Arly, Maurienne, Bauges ----- */
  {
    id: "espace-diamant",
    pages: [
      html("https://skipass.lessaisies.com/fr/forfaitsalpins"),
      pdf(
        "https://www.lessaisies.com/app/uploads/les-saisies/2026/08/Les-Saisies_Grille-tarifaire-2026-2027-1.pdf",
      ),
      html("https://notredamebellecombe.labellemontagne.com/fr/hiver/forfaits/"),
      html("https://www.prazsurarly.com/fr/mon-forfait-de-ski"),
      nav("https://forfait.crestvoland.com/"),
    ],
    perimetres: [
      ESPACE_DIAMANT,
      station("Val d'Arly", ["notre-dame-de-bellecombe", "praz-sur-arly"], "val d'?arly"),
      station("Les Saisies", ["les-saisies-espace-diamant", "bisanne-1500"], "saisies"),
    ],
  },
  {
    id: "les-sybelles",
    pages: [
      html("https://www.sybelles.ski/skier-aux-sybelles/forfaits-tarifs/"),
      nav("https://sybelles.skiperformance.com/fr/hiver/store#/fr/hiver/buy?skugroup_id=5952"),
    ],
    perimetres: [
      {
        type: "domaine",
        nom: "Les Sybelles",
        motif: "sybelles",
        catalogue: ["la-toussuire-les-sybelles"],
      },
    ],
  },
  {
    id: "galibier-thabor",
    pages: [
      html("https://skipass.valloire.com/fr/tous-les-tarifs"),
      pdf(
        "https://www.skipass-valmeinier.com/media/download/valmeinierb2c/cms/media/GT%20TP%202627%20fr.pdf",
      ),
    ],
    perimetres: [
      {
        type: "domaine",
        nom: "Galibier-Thabor",
        motif: "galibier",
        catalogue: ["valloire-galibier-thabor", "valmeinier"],
      },
    ],
  },
  {
    id: "la-norma",
    pages: [html("https://www.la-norma.ski/tarifs-forfaits-de-ski/")],
    perimetres: [station("La Norma", ["la-norma"])],
  },
  {
    id: "valfrejus",
    pages: [html("https://www.valfrejus.ski/en/ski-passes-prices/")],
    perimetres: [station("Valfréjus", ["valfrejus"])],
  },
  {
    id: "aussois",
    pages: [html("https://www.aussois.com/ski-et-glisse/les-forfaits-de-ski/")],
    perimetres: [station("Aussois", ["aussois"])],
  },
  {
    id: "bessans",
    pages: [
      pdf(
        "https://www.bessans.ski/media/download/bessansb2c/cms/media/Hiver%202026%20-%202027/TARIFS%20DU%20DOMAINE%20SKIABLE%202026.pdf",
      ),
    ],
    perimetres: [station("Bessans", ["bessans"])],
  },
  {
    id: "bonneval-sur-arc",
    pages: [html("https://www.bonneval-hautemaurienne.ski/nos-forfaits/sejour/")],
    perimetres: [station("Bonneval-sur-Arc", ["bonneval-sur-arc"])],
  },
  {
    id: "val-cenis",
    pages: [html("https://www.valcenis.com/ski-et-glisse/les-forfaits-de-ski/")],
    perimetres: [
      station("Val Cenis", ["termignon"], "val cenis", [
        "val-cenis",
        "lanslebourg",
        "lanslevillard",
      ]),
    ],
  },
  {
    id: "les-karellis",
    pages: [html("https://www.leskarellis.com/fr/tarifs-2026-2027-sans-lien")],
    perimetres: [station("Les Karellis", ["les-karellis"])],
  },
  {
    id: "savoie-grand-revard",
    pages: [
      html("https://forfaits.savoiegrandrevard.com/tarifs/"),
      pdf(
        "https://forfaits.savoiegrandrevard.com/wp-content/uploads/2026/08/Tarifs-ALPIN-SGR-26-27.pdf",
      ),
    ],
    perimetres: [station("Savoie Grand Revard", ["savoie-grand-revard"])],
  },

  /* ----- Isère, Hautes-Alpes ----- */
  {
    id: "alpe-d-huez",
    pages: [
      html(
        "https://skipass.auris-en-oisans.fr/tous-les-forfaits/ski-a-la-journee-promo-samedi/ski-a-la-journee/",
      ),
      html("https://www.oz-vaujany.com/hiver/en/skipass-stay/"),
      html("https://www.villard-reculas.com/villard-reculas/forfaits/"),
    ],
    perimetres: [
      ALPE_D_HUEZ,
      station("Auris", ["auris-en-oisans"], "auris"),
      station("Oz - Vaujany", ["oz-en-oisans", "vaujany"], "oz|vaujany"),
      station("Villard-Reculas", ["villard-reculas"], "villard.reculas"),
    ],
  },
  {
    id: "les-2-alpes",
    pages: [html("https://www.skipass-2alpes.com/fr/tarifs")],
    perimetres: [station("Les 2 Alpes", ["les-2-alpes"])],
  },
  {
    id: "alpe-du-grand-serre",
    pages: [image("https://www.matheysine-tourisme.com/en/alpe-du-grand-serre/ski-lift-passes/")],
    perimetres: [station("L'Alpe du Grand Serre", ["alpe-du-grand-serre"])],
  },
  {
    id: "chamrousse",
    pages: [html("https://www.chamrousse.com/tarifs-ski-alpin.html")],
    perimetres: [station("Chamrousse", ["chamrousse", "chamrousse-1750"])],
  },
  {
    id: "les-7-laux",
    pages: [
      html("https://www.les7laux.com/hiver/ski-alpin-nordique-autres-glisses/ski/forfaits-tarifs/"),
    ],
    perimetres: [station("Les 7 Laux", ["les-7-laux", "le-pleynet", "prapoutel-les-7-laux"])],
  },
  {
    id: "lans-en-vercors",
    pages: [nav("https://skipass.lansenvercors.com/fr/tarifs-ski-alpin-2026-2027")],
    perimetres: [station("Lans-en-Vercors", ["lans-en-vercors"])],
  },
  {
    id: "villard-correncon",
    pages: [image("https://www.villardcorrencon.com/fr/GRILLETARIFAIREHIVER2627")],
    perimetres: [
      station("Villard-de-Lans - Corrençon", ["correncon-en-vercors"], undefined, [
        "villard-de-lans",
      ]),
    ],
  },
  {
    id: "serre-chevalier",
    pages: [html("https://www.serrechevalier-pass.com/fr/grille-tarifaire")],
    perimetres: [station("Serre Chevalier Vallée", ["serre-chevalier-vallee"])],
  },
  {
    id: "les-orres",
    pages: [
      html("https://www.lesorres.com/skier-aux-orres/le-domaine-skiable/les-forfaits-de-ski"),
    ],
    perimetres: [station("Les Orres", ["les-orres"])],
  },
  {
    id: "le-devoluy",
    pages: [nav("https://ledevoluy.skiperformance.com/fr/hiver/store#/fr/hiver/support/prices")],
    perimetres: [station("Le Dévoluy", ["superdevoluy-la-joue-du-loup", "la-joue-du-loup"])],
  },

  /* ----- Alpes du Sud, Jura, Vosges, Massif central ----- */
  {
    id: "pra-loup",
    pages: [html("https://www.praloup.ski/fr/tarif")],
    perimetres: [station("Pra-Loup", ["pra-loup-val-d-allos"])],
  },
  {
    id: "val-d-allos-le-seignus",
    pages: [
      pdf(
        "https://www.seignus-allos.fr/media/download/leseignusb2c/cms/media/documents/GRILLE%20TARIFAIRE%20HIVER%2026-27-.pdf",
      ),
    ],
    perimetres: [station("Val d'Allos - Le Seignus", ["val-d-allos-le-seignus"])],
  },
  {
    id: "montclar",
    pages: [nav("https://montclar.axess.shop/fr/Products/Tickets/")],
    perimetres: [station("Montclar", ["montclar-saint-jean"])],
  },
  {
    id: "auron",
    pages: [
      html("https://hiver.auron.com/forfaits/forfaits-sejour/"),
      html("https://hiver.auron.com/forfaits/tarifs-journee-1-2-journee/"),
    ],
    perimetres: [station("Auron", ["auron"])],
  },
  {
    id: "isola-2000",
    pages: [html("https://isola2000.com/forfaits-ski/")],
    perimetres: [station("Isola 2000", ["isola-2000"])],
  },
  {
    id: "valberg",
    pages: [
      html("https://www.valberg.com/les-activites/sports-dhiver/ski-alpin-snowboard/forfaits/"),
      pdf("https://www.valberg.com/app/uploads/2024/03/valberg-tarifs-hiver-25-26-1.pdf"),
    ],
    perimetres: [
      { type: "domaine", nom: "Valberg - Beuil", catalogue: ["valberg", "beuil-les-launes"] },
    ],
  },
  {
    id: "metabief",
    pages: [html("https://www.station-metabief.com/fr/tarifs")],
    perimetres: [station("Métabief", ["jougne-metabief"])],
  },
  {
    id: "les-rousses",
    pages: [
      html("https://www.jurasurleman.com/domaine-skiable/tarifs-des-forfaits-et-assurances/"),
    ],
    perimetres: [station("Les Rousses", ["les-rousses", "bellefontaine"])],
  },
  {
    id: "monts-jura",
    pages: [html("https://skipass.paysdegex-montsjura.com/fr/tous-les-tarifs")],
    perimetres: [
      station("Monts Jura", ["monts-jura-mijoux-lelex"]),
      // Sa grille est sur la même page, sous l'intertitre « ► Menthières ».
      station("Menthières", [], "menthieres", ["menthieres"]),
    ],
  },
  {
    id: "lac-blanc",
    pages: [
      html("https://www.lac-blanc.com/en/winter/ski-and-snowboard-vosges/alpine-lift-pass-prices/"),
    ],
    perimetres: [station("Le Lac Blanc", ["le-lac-blanc-orbey"])],
  },
  {
    id: "le-lioran",
    pages: [html("https://www.lelioran.com/hiver/les-tarifs/")],
    perimetres: [station("Le Lioran", ["le-lioran"])],
  },
  {
    id: "le-mont-dore",
    pages: [html("https://lemontdore.fr/ski/les-forfaits-mont-dore")],
    perimetres: [station("Le Mont-Dore", ["le-mont-dore"])],
  },
  {
    id: "super-besse",
    pages: [html("https://superbesse.com/domaine-skiable/forfaits/")],
    perimetres: [station("Super-Besse", ["besse-super-besse"])],
  },

  /* ----- Pyrénées ----- */
  {
    id: "grand-tourmalet",
    pages: [html("https://www.n-py.com/fr/grand-tourmalet/forfaits-ski")],
    perimetres: [{ type: "domaine", nom: "Grand Tourmalet", catalogue: ["bareges-la-mongie"] }],
  },
  {
    id: "saint-lary",
    pages: [nav("https://forfaits.altiservice.com/saint-lary/")],
    perimetres: [
      station("Saint-Lary", ["saint-lary-soulan"], undefined, [
        "espiaube",
        "saint-lary-pla-d-adet",
      ]),
    ],
  },
  {
    id: "peyragudes",
    pages: [
      html("https://www.n-py.com/fr/peyragudes/forfaits-ski"),
      image("https://peyragudes.com/forfaits-ski/"),
    ],
    perimetres: [station("Peyragudes", ["peyragudes"])],
  },
  {
    id: "piau-engaly",
    pages: [html("https://www.n-py.com/fr/piau-engaly/forfaits-ski")],
    perimetres: [station("Piau-Engaly", ["piau-engaly"])],
  },
  {
    id: "gourette",
    pages: [html("https://www.n-py.com/fr/gourette/forfaits-ski")],
    perimetres: [station("Gourette", ["gourette"])],
  },
  {
    id: "luz-ardiden",
    pages: [html("https://www.n-py.com/fr/luz-ardiden/forfaits-ski")],
    perimetres: [station("Luz Ardiden", ["luz-ardiden"])],
  },
  {
    id: "gavarnie",
    pages: [html("https://www.ski-gavarnie.com/fr/forfait-saison")],
    perimetres: [station("Gavarnie-Gèdre", ["gavarnie-gedre"])],
  },
  {
    id: "superbagneres",
    pages: [nav("https://billetterie-superbagneres.hg-montagne.com/ski-pass")],
    perimetres: [station("Luchon-Superbagnères", ["superbagneres-luchon"])],
  },
  {
    id: "le-mourtis",
    pages: [nav("https://billetterie-lemourtis.hg-montagne.com/shop")],
    perimetres: [station("Le Mourtis", ["le-mourtis-boutx"])],
  },
  {
    id: "guzet",
    pages: [html("https://abonnement.guzet.ski/fr/tarifs")],
    perimetres: [station("Guzet", ["guzet"])],
  },
  {
    id: "ax-3-domaines",
    pages: [html("https://www.ax.ski/fr/forfait-journee-ax")],
    perimetres: [station("Ax 3 Domaines", ["ax-3-domaines"])],
  },
  {
    id: "font-romeu",
    pages: [nav("https://forfaits.altiservice.com/font-romeu-pyrenees-2000/")],
    perimetres: [
      station("Font-Romeu Pyrénées 2000", ["font-romeu-pyrenees-2000"], undefined, [
        "bolquere-pyrenees-2000",
      ]),
    ],
  },
  {
    id: "les-angles",
    pages: [html("https://forfait-ski.lesangles.com/fr/tarifs-billetterie-hiver")],
    perimetres: [station("Les Angles", ["les-angles"])],
  },
  {
    id: "trio-pyrenees",
    pages: [html("https://www.trio-pyrenees.com/porte-puymorens/forfaits-ski/")],
    perimetres: [
      {
        type: "domaine",
        nom: "Trio Pyrénées",
        catalogue: ["porte-puymorens"],
        stations: ["formigueres", "eyne-cambre-daze"],
      },
    ],
  },

  /* ----- Petites stations : pages officielles trouvées le 30 septembre 2026 ----- */
  // Stations que seuls Skiinfo, skiresort ou bergfex renseignaient (journée
  // seule, ou sans tarif enfant). Lues et contre-vérifiées à la main le
  // 30 septembre 2026 ; ce que le lecteur ne sait pas lire sans deviner (grille
  // en image, prix en cartes sans libellé) finit en échec au rapport.
  {
    id: "bernex",
    pages: [html("https://www.bernexstation.fr/fr/tarifs-journee")],
    perimetres: [station("Bernex", [], undefined, ["bernex"])],
  },
  {
    // Le forfait Queyras (2 à 14 jours) vaut sur Arvieux, Ceillac, Abriès et
    // Molines-Saint-Véran ; la boutique (queyras.skiperformance.com) ne rend
    // rien sans JavaScript, la grille de la Régie est en PDF. Ses forfaits
    // journée sont rangés par domaine en colonnes : le lecteur n'en garde que
    // la première, et le dit.
    id: "queyras",
    pages: [
      pdf(
        "https://lequeyras.com/app/uploads/guillestrois-queyras/2026/09/STATIONS-QUEYRAS-TARIFS-FORFAITS-2026-2027.pdf",
      ),
    ],
    perimetres: [
      {
        type: "domaine",
        nom: "Queyras",
        motif: "queyras",
        stations: [
          "abries",
          "aiguilles",
          "arvieux",
          "ceillac",
          "le-queyras",
          "molines-en-queyras",
          "ristolas",
          "saint-veran",
        ],
      },
    ],
  },
  {
    id: "la-pierre-st-martin",
    pages: [html("https://www.lapierrestmartin.com/ski/les-forfaits/ski/")],
    perimetres: [station("La Pierre Saint-Martin", [], undefined, ["la-pierre-st-martin"])],
  },
  {
    id: "greolieres",
    pages: [
      html(
        "https://stations-greolieres-audibergue.com/greolieres/station-greolieres-hiver/100-neige/ski-alpin/tarifs/",
      ),
    ],
    perimetres: [station("Gréolières-les-Neiges", [], undefined, ["greolieres-audibergue"])],
  },
  {
    // La grille de la station, publiée en PDF sur la fiche de l'office de
    // tourisme de l'Ariège (Apidae) : le site de la station ne la porte pas.
    id: "goulier",
    pages: [
      pdf(
        "https://static.apidae-tourisme.com/filestore/objets-touristiques/documents/162/227/36758434/2025-2026TARIFS_FORFAITS_GOULIER.pdf",
      ),
    ],
    perimetres: [station("Goulier", [], undefined, ["goulier"])],
  },
  {
    id: "xonrupt",
    pages: [pdf("https://www.xonrupt.fr/view_document.php?id=563")],
    perimetres: [station("Le Poli (Xonrupt-Longemer)", [], undefined, ["xonrupt-le-poli"])],
  },
  {
    id: "autrans-meaudre",
    pages: [
      pdf(
        "https://media.station.autrans-meaudre.fr/filer_public/5c/91/5c915180-69e7-4385-8c7b-d74108b3123a/tarifs_hiver_alpin_25-26.pdf",
      ),
    ],
    perimetres: [{ type: "domaine", nom: "Autrans-Méaudre", stations: ["autrans"] }],
  },
  {
    id: "bussang-larcenaire",
    pages: [image("https://www.larcenaire.fr/Nos%20tarifs.htm")],
    perimetres: [station("Larcenaire", [], undefined, ["bussang-larcenaire"])],
  },
  {
    id: "le-granier",
    pages: [html("https://www.stationdugranier.com/les-tarifs")],
    perimetres: [station("Le Granier", [], undefined, ["le-granier-vallee-des-entremonts"])],
  },
  {
    id: "terre-ronde",
    pages: [
      html(
        "https://www.hautbugey-tourisme.com/bouger/activites-nature/hiver/forfaits-ecole-de-ski/",
      ),
    ],
    perimetres: [station("Terre Ronde", [], undefined, ["hauteville-lompnes"])],
  },
  {
    id: "la-schlucht",
    pages: [html("https://laschlucht.labellemontagne.com/fr/hiver/forfaits/")],
    perimetres: [station("La Schlucht", [], undefined, ["la-schlucht"])],
  },
  {
    // La page affiche encore la grille de l'hiver 2016-2017 : relevée comme
    // telle, elle ne vaut que pour cette saison.
    id: "col-de-l-arzelier",
    pages: [html("https://col-de-larzelier.fr/index.php/bouger/tarifs-des-remontees")],
    perimetres: [station("Col de l'Arzelier", [], undefined, ["col-de-l-arzelier"])],
  },
  {
    id: "puy-saint-vincent",
    pages: [html("https://www.puysaintvincent.com/forfait-ski-puy-saint-vincent")],
    perimetres: [{ type: "domaine", nom: "Puy-Saint-Vincent", catalogue: ["puy-saint-vincent"] }],
  },
  {
    id: "ascou",
    pages: [html("https://www.ascou.ski/fr/forfait-sejour")],
    perimetres: [station("Ascou", [], undefined, ["ascou-pailheres"])],
  },
  {
    id: "camurac",
    pages: [
      html("https://www.station-camurac.com/station-de-ski-1/les-forfaits/forfait-journ%C3%A9e/"),
    ],
    perimetres: [station("Camurac", [], undefined, ["camurac"])],
  },
  {
    // Domaine nordique : la page ne publie que ski de fond, raquettes et luge,
    // que le lecteur écarte. Le 6 jours alpin du catalogue n'y a pas d'appui.
    id: "le-chioula",
    pages: [html("https://www.beille.fr/tarifs-station-le-chioula.html")],
    perimetres: [station("Le Chioula", ["le-chioula"])],
  },
  {
    id: "les-monts-dolmes",
    pages: [html("https://www.montsdolmes.ski/fr/forfait-sejour-mdo")],
    perimetres: [station("Les Monts d'Olmes", [], undefined, ["les-monts-dolmes"])],
  },
  {
    id: "mijanes",
    pages: [image("https://www.ski-mijanes.fr/c/ski-et-glisse-1")],
    perimetres: [station("Mijanès-Donezan", [], undefined, ["mijanes-donezan"])],
  },
  {
    id: "col-du-feu",
    pages: [html("https://www.lullin.fr/Stade-de-neige-du-col-du-feu-186")],
    perimetres: [station("Col du Feu", [], undefined, ["lullin"])],
  },
  {
    id: "mont-saxonnex",
    pages: [html("https://www.mont-saxonnex.fr/domaine-skiable/")],
    perimetres: [station("Mont-Saxonnex", [], undefined, ["mont-saxonnex"])],
  },
  {
    // Fiche de l'office de tourisme : le domaine des 3 villages n'a pas de
    // site d'exploitant.
    id: "romme",
    pages: [
      html(
        "https://www.cluses-montagnes-tourisme.com/domaine/domaine-skiable-les-3-villages-romme/",
      ),
    ],
    perimetres: [station("Romme", [], undefined, ["romme"])],
  },
  {
    id: "les-signaraux",
    pages: [html("https://www.lessignaraux.com/tarifs")],
    perimetres: [station("Les Signaraux", [], undefined, ["la-motte-d-aveillans"])],
  },
  {
    id: "saint-hilaire-du-touvet",
    pages: [html("https://www.station-ski-saint-hilaire.fr/")],
    perimetres: [station("Saint-Hilaire-du-Touvet", [], undefined, ["saint-hilaire-du-touvet"])],
  },
  {
    id: "alti-aigoual",
    pages: [html("https://www.stationaltiaigoual.com/ski-pass-forfaits")],
    perimetres: [station("Prat-Peyrot", [], undefined, ["mont-aigoual"])],
  },
  {
    id: "champ-du-feu",
    pages: [
      html(
        "https://destination.montchampdufeu.com/fr/domaine-skiable-alpin/forfaits-ski-champ-du-feu.html",
      ),
    ],
    perimetres: [station("Le Champ du Feu", [], undefined, ["le-champ-du-feu"])],
  },
  {
    id: "ghisoni",
    pages: [html("https://www.ghisoni.corsica/station-ghisoni-capanelle")],
    perimetres: [station("Ghisoni", [], undefined, ["ghisoni"])],
  },
  {
    id: "planche-des-belles-filles",
    pages: [html("https://planchedesbellesfilles.fr/activites-hiver/ski-alpin/")],
    perimetres: [station("La Planche des Belles Filles", [], undefined, ["rouge-gazon"])],
  },
];
