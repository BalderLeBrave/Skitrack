/**
 * Échantillon réel des logements : par source, la part des annonces dont la
 * description, les équipements, les chambres, la capacité, le GPS, la photo et
 * le prix sont renseignés — tels que l'écran les lit (`stay/manques.ts`) —, et
 * la liste de celles qui ne le sont pas, avec leur lien et ce qui leur manque.
 *
 * À lancer sur une machine qui a accès aux plateformes, depuis la racine du
 * dépôt. Le relevé passe par les collecteurs de l'application, avec leur
 * politique de lecture (robots.txt, débit, pauses) : rien n'est contourné.
 * Chaque station est relevée l'une après l'autre, puis sa seconde passe
 * (fiches) comme sur l'écran Logements.
 *
 *   node --import ./scripts/echantillon/enregistrer.mjs --experimental-strip-types \
 *     scripts/echantillon/logements.ts --etiquette avant
 *
 * Options :
 *   --etiquette <nom>        nom du fichier rendu (défaut : « echantillon ») ;
 *   --du <AAAA-MM-JJ>        arrivée (défaut : 2027-02-06) ;
 *   --au <AAAA-MM-JJ>        départ (défaut : 2027-02-13) ;
 *   --voyageurs <n>          défaut : 4 ;
 *   --par-source <n>         stations par source, 2 ou 3 (défaut : 2) ;
 *   --sources <a,b>          seulement ces sources (« Airbnb », « Ingénie »,
 *                            « Alpissime »…) ;
 *   --sans-fiches            sans la seconde passe ;
 *   --echelonnement <min>    relève comme l'écran Logements (domaine, suite
 *                            de pages, fiches lues en tâche de fond par chaque
 *                            source, à son rythme), attend <min> minutes, puis
 *                            repose sans réseau ce que les mémoires ont gardé
 *                            (fiches, contenu) avant de compter. Sans cette
 *                            option, le relevé est celui des échantillons
 *                            d'avant : comparable avec eux ;
 *   --fiches-airbnb [N]      lit aussi les fiches Airbnb des annonces sans
 *                            capacité ou sans chambres, N par station au plus
 *                            (60 par défaut), comme la complétion de l'écran
 *                            Prix : même limiteur, même pause entre deux
 *                            fiches, arrêt au premier refus ;
 *   --comparer <a.json> <b.json>
 *                            compare deux échantillons, sans réseau.
 *
 * Lit l'ancien schéma (`guests`, `origins`) comme le nouveau (`capacity`,
 * `bedroomsSource`, `capacitySource`) : le même script mesure l'avant et
 * l'après.
 */
import { readFileSync, writeFileSync } from "node:fs";

type Annonce = Record<string, unknown> & {
  id: string;
  title: string;
  source: string;
  url: string | null;
  bedrooms: number | null;
};

type Cible = {
  stationId: string;
  part: "airbnb" | "gites" | "cozy" | "greengo" | "agences" | "centrales";
};

type Compte = {
  annonces: number;
  /** Absents des échantillons d'avant le 15 octobre 2026 : « - » à la comparaison. */
  sansDescription?: number;
  sansEquipements?: number;
  sansGps?: number;
  sansPhoto?: number;
  sansPrix?: number;
  sansChambres: number;
  sansCapacite: number;
  sansLesDeux: number;
  studios: number;
  sourcesChambres: Record<string, number>;
  sourcesCapacite: Record<string, number>;
};

type Nul = {
  source: string;
  station: string;
  id: string;
  titre: string;
  url: string | null;
  chambres: number | null;
  capacite: number | null;
  /** Ce qui manque à l'annonce, parmi `CHAMPS`. */
  manque?: string[];
};

type Echantillon = {
  etiquette: string;
  date: string;
  sejour: { du: string; au: string; voyageurs: number };
  cibles: Array<
    Cible & { sources: Array<{ source: string; ok: boolean; count: number; error?: string }> }
  >;
  releve: Record<string, Compte>;
  final: Record<string, Compte>;
  nuls: Nul[];
};

/* ---------- Lecture des deux schémas ---------- */

function capaciteDe(l: Annonce): number | null {
  const v = l.capacity ?? l.guests;
  return typeof v === "number" ? v : null;
}

function origines(l: Annonce): Record<string, string> {
  const o = l.origins;
  return o && typeof o === "object" ? (o as Record<string, string>) : {};
}

function sourceChambres(l: Annonce): string {
  const s = l.bedroomsSource ?? origines(l).bedrooms;
  return typeof s === "string" ? s : "inconnue";
}

function sourceCapacite(l: Annonce): string {
  const s = l.capacitySource ?? origines(l).guests;
  return typeof s === "string" ? s : "inconnue";
}

/* ---------- Comptes ---------- */

function vide(): Compte {
  return {
    annonces: 0,
    sansDescription: 0,
    sansEquipements: 0,
    sansGps: 0,
    sansPhoto: 0,
    sansPrix: 0,
    sansChambres: 0,
    sansCapacite: 0,
    sansLesDeux: 0,
    studios: 0,
    sourcesChambres: {},
    sourcesCapacite: {},
  };
}

/** Ce qui manque à une annonce, lu comme l'écran le lit (`stay/manques.ts`). */
function manquesDe(l: Annonce): string[] {
  return manquesListing({ ...(l as never), capacity: capaciteDe(l) });
}

function compter(parSource: Record<string, Compte>, nom: string, l: Annonce): void {
  const c = (parSource[nom] ??= vide());
  const chambres = l.bedrooms;
  const capacite = capaciteDe(l);
  const manque = manquesDe(l);
  c.annonces += 1;
  if (manque.includes("description")) c.sansDescription = (c.sansDescription ?? 0) + 1;
  if (manque.includes("equipements")) c.sansEquipements = (c.sansEquipements ?? 0) + 1;
  if (manque.includes("gps")) c.sansGps = (c.sansGps ?? 0) + 1;
  if (manque.includes("photo")) c.sansPhoto = (c.sansPhoto ?? 0) + 1;
  if (manque.includes("prix")) c.sansPrix = (c.sansPrix ?? 0) + 1;
  if (chambres == null) c.sansChambres += 1;
  else c.sourcesChambres[sourceChambres(l)] = (c.sourcesChambres[sourceChambres(l)] ?? 0) + 1;
  if (capacite == null) c.sansCapacite += 1;
  else c.sourcesCapacite[sourceCapacite(l)] = (c.sourcesCapacite[sourceCapacite(l)] ?? 0) + 1;
  if (chambres == null && capacite == null) c.sansLesDeux += 1;
  if (l.isStudio === true || chambres === 0) c.studios += 1;
}

const pct = (n: number, sur: number): string =>
  sur > 0 ? `${Math.round((100 * n) / sur)} %` : "-";

/** Les colonnes : le nom affiché, et le compte des annonces où le champ manque. */
const COLONNES: Array<[string, (c: Compte) => number | undefined]> = [
  ["Description", (c) => c.sansDescription],
  ["Équipements", (c) => c.sansEquipements],
  ["Chambres", (c) => c.sansChambres],
  ["Capacité", (c) => c.sansCapacite],
  ["GPS", (c) => c.sansGps],
  ["Photo", (c) => c.sansPhoto],
  ["Prix", (c) => c.sansPrix],
];

/** La part renseignée ; « - » quand l'échantillon ne l'a pas mesurée. */
const part = (c: Compte, manque: number | undefined): string =>
  manque == null ? "-" : pct(c.annonces - manque, c.annonces);

function tableau(final: Record<string, Compte>): string {
  const lignes = [
    `| Source | Annonces | ${COLONNES.map(([n]) => n).join(" | ")} | Studios |`,
    `|---|---|${COLONNES.map(() => "---").join("|")}|---|`,
  ];
  for (const [s, c] of Object.entries(final).sort()) {
    lignes.push(
      `| ${s} | ${c.annonces} | ${COLONNES.map(([, f]) => part(c, f(c))).join(" | ")} | ${c.studios} |`,
    );
  }
  return lignes.join("\n");
}

/* ---------- Arguments ---------- */

const args = process.argv.slice(2);
const option = (nom: string): string | undefined => {
  const i = args.indexOf(`--${nom}`);
  return i >= 0 ? args[i + 1] : undefined;
};

if (args.includes("--comparer")) {
  const i = args.indexOf("--comparer");
  const [a, b] = [args[i + 1], args[i + 2]].map(
    (f) => JSON.parse(readFileSync(f, "utf8")) as Echantillon,
  );
  const lignes = [
    `Avant : ${a.etiquette} (${a.date}) ; après : ${b.etiquette} (${b.date})`,
    "",
    `| Source | Annonces | ${COLONNES.map(([n]) => n).join(" | ")} |`,
    `|---|---|${COLONNES.map(() => "---").join("|")}|`,
  ];
  for (const s of [...new Set([...Object.keys(a.final), ...Object.keys(b.final)])].sort()) {
    const x = a.final[s] ?? {
      ...vide(),
      sansDescription: undefined,
      sansEquipements: undefined,
      sansGps: undefined,
      sansPhoto: undefined,
      sansPrix: undefined,
    };
    const y = b.final[s] ?? vide();
    lignes.push(
      `| ${s} | ${x.annonces} → ${y.annonces} | ${COLONNES.map(([, f]) => `${part(x, f(x))} → ${part(y, f(y))}`).join(" | ")} |`,
    );
  }
  console.log(lignes.join("\n"));
  process.exit(0);
}

const etiquette = option("etiquette") ?? "echantillon";
const du = option("du") ?? "2027-02-06";
const au = option("au") ?? "2027-02-13";
const voyageurs = Number(option("voyageurs") ?? 4);
const parSource = Math.max(1, Math.min(3, Number(option("par-source") ?? 2)));
const filtre = option("sources")
  ?.split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const avecFiches = !args.includes("--sans-fiches");
/** Minutes laissées aux lectures de fond avant de compter ; 0 : relevé d'avant. */
const echelonnement = args.includes("--echelonnement")
  ? Math.max(1, Number(option("echelonnement")) || 20)
  : 0;
/** Fiches Airbnb lues au plus par station ; 0 : aucune. */
const fichesAirbnb = args.includes("--fiches-airbnb")
  ? Math.max(1, Number(option("fiches-airbnb")) || 60)
  : 0;

/* ---------- Les modules de l'application ---------- */

const { stationById, STATIONS } = await import("../../src/lib/stations.ts");
const { ficheCentrale } = await import("../../src/lib/scrape/centrales/registre.ts");
const { SOURCES_AGENCES, stationsDe } = await import("../../src/lib/scrape/agences/couverture.ts");
const { runLiveSearch } = await import("../../src/lib/scrape/run.server.ts");
const { airbnbIdOf, enrichirListing } = await import("../../src/lib/stay/enrichir.ts");
const { fillFiches, poserMemoire } = await import("../../src/lib/stay/completerFiche.server.ts");
const { manquesDe: manquesListing } = await import("../../src/lib/stay/manques.ts");
const { reposerGardees } = await import("../../src/lib/stay/contenuFiches.server.ts");
const { lireCacheAirbnb, lireCacheBooking } = await import("../../src/lib/scrape/run.server.ts");

/** Une tranche de fiches Airbnb : soixante au plus, à 5 ou 6 s l'une. */
const TRANCHE_AIRBNB_MS = 6 * 60_000;

/**
 * Les fiches Airbnb des annonces sans capacité ou sans chambres, lues comme la
 * complétion de l'écran Prix les lit (`lireFichesAirbnb`) : par tranches, au
 * limiteur partagé, avec la même pause entre deux fiches. Un refus, le
 * coupe-circuit ou une requête qu'Airbnb ne connaît plus arrêtent tout. Les
 * valeurs lues comblent les trous (`comblerDepuisMemoire`), puis l'annonce se
 * requalifie (`enrichirListing`). Le même code tourne sur l'ancien schéma.
 */
async function completerAirbnb(rows: Annonce[], max: number): Promise<void> {
  const { lireFichesAirbnb } = await import("../../src/lib/scrape/airbnb.server.ts");
  const { MAX_FICHES_TRANCHE } = await import("../../src/lib/scrape/airbnbFiches.ts");
  const { comblerDepuisMemoire } = await import("../../src/lib/stay/memoireFiches.server.ts");
  const parId = new Map<string, Annonce[]>();
  for (const row of rows) {
    if (row.source !== "Airbnb" || (row.bedrooms != null && capaciteDe(row) != null)) continue;
    const id = airbnbIdOf(row as never);
    if (id) parId.set(id, [...(parId.get(id) ?? []), row]);
  }
  const voulues = parId.size;
  let reste = [...parId.keys()].slice(0, max);
  let lues = 0;
  let comblees = 0;
  let vaines = 0;
  let arret: string | null = null;
  while (reste.length > 0) {
    const ids = reste.slice(0, MAX_FICHES_TRANCHE);
    const lu = await lireFichesAirbnb({
      ids,
      checkIn: du,
      checkOut: au,
      adults: voyageurs,
      echeance: Date.now() + TRANCHE_AIRBNB_MS,
    });
    lues += lu.lues;
    for (const [id, f] of Object.entries(lu.fiches)) {
      if ((f as { ecartee?: boolean }).ecartee) continue;
      for (const row of parId.get(id) ?? []) {
        if (comblerDepuisMemoire(row as never, f as never)) {
          Object.assign(row, enrichirListing(row as never));
          comblees += 1;
        }
      }
    }
    reste = [...lu.restants, ...reste.slice(ids.length)];
    if (lu.arret == null) continue;
    if (lu.arret === "echeance" || lu.arret === "rythme") {
      // Trois tranches de suite sans une fiche lue : on n'insiste pas.
      vaines = lu.lues > 0 ? 0 : vaines + 1;
      if (vaines >= 3) {
        arret = lu.raison ?? lu.arret;
        break;
      }
      if (lu.attenteMs)
        await new Promise((r) => setTimeout(r, Math.min(lu.attenteMs ?? 0, 120_000)));
      continue;
    }
    arret = lu.raison ?? lu.arret;
    break;
  }
  console.info(
    `[echantillon] fiches Airbnb : ${lues} lues pour ${Math.min(voulues, max)} demandées` +
      ` (${voulues} annonces incomplètes), ${comblees} annonce(s) complétée(s)` +
      `${arret ? `, arrêté : ${arret}` : ""}`,
  );
}

/** Les plateformes se relèvent sur trois stations fournies en annonces. */
const PLATEFORMES = ["les-2-alpes", "valloire", "avoriaz"];

const garde = (nom: string): boolean =>
  !filtre || filtre.some((f) => nom.toLowerCase().includes(f.toLowerCase()));

const cibles: Cible[] = [];
const ajouter = (c: Cible) => {
  if (!cibles.some((x) => x.stationId === c.stationId && x.part === c.part)) cibles.push(c);
};
for (const [part, nom] of [
  ["airbnb", "Airbnb"],
  ["gites", "Gîtes de France"],
  ["cozy", "CozyCozy Booking Abritel"],
  ["greengo", "GreenGo"],
] as const) {
  if (garde(nom))
    for (const id of PLATEFORMES.slice(0, parSource)) ajouter({ stationId: id, part });
}
for (const a of SOURCES_AGENCES) {
  if (garde(a))
    for (const id of stationsDe(a).slice(0, parSource)) ajouter({ stationId: id, part: "agences" });
}
const parMoteur = new Map<string, string[]>();
for (const s of STATIONS) {
  const m = ficheCentrale(s.id)?.moteur;
  if (m && m !== "aucun") parMoteur.set(m, [...(parMoteur.get(m) ?? []), s.id]);
}
for (const [m, ids] of parMoteur) {
  if (garde(m) || garde("Centrale"))
    for (const id of ids.slice(0, parSource)) ajouter({ stationId: id, part: "centrales" });
}

/* ---------- Le relevé ---------- */

const nomSource = (l: Annonce, stationId: string): string =>
  l.source === "Centrale" ? `Centrale ${ficheCentrale(stationId)?.moteur ?? "?"}` : l.source;

const echantillon: Echantillon = {
  etiquette,
  date: new Date().toISOString(),
  sejour: { du, au, voyageurs },
  cibles: [],
  releve: {},
  final: {},
  nuls: [],
};

console.log(
  `${cibles.length} relevés : ${cibles.map((c) => `${c.stationId}/${c.part}`).join(", ")}`,
);
/** Chaque relevé, gardé pour le compte final (après l'échelonnement s'il est demandé). */
const releves: Array<{
  stationId: string;
  part: Cible["part"];
  input: Record<string, unknown>;
  rows: Annonce[];
}> = [];
for (const c of cibles) {
  const st = stationById(c.stationId);
  if (!st) continue;
  const input = {
    stationId: st.id,
    stationName: st.name,
    lat: st.lat,
    lon: st.lon,
    checkIn: du,
    checkOut: au,
    guests: voyageurs,
    bedrooms: 0,
    // Comme l'écran Logements (`searchStay`) : le domaine, et les suites de
    // pages et de fiches qui en partent.
    ...(echelonnement > 0 ? { domaine: true } : {}),
  };
  console.log(`\n[echantillon] ${st.id} / ${c.part}`);
  let res: {
    listings: Annonce[];
    sources: Array<{ source: string; ok: boolean; count: number; error?: string }>;
  };
  try {
    res = (await runLiveSearch(input as never, c.part)) as never;
  } catch (err) {
    console.warn(`[echantillon] ${st.id} / ${c.part} : échec, ${(err as Error).message}`);
    echantillon.cibles.push({
      ...c,
      sources: [{ source: c.part, ok: false, count: 0, error: (err as Error).message }],
    });
    continue;
  }
  echantillon.cibles.push({
    ...c,
    sources: res.sources.map((s) => ({
      source: s.source,
      ok: s.ok,
      count: s.count,
      ...(s.error ? { error: s.error } : {}),
    })),
  });
  const rows = res.listings.map((l) => ({
    ...enrichirListing(l as never),
  })) as unknown as Annonce[];
  for (const l of rows) compter(echantillon.releve, nomSource(l, st.id), l);
  if (avecFiches && rows.length > 0) {
    try {
      await fillFiches(rows as never, 52_000);
    } catch (err) {
      console.warn(`[echantillon] seconde passe : ${(err as Error).message}`);
    }
  }
  if (fichesAirbnb > 0 && c.part === "airbnb" && rows.length > 0) {
    try {
      await completerAirbnb(rows, fichesAirbnb);
    } catch (err) {
      console.warn(`[echantillon] fiches Airbnb : ${(err as Error).message}`);
    }
  }
  releves.push({ stationId: st.id, part: c.part, input, rows });
}

if (echelonnement > 0) {
  console.log(
    `\n[echantillon] lectures de fond : ${echelonnement} min d'attente, sans requête de plus d'ici`,
  );
  await new Promise((r) => setTimeout(r, echelonnement * 60_000));
}

for (const { stationId, part, input, rows } of releves) {
  if (echelonnement > 0) {
    // Ce que les suites ont ajouté au cache de cette recherche, puis ce que
    // les mémoires ont gardé : sans réseau, comme la relecture de l'écran.
    const vus = new Set(rows.map((l) => l.id));
    const suite =
      part === "airbnb"
        ? lireCacheAirbnb(input as never)
        : part === "cozy"
          ? lireCacheBooking(input as never)
          : [];
    for (const l of suite as unknown as Annonce[]) {
      if (vus.has(l.id)) continue;
      vus.add(l.id);
      rows.push({ ...enrichirListing(l as never) } as unknown as Annonce);
    }
    reposerGardees(rows as never);
    poserMemoire(rows as never);
  }
  for (const l of rows) {
    const nom = nomSource(l, stationId);
    compter(echantillon.final, nom, l);
    const manque = manquesDe(l);
    if (manque.length > 0) {
      echantillon.nuls.push({
        source: nom,
        station: stationId,
        id: l.id,
        titre: l.title,
        url: l.url,
        chambres: l.bedrooms,
        capacite: capaciteDe(l),
        manque,
      });
    }
  }
}

const fichier = option("sortie") ?? `echantillon-logements-${etiquette}.json`;
writeFileSync(fichier, JSON.stringify(echantillon, null, 2));
const csv = [
  "source;station;id;titre;url;chambres;capacite;manque",
  ...echantillon.nuls.map((n) =>
    [
      n.source,
      n.station,
      n.id,
      // Un titre Airbnb peut tenir sur deux lignes : une annonce, une ligne.
      n.titre.replace(/;/g, ",").replace(/\s*[\r\n]+\s*/g, " "),
      n.url ?? "",
      n.chambres ?? "",
      n.capacite ?? "",
      (n.manque ?? []).join(","),
    ].join(";"),
  ),
].join("\n");
writeFileSync(fichier.replace(/\.json$/, "-nuls.csv"), csv);
console.log(`\n${tableau(echantillon.final)}\n`);
console.log(
  `${echantillon.nuls.length} annonces incomplètes (description, équipements, chambres, capacité, GPS, photo, prix ou lien) : ${fichier.replace(/\.json$/, "-nuls.csv")}`,
);
console.log(`Échantillon complet : ${fichier}`);
// Les collecteurs gardent des minuteries (cache, limiteurs) : on sort.
process.exit(0);
