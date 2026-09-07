/**
 * Une photo par station, prise sur Wikimedia Commons.
 *
 * ## Pourquoi Commons et pas « le web »
 *
 * `src/renderer/src/assets/img/README.md` pose déjà la règle : les sept photos
 * de maquette viennent de sites de tourisme, aucune n'est libre, et elles
 * doivent être remplacées avant toute distribution. Aller chercher 283 photos
 * de plus au hasard du web reproduirait ce problème à quarante fois l'échelle,
 * sans qu'aucune ne soit distribuable. Commons est la seule source qui publie
 * une licence lisible par machine **et** la position de la prise de vue.
 *
 * ## Comment une photo est rattachée à sa station
 *
 * Par les coordonnées, pas par le nom. Une recherche « Tignes » ramène le lac,
 * le barrage et une affiche ; une recherche géographique dans un rayon de
 * quelques kilomètres autour du front de neige ramène des photos prises *là*.
 * Le nom ne sert qu'à départager les candidates, jamais à en retenir une seule.
 *
 * Rien n'est deviné : une station sans candidate acceptable **reste sans
 * photo**, et le manifeste le dit. Une photo approximative serait pire que pas
 * de photo — l'accueil retombe alors sur celle du massif, en l'annonçant.
 *
 * ## Ce que le manifeste garde
 *
 * Chaque fichier écrit s'accompagne de son titre Commons, son auteur, sa
 * licence et son URL de description. Sans cela, la mention légale exigée par
 * CC-BY est impossible à produire, et le fichier devient inutilisable.
 *
 * Usage :
 *   node tools/import-station-photos.mjs [--limit N] [--dry] [--only nom]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ICI = dirname(fileURLToPath(import.meta.url))
const RACINE = join(ICI, '..')
const CATALOGUE = join(RACINE, 'src/renderer/src/data/franceMontagnesStations.ts')
const DOSSIER = join(RACINE, 'src/renderer/src/assets/img')
const MANIFESTE = join(RACINE, 'docs/sources/station-photos.json')
/**
 * Copie lue par l'application.
 *
 * Le manifeste sert deux publics. Dans `docs/sources/`, il documente d'où
 * viennent les fichiers, pour qui relit l'import. Dans `data/`, il est
 * empaqueté avec l'application, parce que CC-BY et CC-BY-SA **exigent** que le
 * crédit voyage avec l'image : une photo affichée sans son auteur ni sa licence
 * n'est pas utilisable, quelle que soit la qualité du téléchargement.
 */
const MANIFESTE_APP = join(RACINE, 'src/renderer/src/data/stationPhotos.json')

const API = 'https://commons.wikimedia.org/w/api.php'
const UA = 'SKITRACK/0.1 (import de photos de stations ; usage personnel)'

/** Largeur demandée. 1920 couvre la vignette et la bande panoramique. */
const LARGEUR = 1920
/** Un fichier plus petit que cela ne tiendra pas la bande panoramique. */
const MIN_COTE = 1400
/** Rayons successifs, en mètres. On s'éloigne seulement si on n'a rien trouvé. */
const RAYONS = [3000, 6000, 12000]

/**
 * Licences acceptées, telles que Commons les nomme.
 *
 * Liste **blanche** : une licence inconnue est refusée, jamais tolérée. Les
 * mentions « non commercial » et « no derivatives » sont absentes exprès — une
 * application qu'on installe est une distribution.
 */
const LICENCES = [
  /^cc0/i,
  /^public domain/i,
  /^cc[- ]by(-sa)?[- ]?[1-4]/i,
  /^cc[- ]by(-sa)?$/i
]

/**
 * Titres qui ne sont pas des photos de station, quoi qu'en dise la position.
 *
 * Les vues depuis la Station spatiale (`ISSnnn-E-…`, « View of Earth ») en
 * font partie : domaine public, 1920 px, géolocalisées pile sur la station,
 * datées d'hiver — elles passaient tous les filtres, et montrent la Terre
 * depuis l'orbite. Neuf sont entrées ainsi avant que la revue ne les attrape.
 */
const REFUS = /carte|map|plan|logo|blason|coat of arms|diagram|schéma|graph|chart|panneau|sign|portrait|affiche|poster|timbre|stamp|drapeau|flag|ISS\d+-E-|view of earth|\.svg$|\.pdf$|\.tif+$|\.webm$|\.ogv$/i

function attendre(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function api(params) {
  const u = new URL(API)
  for (const [k, v] of Object.entries({ format: 'json', formatversion: 2, ...params })) {
    u.searchParams.set(k, String(v))
  }
  // Six essais, en reculant : l'objectif est de n'avoir aucun trou dû au
  // réseau. Une station sans photo doit vouloir dire « Commons n'en a pas »,
  // jamais « la requête est tombée ».
  for (let essai = 1; essai <= 6; essai++) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA } })
      if (r.status === 429 || r.status >= 500) {
        await attendre(1500 * essai * essai)
        continue
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return await r.json()
    } catch (err) {
      if (essai === 6) throw err
      await attendre(900 * essai)
    }
  }
  return null
}

/** Les stations du catalogue, avec ce qu'il faut pour chercher et pour nommer. */
function stations() {
  const src = readFileSync(CATALOGUE, 'utf8')
  const out = []
  const re = /\{\s*id:\s*(\d+),[^}]*?fmName:\s*"([^"]+)"[^}]*?massif:\s*"([^"]*)"[^}]*?commune:\s*"([^"]*)"[^}]*?lat:\s*([-\d.]+),\s*lon:\s*([-\d.]+)/g
  let m
  while ((m = re.exec(src))) {
    out.push({
      id: Number(m[1]),
      nom: m[2],
      massif: m[3],
      commune: m[4],
      lat: Number(m[5]),
      lon: Number(m[6])
    })
  }
  return out
}

/** Même repli que `data/stations.ts` : accents et ponctuation retirés. */
function slug(nom) {
  return nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function licenceOk(nom) {
  return Boolean(nom) && LICENCES.some((re) => re.test(nom.trim()))
}

function texte(v) {
  return String(v ?? '').replace(/<[^>]*>/g, '').trim()
}

/**
 * Note d'une candidate. Plus c'est haut, mieux c'est.
 *
 * Trois signaux, dans cet ordre : la photo nomme la station ou sa commune, elle
 * est proche, elle est grande et en paysage. Le nom **départage**, il ne
 * sélectionne pas : une photo sans le nom mais à 400 m du front de neige reste
 * une bonne candidate.
 */
const SKI = /ski|piste|slope|snow|neige|neigeux|station|remont[ée]e|t[ée]l[ée]si[èe]ge|t[ée]l[ée]cabine|t[ée]l[ée]ph[ée]rique|chairlift|gondola|cable ?car|winter|hiver|domaine skiable|front de neige|damage/i

/**
 * Signes qu'une photo montre de la neige.
 *
 * Trois indices, et aucun n'est parfait pris seul :
 *
 *  - le mot, dans le titre ou la description — le plus sûr quand il est là ;
 *  - le mois de prise de vue, quand l'EXIF le donne : de décembre à avril, une
 *    photo de station française est enneigée dans l'immense majorité des cas ;
 *  - le ski lui-même — « télésiège en fonctionnement », « piste bleue » — qui
 *    n'existe pas hors saison.
 *
 * Un candidat qui n'en présente aucun est **écarté**, pas relégué. La consigne
 * est une photo avec de la neige : une photo d'alpage en juillet n'y répond
 * pas, et la station reste alors sans photo plutôt qu'avec la mauvaise.
 */
const NEIGE = /neige|neigeux|enneig|snow|snowy|hiver|winter|ski|piste|poudreuse|powder|glacier|névé|verglas|damage|damée/i

/** Mois d'enneigement en station française. Décembre à avril. */
const MOIS_NEIGE = new Set([1, 2, 3, 4, 12])

function moisDe(ex) {
  const brut = texte(ex?.DateTimeOriginal?.value) || texte(ex?.DateTime?.value)
  const m = brut.match(/^(\d{4})[-:/](\d{2})/)
  return m ? Number(m[2]) : null
}

/**
 * Sujets qui existent *dans* une station sans la montrer.
 *
 * Une église, une rue de village ou un monument aux morts sont photographiés
 * au bon endroit et n'apprennent rien sur le domaine skiable. Ils passaient en
 * tête à Abondance, à Albiez et à Aussois : proches, libres, grands, et hors
 * sujet. Le malus les laisse candidats — ils restent mieux que rien quand la
 * station n'a que cela — mais ils cèdent la place à toute photo de montagne.
 */
const HORS_SUJET = /[ée]glise|church|chapelle|chapel|abbaye|clocher|mairie|monument|mus[ée]e|cimeti[èe]re|statue|fontaine|lavoir|ch[âa]teau|rue |street|place d|pont |gare |viaduc|barrage|fleur|flower|insecte|papillon|oiseau|bird|champignon/i

function note(cand, st) {
  let n = 0
  const hay = `${cand.titre} ${cand.description}`.toLowerCase()
  if (hay.includes(st.nom.toLowerCase())) n += 45
  if (st.commune && hay.includes(st.commune.toLowerCase())) n += 20
  // Le sujet pèse plus que le nom : une photo de pistes sans légende vaut mieux
  // qu'une photo d'église qui porte le nom de la commune.
  if (SKI.test(hay)) n += 70
  if (HORS_SUJET.test(hay)) n -= 55
  // La neige d'abord : c'est la consigne, pas une préférence.
  if (cand.dit) n += 80
  if (cand.hiver) n += 45
  if (cand.distance != null) n += Math.max(0, 30 - cand.distance / 200)
  if (cand.w >= cand.h) n += 15
  n += Math.min(20, Math.max(cand.w, cand.h) / 400)
  return n
}

async function candidatesFor(st) {
  const vues = new Map()
  let repondu = false
  for (const rayon of RAYONS) {
    const g = await api({
      action: 'query',
      list: 'geosearch',
      gscoord: `${st.lat}|${st.lon}`,
      gsradius: rayon,
      gsnamespace: 6,
      gslimit: 100
    })
    // Distinguer « rien autour » de « la requête a échoué ». Sans ce drapeau,
    // une coupure réseau se lisait « aucune candidate libre » et une station
    // parfaitement pourvue passait pour dépourvue.
    if (g?.query) repondu = true
    for (const x of g?.query?.geosearch ?? []) {
      // `null` quand l'API ne donne pas la distance : le rayon de recherche
      // n'est pas une mesure, et l'écran de revue l'aurait affichée comme telle.
      if (!vues.has(x.title)) vues.set(x.title, typeof x.dist === 'number' ? x.dist : null)
    }
    await attendre(180)
    if (vues.size >= 40) break
  }
  if (!repondu) throw new Error('Commons ne répond pas')
  const titres = [...vues.keys()].filter((t) => !REFUS.test(t))
  if (titres.length === 0) return []

  const out = []
  for (let i = 0; i < titres.length; i += 40) {
    const lot = titres.slice(i, i + 40)
    const info = await api({
      action: 'query',
      titles: lot.join('|'),
      prop: 'imageinfo',
      iiprop: 'url|size|mime|extmetadata',
      iiurlwidth: LARGEUR
    })
    for (const p of info?.query?.pages ?? []) {
      const ii = p.imageinfo?.[0]
      if (!ii || !/image\/(jpeg|png)/.test(ii.mime ?? '')) continue
      // Sans vignette, on téléchargerait l'original : un PNG de 27 Mo est déjà
      // entré ainsi, renommé .jpg de surcroît. La vignette borne la taille et
      // dit son vrai format par son URL.
      if (!ii.thumburl) continue
      if (Math.max(ii.width, ii.height) < MIN_COTE) continue
      const ex = ii.extmetadata ?? {}
      const licence = texte(ex.LicenseShortName?.value)
      if (!licenceOk(licence)) continue
      const description = texte(ex.ImageDescription?.value)
      if (REFUS.test(description)) continue
      const mois = moisDe(ex)
      const hiver = mois != null && MOIS_NEIGE.has(mois)
      const dit = NEIGE.test(`${p.title} ${description}`)
      // La condition d'entrée : sans mot de neige **et** sans date d'hiver, on
      // n'a aucune raison de croire que la photo est enneigée.
      if (!dit && !hiver) continue
      // Une abbaye photographiée en février reste une abbaye. La date d'hiver
      // seule ne rachète pas un sujet hors propos : il lui faut le mot.
      if (!dit && HORS_SUJET.test(`${p.title} ${description}`)) continue
      const ext = (ii.thumburl.match(/\.(jpe?g|png|webp)(?:$|[?/])/i)?.[1] ?? 'jpg').toLowerCase()
      out.push({
        ext: ext === 'jpeg' ? 'jpg' : ext,
        hiver,
        dit,
        mois,
        titre: p.title,
        url: ii.thumburl ?? ii.url,
        page: ii.descriptionurl,
        w: ii.thumbwidth ?? ii.width,
        h: ii.thumbheight ?? ii.height,
        licence,
        auteur: texte(ex.Artist?.value) || texte(ex.Credit?.value) || null,
        description,
        distance: vues.get(p.title) ?? null
      })
    }
    await attendre(250)
  }
  return out
}

/**
 * Complète la description des entrées qui n'en ont pas.
 *
 * La description vient de la page Commons du fichier — le texte du
 * photographe, jamais un texte généré. Une entrée dont Commons ne publie rien
 * reçoit `null` et n'est pas redemandée : `absentes` distingue « jamais
 * demandé » (champ absent) de « demandé, rien à dire » (`null`).
 */
async function completerDescriptions(manifeste) {
  const aFaire = Object.entries(manifeste).filter(([, e]) => e.description === undefined)
  if (aFaire.length === 0) return
  console.log(`\nDescriptions à compléter : ${aFaire.length}`)
  for (let i = 0; i < aFaire.length; i += 40) {
    const lot = aFaire.slice(i, i + 40)
    let info = null
    try {
      info = await api({
        action: 'query',
        titles: lot.map(([, e]) => e.titre).join('|'),
        prop: 'imageinfo',
        iiprop: 'extmetadata'
      })
    } catch {
      // Lot en échec : les champs restent absents, un prochain passage réessaie.
      continue
    }
    const parTitre = new Map()
    for (const p of info?.query?.pages ?? []) {
      parTitre.set(p.title, texte(p.imageinfo?.[0]?.extmetadata?.ImageDescription?.value) || null)
    }
    for (const [, e] of lot) {
      if (parTitre.has(e.titre)) e.description = parTitre.get(e.titre)
    }
    await attendre(400)
  }
}

/** Le manifeste, écrit là où il est lu : la doc et l'application. */
function ecrireManifeste(manifeste) {
  mkdirSync(dirname(MANIFESTE), { recursive: true })
  const texteJson = `${JSON.stringify(manifeste, null, 2)}
`
  // Atomique : Vite lit `src/` en continu, et une lecture au milieu d'un
  // `writeFileSync` direct rend un JSON tronqué qui casse le build.
  for (const cible of [MANIFESTE, MANIFESTE_APP]) {
    writeFileSync(`${cible}.tmp`, texteJson)
    renameSync(`${cible}.tmp`, cible)
  }
}

async function principal() {
  const args = process.argv.slice(2)
  const limite = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity
  const sec = args.includes('--dry')
  const seul = args.includes('--only') ? args[args.indexOf('--only') + 1] : null

  const liste = stations().filter((s) => (seul ? s.nom.toLowerCase().includes(seul.toLowerCase()) : true))
  const cible = liste.slice(0, limite)
  console.log(`${liste.length} stations au catalogue, ${cible.length} traitées${sec ? ' (à blanc)' : ''}.`)

  if (!sec) mkdirSync(DOSSIER, { recursive: true })
  const manifeste = existsSync(MANIFESTE) ? JSON.parse(readFileSync(MANIFESTE, 'utf8')) : {}

  /**
   * Purge des entrées que la liste de refus condamne après coup.
   *
   * Neuf vues satellites (`ISSnnn-E-…`) sont entrées avant que le motif ne les
   * refuse : leurs fichiers et leurs entrées sont retirés ici, ce qui rouvre la
   * station au traitement normal du même passage. Sans cette purge, le
   * raccourci « fichier + crédit présents » les aurait figées pour toujours.
   */
  for (const [cle, entree] of Object.entries(manifeste)) {
    if (!REFUS.test(entree.titre ?? '')) continue
    const fichierCondamne = join(DOSSIER, entree.fichier ?? `station-${cle}.jpg`)
    if (existsSync(fichierCondamne)) unlinkSync(fichierCondamne)
    delete manifeste[cle]
    console.log(`  purge : ${cle} — ${String(entree.titre).replace(/^File:/, '')}`)
  }
  // « Une photo unique par station » : deux stations voisines tombent sur les
  // mêmes fichiers Commons, et la meilleure candidate de l'une est souvent
  // celle de l'autre. Un fichier déjà attribué est donc écarté pour les
  // suivantes, qui prennent leur deuxième choix.
  const prises = new Set(Object.values(manifeste).map((e) => e.titre))
  let ecrites = 0
  let deja = 0
  const sans = []
  /** Stations non traitées faute de réponse : à relancer, pas à conclure. */
  const echecs = []

  for (const st of cible) {
    const cle = slug(st.nom)
    const fichier = join(DOSSIER, `station-${cle}.jpg`)
    // Un fichier n'est « déjà fait » que si son crédit l'est aussi. La version
    // précédente sautait dès que le fichier existait : une photo posée par un
    // passage interrompu restait à jamais sans auteur ni licence, donc
    // inutilisable, et aucune relance ne la rattrapait.
    if (!sec && manifeste[cle] && existsSync(join(DOSSIER, manifeste[cle].fichier ?? `station-${cle}.jpg`))) {
      deja++
      continue
    }
    let cands = null
    try {
      cands = await candidatesFor(st)
    } catch (err) {
      echecs.push(st.nom)
      console.log(`  ${st.nom.padEnd(28)} réseau : ${String(err).slice(0, 50)}`)
      continue
    }
    if (cands.length === 0) {
      sans.push(st.nom)
      console.log(`  ${st.nom.padEnd(28)} aucune candidate libre`)
      continue
    }
    cands.sort((a, b) => note(b, st) - note(a, st))
    const gagnante = cands.find((c) => !prises.has(c.titre))
    if (!gagnante) {
      sans.push(st.nom)
      console.log(`  ${st.nom.padEnd(28)} candidates déjà prises par une voisine`)
      continue
    }
    prises.add(gagnante.titre)
    // L'extension est celle du fichier réel : un PNG écrit `.jpg` ment sur son
    // type, même si Chromium le lit quand même.
    const fichierReel = join(DOSSIER, `station-${cle}.${gagnante.ext ?? 'jpg'}`)
    console.log(
      `  ${st.nom.padEnd(28)} ${gagnante.w}×${gagnante.h} [${gagnante.licence}] ` +
        `${gagnante.distance != null ? `${Math.round(gagnante.distance)} m` : 'distance ?'} — ${gagnante.titre.replace(/^File:/, '')}`
    )
    if (sec) continue
    try {
      // Commons répond 429 quand on tire trop vite : on attend et on repose la
      // question, au lieu de compter la station comme dépourvue.
      let bin = null
      for (let essai = 1; essai <= 4; essai++) {
        bin = await fetch(gagnante.url, { headers: { 'User-Agent': UA } })
        if (bin.status !== 429) break
        await attendre(3000 * essai)
      }
      if (!bin || !bin.ok) throw new Error(`HTTP ${bin?.status ?? '?'}`)
      writeFileSync(fichierReel, Buffer.from(await bin.arrayBuffer()))
      manifeste[cle] = {
        fichier: `station-${cle}.${gagnante.ext ?? 'jpg'}`,
        station: st.nom,
        massif: st.massif,
        titre: gagnante.titre,
        auteur: gagnante.auteur,
        licence: gagnante.licence,
        page: gagnante.page,
        largeur: gagnante.w,
        hauteur: gagnante.h,
        distanceM: gagnante.distance != null ? Math.round(gagnante.distance) : null,
        // La description publiée sur Commons, celle du photographe. C'est ce
        // que la fiche affiche en légende : une vraie description, pas une
        // phrase générée. `null` quand la page n'en publie pas — la fiche
        // retombe alors sur le titre du fichier, qui reste un texte d'auteur.
        description: gagnante.description || null,
        // Pourquoi cette photo est réputée enneigée : le mot, le mois, ou les
        // deux. Sans cette trace, impossible de revoir un choix douteux.
        neigeDite: gagnante.dit,
        moisPriseDeVue: gagnante.mois
      }
      ecrites++
      // Écrit à chaque station, pas seulement à la fin. Un import de 285
      // stations dure une demi-heure : sans cela l'encadré de revue reste vide
      // tout ce temps, et une interruption perd les crédits déjà acquis alors
      // que les fichiers, eux, sont déjà sur le disque.
      ecrireManifeste(manifeste)
    } catch (err) {
      sans.push(st.nom)
      console.log(`  ${st.nom} — téléchargement refusé : ${String(err).slice(0, 60)}`)
    }
    await attendre(700)
  }

  // Les entrées écrites par les passages antérieurs n'ont pas de description :
  // on la complète depuis Commons, par lots, sans rien retélécharger. C'est un
  // aller-retour de métadonnées par quarante fichiers, pas un import.
  if (!sec) await completerDescriptions(manifeste)

  if (!sec) ecrireManifeste(manifeste)

  console.log(
    `\n${ecrites} photo(s) écrite(s), ${deja} déjà présente(s), ` +
      `${sans.length} station(s) sans photo libre.`
  )
  if (sans.length) console.log(`Sans photo libre : ${sans.join(', ')}`)
  if (echecs.length) {
    console.log(`
Non traitées, réseau (relancer) : ${echecs.join(', ')}`)
  }
  console.log(`Manifeste : ${MANIFESTE}`)
}

await principal()
