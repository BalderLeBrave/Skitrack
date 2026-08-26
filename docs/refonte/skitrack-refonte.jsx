import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * SKITRACK — prototype de refonte (4 écrans)
 *
 * Reprend les jetons de `styles.css` (bleu unique #0B6FC2, Plus Jakarta Sans,
 * fond blanc, ombres en trois couches) et la refonte maquettée dans Figma :
 * navigation réduite, carte de domaine à trois niveaux, source et confiance du
 * prix au premier plan côté logements, pondération vivante côté décision.
 *
 * Les données sont un JEU DE DÉMONSTRATION. Aucune valeur n'est relevée.
 */

/* ------------------------------------------------------------------ données */

const DOMAINES = [
  {
    id: 'valtho', nom: 'Val Thorens', massif: 'Alpes du Nord', zone: 'domaine Les 3 Vallées',
    sub: 'Savoie · station la plus haute d’Europe · départ skis aux pieds',
    altVillage: 2300, altMax: 3230, km: 600, trajet: 7.2, forfait: 342,
    neigeBas: 65, neigeHaut: 205, teinte: [28, 71, 112], px: 0.34, py: 0.26,
  },
  {
    id: 'tignes', nom: 'Tignes', massif: 'Alpes du Nord', zone: 'domaine Tignes – Val d’Isère',
    sub: 'Savoie · glacier de la Grande Motte · ski d’été',
    altVillage: 1550, altMax: 3456, km: 300, trajet: 6.75, forfait: 328,
    neigeBas: 50, neigeHaut: 180, teinte: [36, 79, 102], px: 0.58, py: 0.18,
  },
  {
    id: 'serrche', nom: 'Serre Chevalier', massif: 'Alpes du Sud', zone: 'domaine Serre Che Vallée',
    sub: 'Hautes-Alpes · front de neige à Briançon · versant très ensoleillé',
    altVillage: 1200, altMax: 2800, km: 250, trajet: 8.1, forfait: 286,
    neigeBas: 25, neigeHaut: 110, teinte: [46, 84, 107], px: 0.18, py: 0.52,
  },
  {
    id: 'laplagne', nom: 'La Plagne', massif: 'Alpes du Nord', zone: 'domaine Paradiski',
    sub: 'Savoie · six villages d’altitude reliés · piste olympique de bobsleigh',
    altVillage: 1970, altMax: 3250, km: 425, trajet: 7.0, forfait: 311,
    neigeBas: 35, neigeHaut: 140, teinte: [30, 74, 104], px: 0.70, py: 0.44,
  },
  {
    id: 'peyragudes', nom: 'Peyragudes', massif: 'Pyrénées', zone: 'domaine Peyragudes',
    sub: 'Hautes-Pyrénées · deux versants · altiport en bout de piste',
    altVillage: 1600, altMax: 2400, km: 60, trajet: 8.4, forfait: 265,
    neigeBas: 30, neigeHaut: 95, teinte: [44, 78, 88], px: 0.44, py: 0.64,
  },
  {
    id: 'lesdeuxalpes', nom: 'Les 2 Alpes', massif: 'Alpes du Nord', zone: 'domaine Les 2 Alpes',
    sub: 'Isère · plus grand glacier skiable d’Europe · snowpark permanent',
    altVillage: 1650, altMax: 3600, km: 225, trajet: 6.9, forfait: 298,
    neigeBas: 40, neigeHaut: 160, teinte: [33, 68, 96], px: 0.76, py: 0.70,
  },
]

const LOGEMENTS = {
  valtho: [
    { id: 'l1', nom: 'Résidence Le Portillo', det: 'Studio cabine · 4 pers. · balcon sud', source: 'Centrale officielle · Val Thorens Réservation', type: 'centrale', dist: 0, total: 1240, confirme: true, px: 0.38, py: 0.36 },
    { id: 'l2', nom: 'Chalet des Balcons', det: 'Appartement 2 pièces · 4 pers. · sauna', source: 'Centrale officielle · Les Belleville', type: 'centrale', dist: 180, total: 1560, confirme: true, px: 0.58, py: 0.28 },
    { id: 'l3', nom: 'Studio Péclet vue vallée', det: 'Studio · 4 pers. · rénové en 2024', source: 'Airbnb · lien profond', type: 'airbnb', dist: 340, total: 1090, confirme: false, px: 0.26, py: 0.54 },
    { complet: true, id: 'l4', nom: 'Hôtel Le Val Chavière', det: 'Chambre familiale · 4 pers. · demi-pension', source: 'Booking.com', type: 'booking', dist: 90, total: 2310, confirme: true, px: 0.54, py: 0.62 },
  ],
  tignes: [
    { id: 'l5', nom: 'Résidence Les Almes', det: 'Appartement 2 pièces · 4 pers. · vue lac', source: 'Centrale officielle · Tignes Réservation', type: 'centrale', dist: 0, total: 1380, confirme: true, px: 0.40, py: 0.32 },
    { id: 'l6', nom: 'Le Rosset côté glacier', det: 'Studio · 4 pers. · casier à skis', source: 'Centrale officielle · Tignes Réservation', type: 'centrale', dist: 220, total: 1180, confirme: true, px: 0.60, py: 0.44 },
    { complet: true, id: 'l7', nom: 'Appartement Val Claret', det: 'Duplex · 4 pers. · cheminée', source: 'Airbnb · lien profond', type: 'airbnb', dist: 410, total: 1490, confirme: false, px: 0.28, py: 0.58 },
    { id: 'l8', nom: 'Hôtel Le Levanna', det: 'Chambre familiale · 4 pers.', source: 'Booking.com', type: 'booking', dist: 150, total: 1960, confirme: true, px: 0.66, py: 0.66 },
  ],
  serrche: [
    { id: 'l9', nom: 'Chalet du Bez', det: 'Appartement 3 pièces · 4 pers. · jardin', source: 'Centrale officielle · Serre Chevalier Résa', type: 'centrale', dist: 260, total: 980, confirme: true, px: 0.36, py: 0.38 },
    { id: 'l10', nom: 'Résidence Chantemerle', det: 'Studio · 4 pers. · pied des télécabines', source: 'Centrale officielle · Serre Chevalier Résa', type: 'centrale', dist: 0, total: 1120, confirme: true, px: 0.56, py: 0.30 },
    { id: 'l11', nom: 'Maison de village Villeneuve', det: 'Maison · 4 pers. · poêle à bois', source: 'CozyCozy', type: 'booking', dist: 620, total: 860, confirme: false, px: 0.24, py: 0.60 },
    { complet: true, id: 'l12', nom: 'Hôtel Le Christiania', det: 'Chambre familiale · 4 pers. · petit-déjeuner', source: 'Booking.com', type: 'booking', dist: 300, total: 1640, confirme: true, px: 0.64, py: 0.58 },
  ],
  laplagne: [
    { id: 'l13', nom: 'Résidence Aime 2000', det: 'Appartement 2 pièces · 4 pers.', source: 'Centrale officielle · La Plagne Résa', type: 'centrale', dist: 0, total: 1310, confirme: true, px: 0.42, py: 0.34 },
    { id: 'l14', nom: 'Chalet Belle Plagne', det: 'Duplex · 4 pers. · vue Mont-Blanc', source: 'Centrale officielle · La Plagne Résa', type: 'centrale', dist: 120, total: 1620, confirme: true, px: 0.60, py: 0.48 },
    { id: 'l15', nom: 'Studio Plagne Centre', det: 'Studio · 4 pers. · rénové', source: 'Airbnb · lien profond', type: 'airbnb', dist: 380, total: 1040, confirme: false, px: 0.30, py: 0.56 },
  ],
  peyragudes: [
    { id: 'l16', nom: 'Résidence Les Cimes', det: 'Appartement 2 pièces · 4 pers.', source: 'Centrale officielle · Peyragudes Résa', type: 'centrale', dist: 0, total: 890, confirme: true, px: 0.40, py: 0.36 },
    { id: 'l17', nom: 'Gîte de Loudenvielle', det: 'Maison · 4 pers. · accès thermes', source: 'CozyCozy', type: 'booking', dist: 5400, total: 720, confirme: false, px: 0.62, py: 0.60 },
    { id: 'l18', nom: 'Hôtel Le Mir', det: 'Chambre familiale · 4 pers.', source: 'Booking.com', type: 'booking', dist: 900, total: 1280, confirme: true, px: 0.30, py: 0.56 },
  ],
  lesdeuxalpes: [
    { id: 'l19', nom: 'Résidence Le Cortina', det: 'Studio · 4 pers. · balcon', source: 'Centrale officielle · Les 2 Alpes Résa', type: 'centrale', dist: 0, total: 1150, confirme: true, px: 0.44, py: 0.32 },
    { complet: true, id: 'l20', nom: 'Chalet Vénosc', det: 'Appartement 3 pièces · 4 pers.', source: 'Centrale officielle · Les 2 Alpes Résa', type: 'centrale', dist: 480, total: 1290, confirme: true, px: 0.58, py: 0.52 },
    { id: 'l21', nom: 'Studio Alpe Sud', det: 'Studio · 4 pers. · vue glacier', source: 'Airbnb · lien profond', type: 'airbnb', dist: 250, total: 1010, confirme: false, px: 0.28, py: 0.62 },
  ],
}

const MASSIFS = [
  { nom: 'Alpes du Nord', teinte: [26, 66, 104] },
  { nom: 'Alpes du Sud', teinte: [40, 84, 110] },
  { nom: 'Pyrénées', teinte: [50, 84, 92] },
]

const VOYAGEURS = 4
const NUITS = 6

/* --------------------------------------------------------------- utilitaires */

const eur = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
const num = (n) => new Intl.NumberFormat('fr-FR').format(n)
const heures = (h) => `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}`
const grad = ([r, g, b]) => `linear-gradient(160deg, rgb(${r + 46},${g + 42},${b + 34}), rgb(${r},${g},${b}))`

/** Score pondéré, recalculé à chaque déplacement d'un curseur. */
function useScores(weights) {
  return useMemo(() => {
    const bornes = (get) => {
      const vals = DOMAINES.map(get)
      return [Math.min(...vals), Math.max(...vals)]
    }
    const norm = (v, [lo, hi], inverse) => {
      if (hi === lo) return 0.5
      const t = (v - lo) / (hi - lo)
      return inverse ? 1 - t : t
    }
    const bAlt = bornes((d) => d.altVillage)
    const bPrix = bornes((d) => d.forfait)
    const bTraj = bornes((d) => d.trajet)
    const bKm = bornes((d) => d.km)
    const bNeige = bornes((d) => d.neigeHaut)
    const somme = Object.values(weights).reduce((a, b) => a + b, 0) || 1
    const out = {}
    for (const d of DOMAINES) {
      const s =
        weights.altitude * norm(d.altVillage, bAlt) +
        weights.prix * norm(d.forfait, bPrix, true) +
        weights.trajet * norm(d.trajet, bTraj, true) +
        weights.taille * norm(d.km, bKm) +
        weights.neige * norm(d.neigeHaut, bNeige)
      out[d.id] = Math.round((s / somme) * 100)
    }
    return out
  }, [weights])
}

/* --------------------------------------------------------------------- style */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

.sk, .sk * { box-sizing: border-box; }
.sk {
  --bg:#ffffff; --panel:#ffffff; --surface:#f7f9fb; --border:#e4e7eb; --border-soft:#eff2f5;
  --text:#222b33; --muted:#6b7680; --dim:#a9b3bf;
  --accent:#0b6fc2; --accent-soft:#eaf4fc; --on-accent:#ffffff;
  --brand:#0b6fc2; --brand-soft:#eaf4fc;
  --snow-light:#bfe0f7; --snow-ink:#133f63;
  --link:#0b6fc2; --ok:#0e8a5f; --ok-soft:#f0faf6; --warn:#b45309; --warn-soft:#fdf3e7;
  --map:#e7edf0; --relief:#dde5e8; --veil:rgba(0,0,0,.55);
  --shadow: rgba(0,0,0,.02) 0 0 0 1px, rgba(0,0,0,.05) 0 2px 6px, rgba(0,0,0,.09) 0 6px 18px;
  --shadow-hover: rgba(0,0,0,.03) 0 0 0 1px, rgba(0,0,0,.08) 0 8px 16px, rgba(0,0,0,.13) 0 14px 32px;
  font-family:'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif;
  background:var(--bg); color:var(--text);
  min-height:100%; font-size:14px; line-height:1.45;
}
.sk[data-theme='dark'] {
  --bg:#0f1519; --panel:#151c22; --surface:#1a222a; --border:#26313a; --border-soft:#1f2830;
  --text:#e8edf2; --muted:#8fa0ae; --dim:#5c6b78;
  --accent:#3d9be0; --accent-soft:#12283a; --brand:#3d9be0; --brand-soft:#12283a;
  --snow-light:#1e3e58; --snow-ink:#bfe0f7;
  --link:#7ec0f0; --ok:#4fc48d; --ok-soft:#1b3730; --warn:#ffca6b; --warn-soft:#3a3524;
  --map:#18222a; --relief:#1e2a33; --veil:rgba(0,0,0,.6);
  --shadow: rgba(0,0,0,.5) 0 0 0 1px, rgba(0,0,0,.45) 0 2px 6px, rgba(0,0,0,.5) 0 6px 18px;
  --shadow-hover: rgba(0,0,0,.55) 0 0 0 1px, rgba(0,0,0,.5) 0 8px 16px, rgba(0,0,0,.55) 0 14px 32px;
}
.sk button { font:inherit; color:inherit; cursor:pointer; border:0; background:none; }
.sk input { font:inherit; color:inherit; }
.sk :focus-visible { outline:2px solid var(--accent); outline-offset:2px; border-radius:6px; }
.sk h1,.sk h2,.sk h3,.sk p { margin:0; }
.sk-num { font-variant-numeric: tabular-nums; }

/* barre de navigation */
.sk-nav { display:flex; align-items:center; gap:20px; padding:12px 24px; background:var(--panel);
  border-bottom:1px solid var(--border-soft); position:sticky; top:0; z-index:20; flex-wrap:wrap; }
.sk-brand { display:flex; align-items:center; gap:10px; font-weight:800; letter-spacing:.09em; font-size:15px; }
.sk-mark { width:28px; height:28px; border-radius:9px; background:var(--accent); color:var(--on-accent);
  display:grid; place-items:center; font-size:15px; font-weight:800; letter-spacing:0; }
.sk-tabs { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.sk-tab { padding:9px 14px; border-radius:999px; font-weight:600; color:var(--muted); transition:background .15s,color .15s; }
.sk-tab:hover { background:var(--surface); color:var(--text); }
.sk-tab[aria-current='page'] { background:var(--accent-soft); color:var(--accent); }
.sk-seg { display:flex; gap:2px; padding:3px; border-radius:999px; background:var(--surface); }
.sk-seg button { padding:6px 12px; border-radius:999px; color:var(--muted); }
.sk-seg button[aria-current='page'] { background:var(--panel); color:var(--text); box-shadow:0 1px 3px rgba(0,0,0,.08); }
.sk-util { margin-left:auto; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.sk-ghost { padding:8px 12px; border-radius:999px; color:var(--muted); }
.sk-ghost:hover { background:var(--surface); }
.sk-people { padding:8px 14px; border-radius:999px; background:var(--accent); color:var(--on-accent); font-weight:600; }
.sk-switch { width:46px; height:26px; border-radius:999px; background:var(--surface); border:1px solid var(--border);
  position:relative; }
.sk-switch span { position:absolute; top:3px; left:3px; width:18px; height:18px; border-radius:50%;
  background:var(--accent); transition:transform .18s; }
.sk[data-theme='dark'] .sk-switch span { transform:translateX(20px); }

/* primitives */
.sk-chip { padding:9px 14px; border-radius:999px; border:1px solid var(--border); background:var(--panel);
  font-weight:500; transition:background .15s,border-color .15s; }
.sk-chip:hover { border-color:var(--accent); }
.sk-chip[aria-pressed='true'] { background:var(--accent-soft); border-color:var(--accent); color:var(--accent); font-weight:600; }
.sk-btn { padding:10px 18px; border-radius:999px; background:var(--accent); color:var(--on-accent); font-weight:600; }
.sk-btn:hover { filter:brightness(1.08); }
.sk-btn-quiet { padding:10px 16px; border-radius:999px; border:1px solid var(--border); background:var(--panel); font-weight:600; }
.sk-link { color:var(--link); font-weight:600; }
.sk-badge { display:inline-block; padding:4px 9px; border-radius:999px; font-size:11px; font-weight:600; letter-spacing:.05em; }
.sk-card { background:var(--panel); border:1px solid var(--border-soft); border-radius:16px; box-shadow:var(--shadow); }
.sk-eyebrow { font-size:11px; font-weight:600; letter-spacing:.06em; color:var(--muted); text-transform:uppercase; }
.sk-cap { font-size:12.5px; color:var(--muted); }

/* héro */
.sk-hero { position:relative; padding:92px 24px 0; min-height:430px;
  background:linear-gradient(180deg,#0f3d66,#22709e 55%,#4d99c9); color:#fff; overflow:hidden; }
.sk-hero::after { content:''; position:absolute; inset:0;
  background:linear-gradient(180deg,rgba(0,0,0,.30),rgba(0,0,0,.04)); pointer-events:none; }
.sk-hero > * { position:relative; z-index:1; }
.sk-hero h1 { font-size:46px; line-height:1.1; font-weight:800; letter-spacing:-1px; margin:12px 0; max-width:16ch; }
.sk-search { display:flex; align-items:center; gap:0; background:var(--panel); border-radius:999px; padding:10px;
  box-shadow:0 10px 30px rgba(0,0,0,.18); max-width:1080px; margin-top:38px; color:var(--text); flex-wrap:wrap; }
.sk-search-field { flex:1 1 200px; padding:8px 22px; display:flex; flex-direction:column; gap:2px; min-width:0; }
.sk-search-field input { border:0; background:none; outline:none; font-weight:600; width:100%; padding:0; }
.sk-search-field input::placeholder { color:var(--dim); font-weight:600; }
.sk-sep { width:1px; height:34px; background:var(--border); }

/* héros façon affiche */
.sk-hero2 { min-height: 620px; padding: 56px 48px 44px; display:flex; flex-direction:column; justify-content:flex-end;
  background:
    linear-gradient(180deg, rgba(9,44,70,.22) 0%, rgba(11,80,140,.10) 45%, rgba(7,25,42,.66) 100%),
    url('data:image/jpeg;base64,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') center 32% / cover no-repeat,
    linear-gradient(180deg,#0f3d66,#22709e 55%,#4d99c9); }
.sk-hero2::after { background:none; }
.sk-hero2-inner, .sk-hero2 .sk-search { position:relative; z-index:1; }
.sk-geant { position:absolute; top:-8px; left:50%; transform:translateX(-50%); z-index:0;
  font-weight:800; font-size:clamp(96px, 15vw, 218px); letter-spacing:-.045em; line-height:1;
  white-space:nowrap; pointer-events:none; user-select:none; color:transparent;
  background:linear-gradient(180deg, rgba(255,255,255,.85), rgba(255,255,255,.05) 92%);
  -webkit-background-clip:text; background-clip:text; }
.sk-hero2-inner { display:grid; grid-template-columns:minmax(0,1fr) 330px; gap:40px; align-items:end; padding-top:150px; }
.sk-cta { display:inline-flex; align-items:center; gap:14px; padding:7px 8px 7px 22px; border-radius:999px;
  background:#fff; color:#222b33; font-weight:600; transition:transform .15s; }
.sk-cta:hover { transform:translateY(-1px); }
.sk-cta i { width:38px; height:38px; border-radius:50%; background:var(--accent); color:#fff;
  display:grid; place-items:center; font-style:normal; font-size:16px; transition:transform .15s; }
.sk-cta:hover i { transform:translateX(2px); }
.sk-point { display:inline-flex; align-items:center; gap:8px; font-weight:600; }
.sk-point::before { content:''; width:7px; height:7px; border-radius:50%; background:var(--accent); }
.sk-flotte { background:var(--panel); color:var(--text); border-radius:18px; padding:18px 20px;
  box-shadow:0 14px 40px rgba(0,0,0,.22); display:flex; flex-direction:column; gap:14px; }

/* massifs façon sommaire défilant */
.sk-mass { display:grid; grid-template-columns:300px minmax(0,1fr) 210px; gap:48px;
  padding:72px 48px 24px; align-items:start; }
.sk-mass-titre { position:sticky; top:100px; }
.sk-mcard { border-radius:20px; overflow:hidden; background:var(--panel); border:1px solid var(--border-soft);
  box-shadow:var(--shadow); margin-bottom:28px; scroll-margin-top:110px; }
.sk-mcard-photo { height:290px; position:relative; }
.sk-mcard-pied { display:flex; align-items:center; gap:14px; padding:16px 18px; }
.sk-disc { width:44px; height:44px; border-radius:50%; background:var(--accent-soft); color:var(--accent);
  display:grid; place-items:center; font-size:17px; margin-left:auto; flex-shrink:0;
  transition:background .15s, color .15s, transform .15s; }
.sk-mcard:hover .sk-disc { background:var(--accent); color:var(--on-accent); transform:translateX(2px); }
.sk-index { position:sticky; top:120px; display:flex; flex-direction:column; }
.sk-index button { padding:13px 6px; border-bottom:1px solid var(--border-soft); color:var(--dim);
  text-align:center; transition:color .15s; }
.sk-index button[data-on='true'] { color:var(--text); font-weight:700; }
.sk-index .sk-index-num { display:block; font-size:11px; color:var(--accent); font-weight:700;
  letter-spacing:.08em; height:14px; opacity:0; transition:opacity .15s; }
.sk-index button[data-on='true'] .sk-index-num { opacity:1; }

/* bandeau neige */
.sk-snow { display:flex; gap:24px; flex-wrap:wrap; }
.sk-snow-item { flex:1 1 140px; display:flex; flex-direction:column; gap:8px; }
.sk-gauge { height:6px; border-radius:999px; background:var(--surface); overflow:hidden; }
.sk-gauge i { display:block; height:100%; border-radius:999px; background:var(--snow-light); }

/* tuiles massif */
.sk-tiles { display:grid; grid-template-columns:repeat(3,1fr); gap:24px; }
.sk-tile { position:relative; height:196px; border-radius:16px; overflow:hidden; color:#fff; text-align:left;
  display:block; width:100%; transition:transform .18s, box-shadow .18s; }
.sk-tile:hover { transform:translateY(-3px); box-shadow:var(--shadow-hover); }
.sk-tile::after { content:''; position:absolute; inset:0; background:linear-gradient(180deg,transparent 40%,rgba(0,0,0,.6)); }
.sk-tile-copy { position:absolute; left:20px; bottom:18px; z-index:1; }

/* écran scindé */
.sk-split { display:grid; grid-template-columns:minmax(0,58fr) minmax(0,42fr); min-height:640px; }
.sk-col { padding:20px 24px; display:flex; flex-direction:column; gap:16px; overflow:auto; max-height:calc(100vh - 60px); }

/* carte domaine */
.sk-dom { display:grid; grid-template-columns:228px minmax(0,1fr); border-radius:16px; overflow:hidden;
  background:var(--panel); border:1px solid var(--border-soft); box-shadow:var(--shadow);
  text-align:left; width:100%; transition:box-shadow .18s, border-color .18s; }
.sk-dom:hover { box-shadow:var(--shadow-hover); }
.sk-dom[data-on='true'] { border:2px solid var(--accent); }
.sk-dom-photo { position:relative; min-height:200px; }
.sk-dom-body { padding:16px 20px; display:flex; flex-direction:column; gap:9px; }
.sk-facts { display:flex; gap:28px; flex-wrap:wrap; }

/* carte logement */
.sk-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px; }
.sk-lodg { border-radius:16px; overflow:hidden; background:var(--panel); border:1px solid var(--border-soft);
  box-shadow:var(--shadow); display:flex; flex-direction:column; text-align:left; }
.sk-lodg[data-on='true'] { border:2px solid var(--accent); }
.sk-lodg-photo { height:168px; position:relative; }

/* carte géographique */
.sk-map { position:relative; background:var(--map); overflow:hidden; min-height:520px; }
.sk-relief { position:absolute; border-radius:50%; background:var(--relief); }
.sk-pin { position:absolute; transform:translate(-50%,-50%); padding:7px 12px; border-radius:999px;
  background:var(--panel); font-weight:600; font-size:13px; box-shadow:0 2px 6px rgba(0,0,0,.22);
  white-space:nowrap; transition:transform .15s; }
.sk-pin:hover { transform:translate(-50%,-50%) scale(1.06); }
.sk-pin[data-on='true'] { background:var(--accent); color:var(--on-accent); z-index:2; }
.sk-zone { position:absolute; border-radius:50%; border:1.5px dashed var(--accent); background:var(--accent);
  opacity:.12; }

/* comparatif */
.sk-row { display:grid; grid-template-columns:220px repeat(var(--cols),minmax(0,1fr)); align-items:center;
  padding:14px 20px; gap:12px; }
.sk-row:nth-child(odd) { background:var(--surface); }
.sk-slider { -webkit-appearance:none; appearance:none; width:100%; height:6px; border-radius:999px;
  background:var(--surface); outline:none; }
.sk-slider::-webkit-slider-thumb { -webkit-appearance:none; width:16px; height:16px; border-radius:50%;
  background:var(--panel); border:2px solid var(--accent); cursor:pointer; }
.sk-slider::-moz-range-thumb { width:16px; height:16px; border-radius:50%; background:var(--panel);
  border:2px solid var(--accent); cursor:pointer; }

.sk-empty { padding:64px 24px; text-align:center; color:var(--muted); }

/* sélection partagée */
.sk-sel-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:26px 20px; }
.sk-sel-card { display:flex; flex-direction:column; gap:5px; text-align:left; min-width:0; }
.sk-sel-photo { position:relative; aspect-ratio:20/19; border-radius:14px; overflow:hidden; }
.sk-dots { position:absolute; bottom:10px; left:50%; transform:translateX(-50%); display:flex; gap:5px; }
.sk-dots i { width:5px; height:5px; border-radius:50%; background:rgba(255,255,255,.5); }
.sk-dots i[data-on='true'] { background:#fff; }
.sk-heart { position:absolute; right:12px; top:12px; width:30px; height:30px; border-radius:50%;
  display:grid; place-items:center; background:rgba(0,0,0,.30); color:#fff; font-size:15px; line-height:1; }
.sk-heart[aria-pressed='true'] { background:var(--accent); }
.sk-tag { position:absolute; left:12px; top:12px; padding:5px 10px; border-radius:999px;
  background:rgba(255,255,255,.94); color:#222b33; font-size:11px; font-weight:700; letter-spacing:.04em; }
.sk-note { border:1px solid var(--border); border-radius:12px; padding:8px 12px; background:var(--panel);
  display:flex; flex-direction:column; gap:8px; margin-top:8px; }
.sk-note-head { display:flex; align-items:center; gap:6px; }
.sk-note-head > button:first-child { text-decoration:underline; font-weight:600; margin-right:auto; text-align:left; }
.sk-vote { padding:4px 8px; border-radius:9px; font-size:15px; line-height:1; display:flex; gap:5px; align-items:center; }
.sk-vote[aria-pressed='true'] { background:var(--warn-soft); box-shadow:inset 0 0 0 1px var(--warn); }
.sk-thread { border-top:1px solid var(--border-soft); padding-top:8px; display:flex; gap:8px; }
.sk-av { width:24px; height:24px; border-radius:50%; background:var(--accent-soft); color:var(--accent);
  display:grid; place-items:center; font-size:11px; font-weight:700; flex-shrink:0; }
.sk-avstack { display:flex; align-items:center; padding-left:8px; }
.sk-avstack .sk-av { margin-left:-8px; width:32px; height:32px; border:2px solid var(--panel); font-size:12px; }
.sk-demote .sk-sel-photo { filter:grayscale(.75); opacity:.65; }
.sk-ta { width:100%; border:1px solid var(--border); border-radius:10px; padding:8px 10px;
  background:var(--surface); resize:vertical; min-height:56px; font:inherit; color:inherit; outline:none; }
.sk-poi { position:absolute; width:236px; border-radius:14px; overflow:hidden; background:var(--panel);
  box-shadow:var(--shadow-hover); }

@media (max-width: 1400px) { .sk-sel-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media (max-width: 1100px) {
  .sk-split { grid-template-columns:1fr; }
  .sk-map { min-height:360px; order:-1; }
  .sk-col { max-height:none; }
  .sk-tiles { grid-template-columns:repeat(2,1fr); }
  .sk-dom { grid-template-columns:1fr; }
  .sk-dom-photo { min-height:150px; }
  .sk-grid { grid-template-columns:1fr; }
  .sk-sel-grid { grid-template-columns:1fr; }
  .sk-hero h1 { font-size:34px; }
  .sk-hero2-inner { grid-template-columns:1fr; padding-top:120px; }
  .sk-mass { grid-template-columns:1fr; gap:24px; }
  .sk-mass-titre, .sk-index { position:static; }
  .sk-index { display:none; }
  .sk-row { grid-template-columns:1fr; }
}
@media (prefers-reduced-motion: reduce) {
  .sk *, .sk *::after { transition:none !important; }
}
`

/* ------------------------------------------------------------- sous-éléments */

function Badge({ tone, children }) {
  const tones = {
    ok: { background: 'var(--ok-soft)', color: 'var(--ok)' },
    warn: { background: 'var(--warn-soft)', color: 'var(--warn)' },
    brand: { background: 'var(--brand-soft)', color: 'var(--brand)' },
  }
  return <span className="sk-badge" style={tones[tone] || tones.brand}>{children}</span>
}

function Fait({ label, valeur }) {
  return (
    <div>
      <div className="sk-eyebrow">{label}</div>
      <div className="sk-num" style={{ fontWeight: 700, fontSize: 15 }}>{valeur}</div>
    </div>
  )
}

function Carte({ pins, zone, legende, enfants }) {
  const reliefs = [
    { left: '-8%', top: '6%', width: '58%', height: '30%' },
    { left: '38%', top: '2%', width: '66%', height: '36%' },
    { left: '4%', top: '38%', width: '54%', height: '32%' },
    { left: '46%', top: '52%', width: '62%', height: '38%' },
    { left: '-12%', top: '72%', width: '52%', height: '30%' },
  ]
  return (
    <div className="sk-map">
      {reliefs.map((r, i) => <div key={i} className="sk-relief" style={r} />)}
      {zone && <div className="sk-zone" style={{ left: '16%', top: '20%', width: '68%', height: '54%' }} />}
      {pins}
      {enfants}
      <div style={{ position: 'absolute', left: 20, bottom: 56 }}>
        <div className="sk-card" style={{ padding: '9px 14px', borderRadius: 999, boxShadow: 'none' }}>
          <span className="sk-cap">{legende}</span>
        </div>
      </div>
      <div className="sk-eyebrow" style={{ position: 'absolute', left: 20, bottom: 20 }}>© OpenStreetMap · maquette</div>
    </div>
  )
}

/* ------------------------------------------------------------------- écrans */

/* Chute de neige — d'après « Snow Fall » (Originkit), adapté en JS pour le
   prototype : canvas plein cadre, réglages par défaut du composant, immobile
   si le système demande un mouvement réduit. */
function Flocons({
  count = 160, speedMin = 0.6, speedMax = 2.4, wind = 0, windVariation = 0.8,
  sizeMin = 1, sizeMax = 4, opacityMin = 30, opacityMax = 90, couleur = '#ffffff',
}) {
  const boite = useRef(null)
  const toile = useRef(null)

  useEffect(() => {
    const cont = boite.current
    const canvas = toile.current
    if (!cont || !canvas) return
    const g = canvas.getContext('2d')
    if (!g) return

    let raf = 0
    let W = 0
    let H = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let flocons = []
    const calme = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const alea = (a, b) => a + Math.random() * (b - a)

    const construire = (entree) => {
      const cr = entree && entree.contentRect
      W = Math.max(1, Math.floor((cr && cr.width) || cont.clientWidth || cont.getBoundingClientRect().width) || 1)
      H = Math.max(1, Math.floor((cr && cr.height) || cont.clientHeight || cont.getBoundingClientRect().height) || 1)
      canvas.width = Math.floor(W * dpr)
      canvas.height = Math.floor(H * dpr)
      canvas.style.width = W + 'px'
      canvas.style.height = H + 'px'
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      flocons = Array.from({ length: Math.max(0, Math.round(count)) }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        r: alea(sizeMin, sizeMax), vy: alea(speedMin, speedMax), vx: alea(-1, 1),
        phase: Math.random() * Math.PI * 2, houle: alea(0.2, 0.9),
        alpha: alea(opacityMin / 100, opacityMax / 100),
      }))
    }

    const dessiner = () => {
      g.clearRect(0, 0, W, H)
      g.fillStyle = couleur
      for (const f of flocons) {
        g.globalAlpha = f.alpha
        g.beginPath()
        g.arc(f.x, f.y, f.r, 0, Math.PI * 2)
        g.fill()
      }
      g.globalAlpha = 1
    }

    const boucle = (t) => {
      for (const f of flocons) {
        f.y += f.vy
        f.x += wind + f.vx * windVariation + Math.sin(t * 0.0012 + f.phase) * f.houle
        if (f.y - f.r > H) { f.y = -f.r; f.x = Math.random() * W }
        if (f.x < -f.r) f.x = W + f.r
        else if (f.x > W + f.r) f.x = -f.r
      }
      dessiner()
      raf = requestAnimationFrame(boucle)
    }

    construire()
    dessiner()
    if (!calme) raf = requestAnimationFrame(boucle)

    const ro = new ResizeObserver((es) => { construire(es[0]); dessiner() })
    ro.observe(cont)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [count, speedMin, speedMax, wind, windVariation, sizeMin, sizeMax, opacityMin, opacityMax, couleur])

  return (
    <div ref={boite} style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }} aria-hidden>
      <canvas ref={toile} style={{ position: 'absolute', inset: 0, display: 'block' }} />
    </div>
  )
}

function Accueil({ go, setQuery, query, scores }) {
  const enneiges = [...DOMAINES].sort((a, b) => b.neigeHaut - a.neigeHaut).slice(0, 3)
  const maxNeige = Math.max(...enneiges.map((d) => d.neigeHaut))
  const [actif, setActif] = useState(0)
  const cartes = useRef([])

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entrees) => entrees.forEach((e) => { if (e.isIntersecting) setActif(Number(e.target.dataset.i)) }),
      { rootMargin: '-35% 0px -55% 0px' }
    )
    cartes.current.forEach((el) => el && obs.observe(el))
    return () => obs.disconnect()
  }, [])

  return (
    <div>
      <section className="sk-hero sk-hero2">
        <span className="sk-geant" aria-hidden>SKITRACK</span>
        <Flocons />
        <div className="sk-hero2-inner">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'flex-start' }}>
            <span className="sk-eyebrow" style={{ color: 'rgba(255,255,255,.85)' }}>
              {DOMAINES.length} domaines · jeu de démonstration
            </span>
            <h1 style={{ fontSize: 34, lineHeight: 1.2, fontWeight: 700, letterSpacing: '-.5px', maxWidth: '20ch' }}>
              Des séjours choisis sur des chiffres relevés, pas sur des photos.
            </h1>
            <button className="sk-cta" onClick={() => go('recherche')}>
              Commencer la recherche <i aria-hidden>→</i>
            </button>
          </div>

          <aside className="sk-flotte">
            <span className="sk-point" style={{ fontSize: 13 }}>Neige relevée ce matin</span>
            {enneiges.map((d) => (
              <div key={d.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontWeight: 600 }}>{d.nom}</span>
                  <span className="sk-num" style={{ marginLeft: 'auto', color: 'var(--snow-ink)', fontWeight: 700, fontSize: 13 }}>
                    {d.neigeBas} / {d.neigeHaut} cm
                  </span>
                </div>
                <div className="sk-gauge"><i style={{ width: `${(d.neigeHaut / maxNeige) * 100}%` }} /></div>
              </div>
            ))}
            <span className="sk-cap" style={{ color: 'var(--dim)' }}>bas / haut du domaine · valeurs de démonstration</span>
          </aside>
        </div>

        <div className="sk-search" style={{ marginTop: 36 }}>
          <div className="sk-search-field">
            <span className="sk-eyebrow">Destination ou domaine</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Bourg-Saint-Maurice"
              aria-label="Destination ou domaine"
            />
          </div>
          <div className="sk-sep" />
          <div className="sk-search-field">
            <span className="sk-eyebrow">Dates du séjour</span>
            <span style={{ fontWeight: 600 }}>7 – 14 février</span>
          </div>
          <div className="sk-sep" />
          <div className="sk-search-field">
            <span className="sk-eyebrow">Voyageurs</span>
            <span style={{ fontWeight: 600 }}>2 adultes · 2 enfants</span>
          </div>
          <button className="sk-btn" style={{ padding: '18px 28px' }} onClick={() => go('recherche')}>
            Rechercher
          </button>
        </div>
      </section>

      <section className="sk-mass">
        <div className="sk-mass-titre">
          <h2 style={{ fontSize: 30, lineHeight: 1.15, fontWeight: 800, letterSpacing: '-.5px' }}>
            Explorer par massif.
          </h2>
          <p className="sk-cap" style={{ marginTop: 12, maxWidth: '30ch' }}>
            Chaque massif regroupe ses domaines avec altitudes, forfaits et enneigement comparables côte à côte.
          </p>
          <button className="sk-link" style={{ marginTop: 16 }} onClick={() => go('recherche')}>
            Voir les {DOMAINES.length} domaines
          </button>
        </div>

        <div>
          {MASSIFS.map((m, i) => {
            const liste = DOMAINES.filter((d) => d.massif === m.nom)
            const mini = Math.min(...liste.map((d) => d.forfait))
            return (
              <article
                key={m.nom}
                className="sk-mcard"
                data-i={i}
                ref={(el) => { cartes.current[i] = el }}
              >
                <div className="sk-mcard-photo" style={{ background: grad(m.teinte) }}>
                  <span className="sk-eyebrow" style={{ position: 'absolute', left: 18, bottom: 14, color: 'rgba(255,255,255,.8)' }}>
                    photo — massif-{m.nom.toLowerCase().replace(/[’' ]/g, '-')}.jpg
                  </span>
                </div>
                <div className="sk-mcard-pied">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{m.nom}</div>
                    <div className="sk-cap">
                      {liste.length} domaine{liste.length > 1 ? 's' : ''} · forfait 6 j dès {eur(mini)} · {liste.slice(0, 2).map((d) => d.nom).join(', ')}
                    </div>
                  </div>
                  <button className="sk-disc" aria-label={`Explorer ${m.nom}`} onClick={() => go('recherche', m.nom)}>→</button>
                </div>
              </article>
            )
          })}
        </div>

        <nav className="sk-index" aria-label="Sommaire des massifs">
          {MASSIFS.map((m, i) => (
            <button
              key={m.nom}
              data-on={actif === i}
              onClick={() => cartes.current[i] && cartes.current[i].scrollIntoView({ behavior: 'smooth', block: 'center' })}
            >
              <span className="sk-index-num sk-num">{String(i + 1).padStart(2, '0')}</span>
              {m.nom}
            </button>
          ))}
        </nav>
      </section>
    </div>
  )
}

function Recherche({ filtres, setFiltres, tri, setTri, query, setQuery, scores, retenus, toggleRetenu, ouvrirLogements, survol, setSurvol }) {
  const resultats = useMemo(() => {
    let out = DOMAINES.filter((d) => {
      if (filtres.altitude && d.altVillage < 1500) return false
      if (filtres.forfait && d.forfait > 300) return false
      if (filtres.trajet && d.trajet > 7) return false
      if (filtres.massif && d.massif !== filtres.massif) return false
      if (query.trim()) {
        const q = query.toLowerCase()
        if (!d.nom.toLowerCase().includes(q) && !d.massif.toLowerCase().includes(q) && !d.zone.toLowerCase().includes(q)) return false
      }
      return true
    })
    const tris = {
      pertinence: (a, b) => scores[b.id] - scores[a.id],
      prix: (a, b) => a.forfait - b.forfait,
      altitude: (a, b) => b.altVillage - a.altVillage,
      trajet: (a, b) => a.trajet - b.trajet,
      pistes: (a, b) => b.km - a.km,
    }
    return [...out].sort(tris[tri])
  }, [filtres, tri, query, scores])

  const bascule = (cle) => setFiltres((f) => ({ ...f, [cle]: !f[cle] }))

  return (
    <div>
      <div style={{ padding: '16px 24px 14px', background: 'var(--panel)', borderBottom: '1px solid var(--border-soft)', display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 60, zIndex: 10 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 260px', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderRadius: 999, background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <span aria-hidden style={{ width: 11, height: 11, borderRadius: '50%', border: '1.6px solid var(--muted)' }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrer par nom, massif ou domaine"
              aria-label="Filtrer les domaines"
              style={{ flex: 1, border: 0, background: 'none', outline: 'none', minWidth: 0 }}
            />
            <span className="sk-chip" style={{ padding: '7px 14px', fontSize: 13 }}>7 – 14 février</span>
            <span className="sk-chip" style={{ padding: '7px 14px', fontSize: 13 }}>{VOYAGEURS} voyageurs</span>
          </div>
          <button className="sk-chip" aria-pressed={filtres.altitude} onClick={() => bascule('altitude')}>Altitude village ≥ 1 500 m</button>
          <button className="sk-chip" aria-pressed={filtres.forfait} onClick={() => bascule('forfait')}>Forfait 6 j ≤ 300 €</button>
          <button className="sk-chip" aria-pressed={filtres.trajet} onClick={() => bascule('trajet')}>Trajet ≤ 7 h</button>
          {filtres.massif && (
            <button className="sk-chip" aria-pressed onClick={() => setFiltres((f) => ({ ...f, massif: null }))}>
              {filtres.massif} ✕
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>{resultats.length} domaine{resultats.length > 1 ? 's' : ''}</span>
          <span className="sk-cap">sur {DOMAINES.length} · {retenus.length} retenu{retenus.length > 1 ? 's' : ''} pour la comparaison</span>
          <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }} className="sk-chip">
            <span className="sk-cap">Trier&nbsp;:</span>
            <select value={tri} onChange={(e) => setTri(e.target.value)} style={{ border: 0, background: 'none', outline: 'none', fontWeight: 600 }}>
              <option value="pertinence">pertinence</option>
              <option value="prix">prix du forfait</option>
              <option value="altitude">altitude du village</option>
              <option value="trajet">temps de trajet</option>
              <option value="pistes">kilomètres de pistes</option>
            </select>
          </label>
        </div>
      </div>

      <div className="sk-split">
        <div className="sk-col">
          {resultats.length === 0 && (
            <div className="sk-empty">
              Aucun domaine ne passe ces filtres. Retirez-en un pour élargir la recherche.
            </div>
          )}
          {resultats.map((d) => {
            const retenu = retenus.includes(d.id)
            const logement = [...LOGEMENTS[d.id]].sort((a, b) => a.total - b.total)[0]
            return (
              <div
                key={d.id}
                className="sk-dom"
                data-on={survol === d.id}
                onMouseEnter={() => setSurvol(d.id)}
                onMouseLeave={() => setSurvol(null)}
              >
                <div className="sk-dom-photo" style={{ background: grad(d.teinte) }}>
                  <button
                    onClick={() => toggleRetenu(d.id)}
                    aria-pressed={retenu}
                    title={retenu ? 'Retirer de la comparaison' : 'Retenir pour la comparaison'}
                    style={{
                      position: 'absolute', right: 14, top: 14, width: 32, height: 32, borderRadius: '50%',
                      background: retenu ? 'var(--accent)' : 'rgba(255,255,255,.92)',
                      color: retenu ? '#fff' : '#222b33', fontWeight: 700, lineHeight: 1,
                    }}
                  >
                    {retenu ? '✓' : '+'}
                  </button>
                  <span className="sk-eyebrow" style={{ position: 'absolute', left: 16, bottom: 14, color: 'rgba(255,255,255,.8)' }}>
                    photo — {d.nom.toLowerCase().replace(/\s/g, '-')}.jpg
                  </span>
                </div>
                <div className="sk-dom-body">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Badge tone="brand">{d.massif.toUpperCase()}</Badge>
                    <span className="sk-cap">{d.zone}</span>
                    <span
                      className="sk-badge sk-num"
                      style={{ marginLeft: 'auto', background: scores[d.id] >= 70 ? 'var(--ok-soft)' : 'var(--surface)', color: scores[d.id] >= 70 ? 'var(--ok)' : 'var(--text)', fontSize: 13 }}
                      title="Score issu de votre pondération, écran Décision"
                    >
                      {scores[d.id]}<span style={{ fontSize: 11, opacity: .7 }}>/100</span>
                    </span>
                  </div>
                  <h3 style={{ fontSize: 20, fontWeight: 700 }}>{d.nom}</h3>
                  <p className="sk-cap">{d.sub}</p>
                  <div className="sk-facts">
                    <Fait label="Altitude" valeur={`${num(d.altVillage)} – ${num(d.altMax)} m`} />
                    <Fait label="Pistes" valeur={`${num(d.km)} km`} />
                    <Fait label="Trajet" valeur={heures(d.trajet)} />
                  </div>
                  <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', paddingTop: 6 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span className="sk-num" style={{ fontSize: 19, fontWeight: 800 }}>{eur(d.forfait)}</span>
                        <span className="sk-cap">forfait 6 j · adulte</span>
                      </div>
                      <div className="sk-cap">
                        séjour groupe dès {eur(d.forfait * VOYAGEURS + logement.total)} · {VOYAGEURS} pers.
                      </div>
                    </div>
                    <button className="sk-btn" style={{ marginLeft: 'auto' }} onClick={() => ouvrirLogements(d.id)}>
                      Voir les logements
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <Carte
          legende={`${resultats.length} domaines dans la zone · hors zone masqués`}
          pins={resultats.map((d) => (
            <button
              key={d.id}
              className="sk-pin sk-num"
              data-on={survol === d.id}
              style={{ left: `${d.px * 100}%`, top: `${d.py * 100}%` }}
              onMouseEnter={() => setSurvol(d.id)}
              onMouseLeave={() => setSurvol(null)}
              onClick={() => ouvrirLogements(d.id)}
            >
              {eur(d.forfait)}
            </button>
          ))}
          enfants={
            <button className="sk-btn-quiet" style={{ position: 'absolute', left: '50%', top: 20, transform: 'translateX(-50%)', boxShadow: 'var(--shadow)' }}>
              Rechercher dans cette zone
            </button>
          }
        />
      </div>
    </div>
  )
}

function Logements({ domaineId, retour, choisi, setChoisi, filtres, setFiltres, survol, setSurvol }) {
  const d = DOMAINES.find((x) => x.id === domaineId)
  const tous = LOGEMENTS[domaineId] || []
  const motif = (l) => (l.dist > 5000 ? 'HORS ZONE DU DOMAINE' : l.complet ? 'COMPLET 7 – 14 FÉVRIER' : null)
  const ecartes = tous.filter((l) => motif(l))
  const liste = tous.filter((l) => {
    if (motif(l)) return false
    if (filtres.skiAuxPieds && l.dist !== 0) return false
    if (filtres.proche && l.dist > 500) return false
    if (filtres.confirme && !l.confirme) return false
    return true
  })
  const retenu = tous.find((l) => l.id === choisi[domaineId]) || [...tous].sort((a, b) => a.total - b.total)[0]
  const bascule = (cle) => setFiltres((f) => ({ ...f, [cle]: !f[cle] }))

  return (
    <div>
      <div style={{ padding: '14px 24px', background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <button className="sk-btn-quiet" onClick={retour}>← Retour aux domaines</button>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Logements · {d.nom}</span>
          <span className="sk-cap">7 – 14 février · {VOYAGEURS} voyageurs · {NUITS} nuits</span>
        </div>
        <div className="sk-card" style={{ marginLeft: 'auto', padding: '8px 14px', borderRadius: 999, boxShadow: 'none', display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span className="sk-cap">Coût du séjour</span>
          <span className="sk-num" style={{ fontWeight: 700 }}>{eur(d.forfait * VOYAGEURS + retenu.total)}</span>
          <span className="sk-eyebrow">forfaits + logement</span>
        </div>
      </div>

      <div style={{ padding: '14px 24px', background: 'var(--panel)', borderBottom: '1px solid var(--border-soft)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="sk-chip" aria-pressed={filtres.skiAuxPieds} onClick={() => bascule('skiAuxPieds')}>Ski aux pieds</button>
        <button className="sk-chip" aria-pressed={filtres.proche} onClick={() => bascule('proche')}>≤ 500 m des pistes</button>
        <button className="sk-chip" aria-pressed={filtres.confirme} onClick={() => bascule('confirme')}>Prix confirmé seulement</button>
        <span style={{ marginLeft: 'auto', fontWeight: 700 }}>{liste.length} logement{liste.length > 1 ? 's' : ''}</span>
        {ecartes.length > 0 && <span className="sk-cap">· {ecartes.length} écarté{ecartes.length > 1 ? 's' : ''}, listé{ecartes.length > 1 ? 's' : ''} plus bas</span>}
      </div>

      <div className="sk-split">
        <div className="sk-col">
          {liste.length === 0 && (
            <div className="sk-empty">Aucun logement ne passe ces filtres. Retirez « prix confirmé » pour voir les offres à vérifier.</div>
          )}
          <div className="sk-grid">
            {liste.map((l) => (
              <div
                key={l.id}
                className="sk-lodg"
                data-on={choisi[domaineId] === l.id}
                onMouseEnter={() => setSurvol(l.id)}
                onMouseLeave={() => setSurvol(null)}
              >
                <div className="sk-lodg-photo" style={{ background: grad(d.teinte) }}>
                  <span className="sk-badge" style={{ position: 'absolute', left: 14, top: 14, background: 'rgba(255,255,255,.94)', color: '#222b33', fontWeight: 600 }}>
                    {l.source}
                  </span>
                  <span className="sk-badge" style={{ position: 'absolute', left: 14, bottom: 14, background: 'var(--veil)', color: '#fff' }}>
                    {l.dist === 0 ? 'SKI AUX PIEDS' : `${num(l.dist)} M DES PISTES`}
                  </span>
                </div>
                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                  <span style={{ fontWeight: 700, fontSize: 16 }}>{l.nom}</span>
                  <span className="sk-cap">{l.det}</span>
                  <div>
                    {l.confirme
                      ? <Badge tone="ok">PRIX CONFIRMÉ</Badge>
                      : <Badge tone="warn">À VÉRIFIER · AUTRES DATES</Badge>}
                  </div>
                  <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div>
                      <div className="sk-num" style={{ fontSize: 19, fontWeight: 800 }}>
                        {l.confirme ? eur(l.total) : `dès ${eur(l.total)}`}
                      </div>
                      <div className="sk-cap sk-num">total {NUITS} nuits · {eur(Math.round(l.total / VOYAGEURS))} / pers.</div>
                    </div>
                    <button
                      className={choisi[domaineId] === l.id ? 'sk-btn-quiet' : 'sk-btn'}
                      style={{ marginLeft: 'auto' }}
                      onClick={() => setChoisi((c) => ({ ...c, [domaineId]: l.id }))}
                    >
                      {choisi[domaineId] === l.id ? 'Retenu' : 'Retenir'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {ecartes.length > 0 && (
            <section style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700 }}>Ces logements sont écartés</h3>
                <p className="sk-cap">
                  Ils restent visibles avec leur motif : élargissez la zone ou changez de dates pour les récupérer.
                </p>
              </div>
              <div className="sk-sel-grid">
                {ecartes.map((l) => (
                  <div className="sk-sel-card sk-demote" key={l.id}>
                    <div className="sk-sel-photo" style={{ background: grad(d.teinte) }}>
                      <span className="sk-tag">{motif(l)}</span>
                    </div>
                    <span style={{ fontWeight: 700 }}>{l.nom}</span>
                    <span className="sk-cap">{l.det}</span>
                    <span className="sk-cap">
                      {l.dist > 5000 ? `${num(l.dist)} m des pistes — au-delà des 12 km du domaine` : 'Aucune disponibilité sur ces dates'}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <Carte
          zone
          legende="Zone du domaine · 12 km — au-delà, le logement est rejeté"
          pins={liste.map((l) => (
            <button
              key={l.id}
              className="sk-pin sk-num"
              data-on={survol === l.id || choisi[domaineId] === l.id}
              style={{ left: `${l.px * 100}%`, top: `${l.py * 100}%` }}
              onMouseEnter={() => setSurvol(l.id)}
              onMouseLeave={() => setSurvol(null)}
              onClick={() => setChoisi((c) => ({ ...c, [domaineId]: l.id }))}
            >
              {eur(Math.round(l.total / VOYAGEURS))}
            </button>
          ))}
        />
      </div>
    </div>
  )
}

function Decision({ retenus, weights, setWeights, scores, choisi, go, toggleRetenu }) {
  const doms = DOMAINES.filter((d) => retenus.includes(d.id))
  const curseurs = [
    ['altitude', 'Altitude garantie'],
    ['prix', 'Prix du séjour'],
    ['trajet', 'Temps de trajet'],
    ['taille', 'Taille du domaine'],
    ['neige', 'Enneigement relevé'],
  ]
  const intensite = (v) => (v >= 70 ? 'fort' : v >= 40 ? 'moyen' : 'faible')

  const logementDe = (d) => {
    const tous = LOGEMENTS[d.id]
    return tous.find((l) => l.id === choisi[d.id]) || [...tous].sort((a, b) => a.total - b.total)[0]
  }
  const total = (d) => d.forfait * VOYAGEURS + logementDe(d).total

  const lignes = doms.length ? [
    { label: 'Score pondéré', vals: doms.map((d) => `${scores[d.id]}/100`), best: doms.reduce((bi, d, i, arr) => (scores[d.id] > scores[arr[bi].id] ? i : bi), 0) },
    { label: 'Altitude du village', vals: doms.map((d) => `${num(d.altVillage)} m`), best: doms.reduce((bi, d, i, arr) => (d.altVillage > arr[bi].altVillage ? i : bi), 0) },
    { label: 'Sommet du domaine', vals: doms.map((d) => `${num(d.altMax)} m`), best: doms.reduce((bi, d, i, arr) => (d.altMax > arr[bi].altMax ? i : bi), 0) },
    { label: 'Pistes', vals: doms.map((d) => `${num(d.km)} km`), best: doms.reduce((bi, d, i, arr) => (d.km > arr[bi].km ? i : bi), 0) },
    { label: 'Trajet depuis Paris', vals: doms.map((d) => heures(d.trajet)), best: doms.reduce((bi, d, i, arr) => (d.trajet < arr[bi].trajet ? i : bi), 0) },
    { label: `Forfaits 6 j · ${VOYAGEURS} pers.`, vals: doms.map((d) => eur(d.forfait * VOYAGEURS)), best: doms.reduce((bi, d, i, arr) => (d.forfait < arr[bi].forfait ? i : bi), 0) },
    { label: 'Logement retenu', vals: doms.map((d) => `${eur(logementDe(d).total)} · ${logementDe(d).nom}`), best: doms.reduce((bi, d, i, arr) => (logementDe(d).total < logementDe(arr[bi]).total ? i : bi), 0) },
    { label: 'Coût total du séjour', vals: doms.map((d) => eur(total(d))), best: doms.reduce((bi, d, i, arr) => (total(d) < total(arr[bi]) ? i : bi), 0) },
    { label: 'Neige au sol (bas / haut)', vals: doms.map((d) => `${d.neigeBas} / ${d.neigeHaut} cm`), best: doms.reduce((bi, d, i, arr) => (d.neigeHaut > arr[bi].neigeHaut ? i : bi), 0) },
  ] : []

  const gagnant = doms.length ? [...doms].sort((a, b) => scores[b.id] - scores[a.id])[0] : null
  const moinsCher = doms.length ? [...doms].sort((a, b) => total(a) - total(b))[0] : null

  return (
    <div style={{ padding: 24, display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap', background: 'var(--surface)', minHeight: '80vh' }}>
      <aside className="sk-card" style={{ padding: 20, width: 300, flex: '0 1 300px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>Ce qui compte pour vous</h2>
        <p className="sk-cap">Les scores se recalculent à chaque déplacement, ici comme dans la liste des résultats.</p>
        {curseurs.map(([cle, label]) => (
          <div key={cle} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label htmlFor={`w-${cle}`}>{label}</label>
              <span className="sk-eyebrow">{intensite(weights[cle])}</span>
            </div>
            <input
              id={`w-${cle}`} className="sk-slider" type="range" min="0" max="100"
              value={weights[cle]}
              onChange={(e) => setWeights((w) => ({ ...w, [cle]: Number(e.target.value) }))}
              style={{ background: `linear-gradient(90deg, var(--accent) ${weights[cle]}%, var(--surface) ${weights[cle]}%)` }}
            />
          </div>
        ))}
      </aside>

      <section className="sk-card" style={{ flex: '1 1 620px', overflow: 'hidden', padding: 0 }}>
        {doms.length < 2 ? (
          <div className="sk-empty">
            <p style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Retenez au moins deux domaines pour les comparer.</p>
            <p style={{ marginBottom: 20 }}>Le bouton + sur chaque photo, dans les résultats de recherche, les ajoute ici.</p>
            <button className="sk-btn" onClick={() => go('recherche')}>Aller aux résultats</button>
          </div>
        ) : (
          <>
            <div className="sk-row" style={{ '--cols': doms.length, padding: '18px 20px' }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700 }}>Comparer</h2>
                <p className="sk-cap">{doms.length} domaines retenus · {VOYAGEURS} voyageurs</p>
              </div>
              {doms.map((d) => (
                <div key={d.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ width: 44, height: 44, borderRadius: 10, background: grad(d.teinte), flexShrink: 0 }} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 700 }}>{d.nom}</span>
                    <span className="sk-eyebrow" style={{ textTransform: 'none' }}>{d.zone}</span>
                  </span>
                  <button className="sk-ghost" title="Retirer de la comparaison" onClick={() => toggleRetenu(d.id)} style={{ marginLeft: 'auto', padding: 6 }}>✕</button>
                </div>
              ))}
            </div>
            {lignes.map((l) => (
              <div className="sk-row" key={l.label} style={{ '--cols': doms.length }}>
                <span className="sk-cap">{l.label}</span>
                {l.vals.map((v, i) => (
                  <span key={i}>
                    {i === l.best
                      ? <span className="sk-badge sk-num" style={{ background: 'var(--ok-soft)', color: 'var(--ok)', fontSize: 13 }}>{v}</span>
                      : <span className="sk-num" style={{ fontWeight: 600 }}>{v}</span>}
                  </span>
                ))}
              </div>
            ))}
            <div style={{ padding: '18px 20px', background: 'var(--accent-soft)', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <p style={{ fontWeight: 700, fontSize: 16 }}>Avec votre pondération, {gagnant.nom} sort en tête</p>
                <p className="sk-cap">
                  {moinsCher.id === gagnant.id
                    ? `C’est aussi le séjour le moins cher, à ${eur(total(gagnant))}.`
                    : `${moinsCher.nom} coûte ${eur(total(gagnant) - total(moinsCher))} de moins mais perd ${num(gagnant.altVillage - moinsCher.altVillage)} m d’altitude au village.`}
                </p>
              </div>
              <button className="sk-btn" style={{ marginLeft: 'auto' }}>Retenir {gagnant.nom}</button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

/* --------------------------------------------------- sélection partagée */

const COLLAB = [
  { id: 'moi', initiales: 'AR', nom: 'Vous' },
  { id: 'c2', initiales: 'CL', nom: 'Claire' },
  { id: 'c3', initiales: 'TH', nom: 'Thomas' },
  { id: 'c4', initiales: 'LN', nom: 'Léna' },
]

function Points({ n = 5 }) {
  return <span className="sk-dots">{Array.from({ length: n }, (_, i) => <i key={i} data-on={i === 0} />)}</span>
}

function BarreNote({ id, notes, setNotes, votes, setVotes }) {
  const [ouvert, setOuvert] = useState(false)
  const [texte, setTexte] = useState('')
  const fil = notes[id] || []
  const v = votes[id] || { up: 0, down: 0, mien: null }

  const voter = (sens) => setVotes((tous) => {
    const cur = tous[id] || { up: 0, down: 0, mien: null }
    const suiv = { ...cur }
    if (cur.mien === sens) { suiv[sens] -= 1; suiv.mien = null }
    else {
      if (cur.mien) suiv[cur.mien] -= 1
      suiv[sens] += 1; suiv.mien = sens
    }
    return { ...tous, [id]: suiv }
  })

  const ajouter = () => {
    if (!texte.trim()) return
    setNotes((tous) => ({ ...tous, [id]: [...(tous[id] || []), { qui: 'Vous', quand: 'à l’instant', texte: texte.trim() }] }))
    setTexte(''); setOuvert(false)
  }

  return (
    <div className="sk-note">
      <div className="sk-note-head">
        <button onClick={() => setOuvert((o) => !o)}>
          {fil.length ? `${fil.length} note${fil.length > 1 ? 's' : ''}` : 'Ajouter une note'}
        </button>
        <button className="sk-vote" aria-pressed={v.mien === 'up'} onClick={() => voter('up')} aria-label="Pour">
          👍{v.up > 0 && <span style={{ fontSize: 12, fontWeight: 700 }}>{v.up}</span>}
        </button>
        <button className="sk-vote" aria-pressed={v.mien === 'down'} onClick={() => voter('down')} aria-label="Contre">
          👎{v.down > 0 && <span style={{ fontSize: 12, fontWeight: 700 }}>{v.down}</span>}
        </button>
      </div>

      {fil.map((n, i) => (
        <div className="sk-thread" key={i}>
          <span className="sk-av">{n.qui === 'Vous' ? 'AR' : n.qui.slice(0, 2).toUpperCase()}</span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block' }}>
              <b>{n.qui}</b> <span className="sk-cap">· {n.quand}</span>
            </span>
            <span className="sk-cap" style={{ color: 'var(--text)' }}>{n.texte}</span>
          </span>
        </div>
      ))}

      {ouvert && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea
            className="sk-ta"
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            placeholder="Ce que le groupe doit savoir avant de trancher"
            aria-label="Nouvelle note"
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="sk-btn" style={{ padding: '8px 16px' }} onClick={ajouter}>Publier la note</button>
            <button className="sk-btn-quiet" style={{ padding: '8px 16px' }} onClick={() => { setOuvert(false); setTexte('') }}>Annuler</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Selection({ retenus, toggleRetenu, choisi, setChoisi, scores, notes, setNotes, votes, setVotes, go, survol, setSurvol }) {
  const [poi, setPoi] = useState(false)
  const doms = DOMAINES.filter((d) => retenus.includes(d.id))
  const logs = Object.entries(choisi)
    .map(([domId, logId]) => {
      const d = DOMAINES.find((x) => x.id === domId)
      const l = (LOGEMENTS[domId] || []).find((x) => x.id === logId)
      return d && l ? { d, l } : null
    })
    .filter(Boolean)
  const perdus = doms.flatMap((d) => (LOGEMENTS[d.id] || []).filter((l) => l.complet).map((l) => ({ d, l })))

  return (
    <div className="sk-split">
      <div className="sk-col" style={{ gap: 28 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.6px' }}>Février en famille</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button className="sk-chip">7 – 14 février</button>
            <button className="sk-chip">{VOYAGEURS} voyageurs</button>
            <span className="sk-avstack">
              {COLLAB.map((c) => <span className="sk-av" key={c.id} title={c.nom}>{c.initiales}</span>)}
              <button className="sk-av" style={{ marginLeft: -8, width: 32, height: 32, border: '2px solid var(--panel)', background: 'var(--surface)', color: 'var(--text)' }} title="Inviter quelqu’un">+</button>
            </span>
          </div>
        </div>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>Domaines · {doms.length}</h2>
          {doms.length === 0 && <p className="sk-cap">Rien de retenu. Le bouton + sur les résultats de recherche ajoute un domaine ici.</p>}
          <div className="sk-sel-grid">
            {doms.map((d) => {
              const moinsCher = [...LOGEMENTS[d.id]].filter((l) => !l.complet).sort((a, b) => a.total - b.total)[0]
              return (
                <div className="sk-sel-card" key={d.id} onMouseEnter={() => setSurvol(d.id)} onMouseLeave={() => setSurvol(null)}>
                  <div className="sk-sel-photo" style={{ background: grad(d.teinte) }}>
                    <span className="sk-tag">{d.massif.toUpperCase()}</span>
                    <button className="sk-heart" aria-pressed onClick={() => toggleRetenu(d.id)} title="Retirer de la sélection">♥</button>
                    <Points />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontWeight: 700, minWidth: 0 }}>{d.nom}</span>
                    <span className="sk-num" style={{ marginLeft: 'auto', fontWeight: 700 }}>{scores[d.id]}<span className="sk-cap">/100</span></span>
                  </div>
                  <span className="sk-cap">{d.zone}</span>
                  <span className="sk-cap">{num(d.altVillage)} m au village · {num(d.km)} km de pistes</span>
                  <span className="sk-num" style={{ textDecoration: 'underline' }}>
                    {eur(d.forfait * VOYAGEURS + moinsCher.total)} <span style={{ textDecoration: 'none' }}>pour {NUITS} nuits</span>
                  </span>
                  <BarreNote id={d.id} notes={notes} setNotes={setNotes} votes={votes} setVotes={setVotes} />
                </div>
              )
            })}
          </div>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>Logements retenus · {logs.length}</h2>
          {logs.length === 0 && <p className="sk-cap">Aucun logement retenu. Ouvrez un domaine et appuyez sur « Retenir ».</p>}
          <div className="sk-sel-grid">
            {logs.map(({ d, l }) => (
              <div className="sk-sel-card" key={l.id} onMouseEnter={() => setSurvol(l.id)} onMouseLeave={() => setSurvol(null)}>
                <div className="sk-sel-photo" style={{ background: grad(d.teinte) }}>
                  <span className="sk-tag">{l.type === 'centrale' ? 'CENTRALE OFFICIELLE' : l.source.toUpperCase()}</span>
                  <button className="sk-heart" aria-pressed onClick={() => setChoisi((c) => { const n = { ...c }; delete n[d.id]; return n })} title="Retirer de la sélection">♥</button>
                  <Points n={4} />
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontWeight: 700, minWidth: 0 }}>{l.nom}</span>
                  <span className="sk-cap" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                    {l.dist === 0 ? 'ski aux pieds' : `${num(l.dist)} m`}
                  </span>
                </div>
                <span className="sk-cap">{d.nom} · {l.det}</span>
                <span>{l.confirme ? <Badge tone="ok">PRIX CONFIRMÉ</Badge> : <Badge tone="warn">À VÉRIFIER</Badge>}</span>
                <span className="sk-num" style={{ textDecoration: 'underline' }}>
                  {eur(l.total)} <span style={{ textDecoration: 'none' }}>pour {NUITS} nuits · {VOYAGEURS} pers.</span>
                </span>
                <BarreNote id={l.id} notes={notes} setNotes={setNotes} votes={votes} setVotes={setVotes} />
              </div>
            ))}
          </div>
        </section>

        {perdus.length > 0 && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>Ces logements ne sont plus disponibles</h2>
              <p className="sk-cap">Changez de dates ou ajoutez d’autres logements à la sélection.</p>
            </div>
            <div className="sk-sel-grid">
              {perdus.map(({ d, l }) => (
                <div className="sk-sel-card sk-demote" key={l.id}>
                  <div className="sk-sel-photo" style={{ background: grad(d.teinte) }}>
                    <span className="sk-tag">COMPLET 7 – 14 FÉVRIER</span>
                  </div>
                  <span style={{ fontWeight: 700 }}>{l.nom}</span>
                  <span className="sk-cap">{d.nom} · {l.det}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', paddingBottom: 12 }}>
          <button className="sk-btn" onClick={() => go('decision')}>Comparer les {doms.length} domaines</button>
          <button className="sk-btn-quiet" onClick={() => go('recherche')}>Ajouter un domaine</button>
        </div>
      </div>

      <Carte
        legende={`${doms.length} domaines · ${logs.length} logements dans la sélection`}
        pins={[
          ...doms.map((d) => (
            <button
              key={d.id} className="sk-pin sk-num" data-on={survol === d.id}
              style={{ left: `${d.px * 100}%`, top: `${d.py * 100}%` }}
              onMouseEnter={() => setSurvol(d.id)} onMouseLeave={() => setSurvol(null)}
            >
              {eur(d.forfait)} ♥
            </button>
          )),
          ...logs.map(({ d, l }) => (
            <button
              key={l.id} className="sk-pin sk-num" data-on={survol === l.id}
              style={{ left: `${(d.px * 0.5 + l.px * 0.5) * 100}%`, top: `${(d.py * 0.5 + l.py * 0.5) * 100}%` }}
              onMouseEnter={() => setSurvol(l.id)} onMouseLeave={() => setSurvol(null)}
            >
              {eur(Math.round(l.total / VOYAGEURS))} ♥
            </button>
          )),
        ]}
        enfants={
          <>
            <button
              onClick={() => setPoi((p) => !p)}
              title="Télécabine de Péclet"
              style={{ position: 'absolute', left: '62%', top: '46%', transform: 'translate(-50%,-50%)', width: 34, height: 34, borderRadius: '50%', background: 'var(--text)', color: 'var(--bg)', boxShadow: '0 2px 6px rgba(0,0,0,.3)' }}
            >
              ▲
            </button>
            {poi && (
              <div className="sk-poi" style={{ left: '66%', top: '10%' }}>
                <div style={{ height: 110, background: grad([30, 74, 104]), position: 'relative' }}>
                  <button onClick={() => setPoi(false)} aria-label="Fermer" style={{ position: 'absolute', right: 8, top: 8, width: 24, height: 24, borderRadius: '50%', background: 'var(--panel)', lineHeight: 1 }}>✕</button>
                  <Points n={4} />
                </div>
                <div style={{ padding: 12 }}>
                  <div style={{ fontWeight: 700 }}>Télécabine de Péclet</div>
                  <div className="sk-cap">Remontée · front de neige</div>
                  <div className="sk-cap">90 m du Portillo · ouverture 8 h 45</div>
                </div>
              </div>
            )}
          </>
        }
      />
    </div>
  )
}

/* ------------------------------------------------------------------ racine */

export default function SkitrackRefonte() {
  const [theme, setTheme] = useState('light')
  const [tab, setTab] = useState('accueil')
  const [query, setQuery] = useState('')
  const [tri, setTri] = useState('pertinence')
  const [filtres, setFiltres] = useState({ altitude: false, forfait: false, trajet: false, massif: null })
  const [filtresLog, setFiltresLog] = useState({ skiAuxPieds: false, proche: false, confirme: false })
  const [domaineOuvert, setDomaineOuvert] = useState(null)
  const [choisi, setChoisi] = useState({})
  const [retenus, setRetenus] = useState(['valtho', 'serrche'])
  const [survol, setSurvol] = useState(null)
  const [weights, setWeights] = useState({ altitude: 80, prix: 75, trajet: 50, taille: 25, neige: 55 })
  const [notes, setNotes] = useState({
    valtho: [{ qui: 'Claire', quand: 'il y a 2 h', texte: 'Le plus haut, donc le plus sûr côté neige — mais c’est aussi le plus cher des trois.' }],
    serrche: [{ qui: 'Thomas', quand: 'hier', texte: '442 € d’écart sur le séjour, ça paie les cours de ski des petits.' }],
  })
  const [votes, setVotes] = useState({
    valtho: { up: 2, down: 0, mien: null },
    serrche: { up: 1, down: 1, mien: null },
  })

  const scores = useScores(weights)

  const go = (cible, massif) => {
    if (massif) setFiltres((f) => ({ ...f, massif }))
    setTab(cible)
  }
  const ouvrirLogements = (id) => { setDomaineOuvert(id); setTab('logements') }
  const toggleRetenu = (id) =>
    setRetenus((r) => (r.includes(id) ? r.filter((x) => x !== id) : r.length >= 3 ? [...r.slice(1), id] : [...r, id]))

  const principaux = [['accueil', 'Accueil'], ['recherche', 'Rechercher'], ['logements', 'Logements'], ['selection', 'Ma sélection']]
  const segments = [['offres', 'Offres'], ['combinaisons', 'Combinaisons'], ['decision', 'Décision']]

  return (
    <div className="sk" data-theme={theme}>
      <style>{CSS}</style>

      <nav className="sk-nav">
        <span className="sk-brand"><span className="sk-mark">S</span>SKITRACK</span>
        <div className="sk-tabs">
          {principaux.map(([id, label]) => (
            <button
              key={id}
              className="sk-tab"
              aria-current={tab === id ? 'page' : undefined}
              onClick={() => (id === 'logements' && !domaineOuvert ? go('recherche') : setTab(id))}
              title={id === 'logements' && !domaineOuvert ? 'Ouvrez d’abord un domaine' : undefined}
            >
              {label}
            </button>
          ))}
          <div className="sk-seg">
            {segments.map(([id, label]) => (
              <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="sk-util">
          <button className="sk-ghost" onClick={() => setTab('selection')}>Favoris · {retenus.length}</button>
          <button className="sk-ghost">Suivi · 5</button>
          <button className="sk-ghost">FR</button>
          <button className="sk-people">Voyageurs · {VOYAGEURS}</button>
          <button
            className="sk-switch"
            role="switch"
            aria-checked={theme === 'dark'}
            aria-label="Thème sombre"
            onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
          >
            <span />
          </button>
        </div>
      </nav>

      {tab === 'accueil' && <Accueil go={go} query={query} setQuery={setQuery} scores={scores} />}

      {tab === 'recherche' && (
        <Recherche
          filtres={filtres} setFiltres={setFiltres} tri={tri} setTri={setTri}
          query={query} setQuery={setQuery} scores={scores}
          retenus={retenus} toggleRetenu={toggleRetenu}
          ouvrirLogements={ouvrirLogements} survol={survol} setSurvol={setSurvol}
        />
      )}

      {tab === 'logements' && domaineOuvert && (
        <Logements
          domaineId={domaineOuvert}
          retour={() => setTab('recherche')}
          choisi={choisi} setChoisi={setChoisi}
          filtres={filtresLog} setFiltres={setFiltresLog}
          survol={survol} setSurvol={setSurvol}
        />
      )}

      {tab === 'selection' && (
        <Selection
          retenus={retenus} toggleRetenu={toggleRetenu}
          choisi={choisi} setChoisi={setChoisi} scores={scores}
          notes={notes} setNotes={setNotes} votes={votes} setVotes={setVotes}
          go={go} survol={survol} setSurvol={setSurvol}
        />
      )}

      {tab === 'decision' && (
        <Decision
          retenus={retenus} weights={weights} setWeights={setWeights}
          scores={scores} choisi={choisi} go={go} toggleRetenu={toggleRetenu}
        />
      )}

      {(tab === 'offres' || tab === 'combinaisons') && (
        <div className="sk-empty" style={{ background: 'var(--surface)', minHeight: '60vh', display: 'grid', placeContent: 'center' }}>
          <p style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
            {tab === 'offres' ? 'Offres' : 'Combinaisons'} — hors périmètre de ce prototype
          </p>
          <p>Les quatre écrans maquettés sont Accueil, Rechercher, Logements et Décision.</p>
        </div>
      )}

      <footer style={{ padding: '20px 24px', borderTop: '1px solid var(--border-soft)', background: 'var(--panel)' }}>
        <span className="sk-cap">
          Prototype de refonte — jeu de démonstration. Aucun prix, aucune altitude et aucune disponibilité ne sont relevés.
        </span>
      </footer>
    </div>
  )
}
