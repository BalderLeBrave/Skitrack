/**
 * Prix séjour Ingénie — parseurs, sans réseau.
 *
 *   npm run ingenie:price-test
 */

import { readFileSync } from 'node:fs'
import {
  cleanProductUrl,
  extractObjectCodeFromCardHtml,
  extractTarifsPrestationId,
  extractWidgetObject,
  parseCalculerTotal,
  parseSearchAjax,
  parseTotalPrestationSpan,
  prestationDash,
  searchAjaxQuery,
  serializeTarifsForm,
  tarifsAjaxQuery,
  tarifsPrestationId,
  typePrestataireOf
} from './fichePrice'

let failures = 0
function check(label: string, condition: boolean, detail?: unknown): void {
  console.log(
    `  ${condition ? '✓' : '✗'} ${label}${condition || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`
  )
  if (!condition) failures++
}

const WIDGET_SNIPPET = `
<script type="application/javascript">
    (function() {
        var params = {"options":{"styles":{"variables":{"primaryColor":"#df2928"}},"templates":{"Week":"semaine","Days":"mois"},"ficheinfo":true},"booking":{"enable":true,"waitForWindowLoad":false},"el":"widget-dispo","object":{"code":"G|290|ST3N"},"cid":"5","site":{"code":"RESADEUXA","url":"https:\\/\\/reservation.les2alpes.com"}};
        var widget = new IngenieWidgetDispo.Client(params);
        widget.init();
    })();
</script>
<script>Resa.init_moteur_resa('5');</script>
gsw_vars["TYPREST"] = "G";
gsw_vars["CODEPRESTATAIRE"] = "290";
gsw_vars["CODEPRESTATION"] = "ST3N";
`

const USER_TOTAL = `<span id="total-prestation-G-5834094-6395741-1">432,47&nbsp;€</span>`

const TARIFS_HTML = `<form id="frm-tarifs-G-290-ST3N-1" name="frm-tarifs-G-290-ST3N-1" method="post">
<input type="hidden" name="cid" id="cid" value="5" />
<input type="hidden" name="prestation" id="prestation" value="G-290-ST3N" />
<input type="hidden" name="num_personne" id="num_personne" value="1" />
<input type="hidden" name="totalPrestationAjoutee" id="totalPrestationAjoutee" value="0" />
<input type="hidden" name="theme" id="theme" value="HIVER" />
<input type="hidden" name="stock_lies_nb" value="0" />
<input type="hidden" name="formules[]" id="formule-RESALYSLOC7" value="RESALYSLOC7" />
<input type="hidden" name="nb_personnes_RESALYSLOC7" value="1" />
<input type="checkbox" id="formule-checked-RESALYSLOC7" name="formule-checked-RESALYSLOC7" checked="checked" disabled="disabled" />
<select name="nb_personnes_MTAXE3E" id="nb_personnes_MTAXE3E" class="reponse_quantite">
  <option value="1">1</option>
  <option value="3" selected="selected">3</option>
</select>
<input type="hidden" name="formules[]" id="formule-MTAXE3E" value="MTAXE3E" />
<input type="hidden" name="formules[]" id="formule-SUPMENAGE" value="SUPMENAGE" />
<input type="hidden" name="nb_personnes_SUPMENAGE" value="1" />
<input type="button" class="bt_ajout_panier" value="Ajouter au panier" />
<td class="total_prestation"><span id="total-prestation-G-290-ST3N-1">N/A</span></td>
</form>
<script>Resa.calculer_total_prestation('G-290-ST3N-1','','','');</script>`

const CALC_JSON =
  '{"success":1,"data":{"lignes":[{"codeFormule":"MTAXE3E","total":"39,27\\u00a0\\u20ac"}],"total":"432,47\\u00a0\\u20ac"}}'
const CALC_CHAMPAME =
  '{"success":1,"data":{"total":"1\\u202f067,97\\u00a0\\u20ac"}}'

console.log('\nIngénie — TOTAL #total-prestation (Les 2 Alpes)\n')

console.log('1. Code objet sur la fiche #tarifs')
const obj = extractWidgetObject(WIDGET_SNIPPET)
check('pipe G|290|ST3N', obj?.pipe === 'G|290|ST3N', obj)
check('cid 5', obj?.cid === '5', obj)
check('cle_fiche PRESTATION-G-290-ST3N', prestationDash(obj?.pipe ?? '') === 'PRESTATION-G-290-ST3N')
check('prestation tarifs G-290-ST3N', tarifsPrestationId('PRESTATION-G-290-ST3N') === 'G-290-ST3N')
check('type prestataire G', typePrestataireOf(obj?.pipe ?? '') === 'G')

console.log('2. Le span TOTAL que l’utilisateur voit')
check(
  '432,47 € dans #total-prestation-G-5834094-6395741-1',
  parseTotalPrestationSpan(USER_TOTAL) === '432,47 €',
  parseTotalPrestationSpan(USER_TOTAL)
)
check('N/A avant calcul → null', parseTotalPrestationSpan(TARIFS_HTML) === null)
check(
  'calculerTotalPrestationAjax → 432,47 €',
  parseCalculerTotal(CALC_JSON) === '432,47 €',
  parseCalculerTotal(CALC_JSON)
)
check(
  'Champamé 1 067,97 € (séjour+taxe+ménage)',
  parseCalculerTotal(CALC_CHAMPAME) === '1 067,97 €',
  parseCalculerTotal(CALC_CHAMPAME)
)
check('échec success=0 → null', parseCalculerTotal('{"success":0,"erreur":{}}') === null)

console.log('3. searchAjax / serialize formules')
const search = parseSearchAjax(
  '{"data":{"package":false,"nbResults":1,"nbResultsFiche":1,"nbResultsLibelle":"résultat"},"success":1}'
)
check('nbResultsFiche = 1', search?.nbResultsFiche === 1 && search.success)
check('zéro dispo', parseSearchAjax('{"data":{"nbResultsFiche":0},"success":1}')?.nbResultsFiche === 0)

const qs = serializeTarifsForm(TARIFS_HTML)
check('serialize cid+prestation', qs.includes('cid=5') && qs.includes('prestation=G-290-ST3N'))
check('serialize formules[] séjour', qs.includes('RESALYSLOC7'))
check('serialize taxe 3 pers', qs.includes('nb_personnes_MTAXE3E=3'))
check('disabled checkbox absente', !qs.includes('formule-checked'))
check('bouton absente', !qs.includes('Ajouter'))

console.log('4. URLs')
check(
  'fiche sans ?action=',
  cleanProductUrl(
    'https://reservation.les2alpes.com/vacanceole-residence-champame-studio-3-personnes-les-2-alpes.html?cid=5&action=result&datedeb=16%2F01%2F2027'
  ) ===
    'https://reservation.les2alpes.com/vacanceole-residence-champame-studio-3-personnes-les-2-alpes.html'
)
const q = searchAjaxQuery({
  cid: '5',
  dash: 'PRESTATION-G-290-ST3N',
  typePrestataire: 'G',
  from: '16/01/2027',
  to: '23/01/2027',
  stay: 7,
  adults: 3,
  children: 0
})
check('searchAjax contient cle_fiche et dates', q.includes('cle_fiche=PRESTATION-G-290-ST3N') && q.includes('datedeb=16'))
check(
  'tarifsAjax prestation=G-290-ST3N',
  tarifsAjaxQuery({ cid: '5', prestation: 'G-290-ST3N' }).includes('prestation=G-290-ST3N')
)
check(
  'id Sélectionner G-5834094-6395741',
  extractTarifsPrestationId(
    "onclick=\"Resa.detail_tarifs_prestation_open('G-5834094-6395741','5', undefined, undefined, undefined, '', true);\""
  ) === 'G-5834094-6395741'
)

console.log('5. Carte SERP')
check(
  'pipe dans le HTML de carte',
  extractObjectCodeFromCardHtml('<div data-id="G|290|ST3N">x</div>') === 'G|290|ST3N'
)

/**
 * `page.evaluate(fn)` ne sérialise que le corps de `fn` : ses fermetures — donc
 * tous les imports du module — sont `undefined` dans la page. Un appel oublié
 * fait échouer la lecture des fiches sur **toutes** les centrales, avec une
 * `ReferenceError` qu'aucun test de parseur ne voit. On relit donc la source.
 */
console.log('6. Fonctions évaluées dans la page — aucune fermeture')
const stationSource = readFileSync('src/main/providers/station/station.ts', 'utf8')
const imported = [...stationSource.matchAll(/import\s+(?:type\s+)?\{([^}]+)\}\s+from/g)]
  .flatMap((m) => m[1].split(','))
  .map((n) => n.split(' as ').pop()!.trim())
  .filter((n) => n.length > 0 && !/^type\b/.test(n))

function bodyOf(source: string, signature: string): string {
  const start = source.indexOf(signature)
  if (start < 0) return ''
  let depth = 0
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1)
  }
  return ''
}

for (const signature of [
  'export function extractStationCards()',
  'export function readEngineContext()'
]) {
  const body = bodyOf(stationSource, signature)
  check(`${signature} lue`, body.length > 0)
  const leaked = imported.filter((n) => new RegExp(`\\b${n}\\s*\\(`).test(body))
  check(`${signature} n'appelle aucun import`, leaked.length === 0, leaked)
}

if (failures > 0) {
  console.error(`\n${failures} échec(s)`)
  process.exit(1)
}
console.log('\nok')
