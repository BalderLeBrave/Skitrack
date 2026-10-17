/**
 * Ce que `sonder-centrales-europe.mjs` lit dans une page : les liens qui
 * mènent à la réservation d'hébergement, et l'empreinte du moteur qui la fait
 * tourner. Pur : ni réseau, ni fichier, pour être testé seul.
 *
 * Une empreinte est une chaîne que seul ce moteur laisse dans une page (un
 * hôte de script ou d'iframe, un chemin, un « powered by »). Un nom de moteur
 * cité dans un texte ordinaire ne suffit pas : la preuve rendue cite le
 * passage, pour qu'un doute se vérifie.
 */

/** Le moteur, et ce qui le trahit dans le HTML. L'ordre compte : le premier qui répond gagne. */
export const EMPREINTES = [
  ["TOMAS", /tomas\.travel|\/ukv\/result\?tt=/i],
  ["Deskline / Feratel", /deskline|feratel|dwbooking/i],
  ["Citybreak", /citybreak|\/sites\/cb_[a-z0-9]+web\//i],
  ["CapCorn", /capcorn/i],
  ["Easybooking", /easybooking|easy-booking\.at/i],
  ["HRS Destination Solutions", /hrs-?destination/i],
  ["Alturos Destination OS", /alturos/i],
  ["SkiStar", /skistar\.com\/[a-z-]*\/?(?:boende|accommodation|lodging|overnatting)/i],
  ["Ingénie", /ingenie\.fr|resa\.ingenie/i],
  ["Open System", /open-?system\.fr|opensystem\.fr/i],
  ["Elloha", /elloha/i],
  ["Profitroom", /profitroom/i],
  ["Previo", /previo\.(?:cz|app)/i],
  ["Hotres", /hotres\.(?:pl|eu)/i],
  ["WuBook", /wubook|zakbooking/i],
  ["TravelLine", /travelline\.(?:ru|pro|app)/i],
  ["Simple Booking", /simplebooking\.it/i],
  ["Ericsoft", /ericsoft/i],
  ["Bookingsuite", /bookingsuite/i],
  ["Seekda", /seekda/i],
  ["Mirai", /mirai\.com/i],
  ["Roiback", /roiback/i],
  ["Neobookings", /neobookings/i],
  ["Visbook", /visbook/i],
  ["Bookvisit", /bookvisit/i],
  ["Cloudbooking", /cloudbooking/i],
  ["Lodgify", /lodgify/i],
  ["V-Office", /v-office\.com/i],
  ["OpenBooking", /openbooking/i],
  ["Tourwrite", /tourwrite/i],
];

/** Les mots d'un lien d'hébergement, dans les langues des domaines du référentiel. */
const MOTS =
  /unterk[uü]nft|übernacht|ubernacht|zimmer|accommodation|lodging|where-to-stay|hébergement|hebergement|logement|alloggi|dove-dormire|dormire|pernott|boende|overnatting|majoitus|alojamiento|allotjament|noclegi|ubytov|nastan|szállás|szallas|cazare|smje[sš]taj|sme[sš]taj|namestitev|prenoc|настан|прожив|размещ|buchen|booking|book-now|reserv|réserv|prenot|boka|bestill|varaa/i;

/** Rend la page plate, sans espaces superflus, pour citer une preuve lisible. */
function aplatir(html) {
  return html.replace(/\s+/g, " ");
}

/** L'empreinte du premier moteur reconnu, avec le passage qui le prouve. */
export function moteurDe(html) {
  const plat = aplatir(html);
  for (const [moteur, re] of EMPREINTES) {
    const m = re.exec(plat);
    if (!m) continue;
    const debut = Math.max(0, m.index - 50);
    return { moteur, preuve: plat.slice(debut, m.index + m[0].length + 50).trim() };
  }
  return null;
}

/**
 * Les liens d'une page qui mènent à l'hébergement, du plus parlant au moins
 * parlant : un lien dont l'adresse et le texte le disent passe devant un lien
 * qui ne le dit qu'à moitié. Adresses absolues, sans ancre, sans doublon.
 */
export function liensHebergement(html, base, max = 3) {
  const vus = new Set();
  const out = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(re)) {
    let url;
    try {
      url = new URL(m[1], base);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(url.protocol)) continue;
    const texte = m[2]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const parAdresse = MOTS.test(url.pathname + url.hostname);
    const parTexte = MOTS.test(texte);
    if (!parAdresse && !parTexte) continue;
    url.hash = "";
    const cle = url.toString();
    if (vus.has(cle)) continue;
    vus.add(cle);
    out.push({
      url: cle,
      texte: texte.slice(0, 80),
      score: (parAdresse ? 2 : 0) + (parTexte ? 1 : 0),
    });
  }
  return out
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(({ url, texte }) => ({ url, texte }));
}

/** Ce que `robots.txt` interdit au robot `*` : les préfixes `Disallow`. */
export function interditsRobots(txt) {
  const out = [];
  let pourTous = false;
  for (const ligne of txt.split(/\r?\n/)) {
    const l = ligne.replace(/#.*/, "").trim();
    const ua = /^user-agent\s*:\s*(.+)$/i.exec(l);
    if (ua) {
      pourTous = ua[1].trim() === "*";
      continue;
    }
    const d = /^disallow\s*:\s*(.*)$/i.exec(l);
    if (d && pourTous && d[1].trim()) out.push(d[1].trim());
  }
  return out;
}

/** Le chemin est-il permis ? Un `Disallow` est un préfixe ; `*` vaut n'importe quoi. */
export function cheminPermis(chemin, interdits) {
  return !interdits.some((p) => {
    const re = new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*"));
    return re.test(chemin);
  });
}
