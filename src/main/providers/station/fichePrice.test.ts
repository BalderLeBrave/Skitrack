/**
 * Prix séjour Ingénie — parseurs, sans réseau.
 *
 *   npm run ingenie:price-test
 */

import {
  cleanProductUrl,
  detailAjaxQuery,
  extractObjectCodeFromCardHtml,
  extractWidgetObject,
  parseSearchAjax,
  parseStayPriceFromDetailHtml,
  prestationDash,
  searchAjaxQuery,
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

const DETAIL_HTML = `<div id="bloc_detail_prestations"><table class="tab_detail_prestations"><tbody><tr class="ligne_prestation ligne_prestation_1"><td class="col_libelle_prestation">Vacanc&eacute;ole - R&eacute;sidence Champam&eacute; - Studio 3 personnes</td><td class="col_tarif"><span class="prix_en_cours">528,70&nbsp;€</span><br /><span class="prix_barre">622&nbsp;€</span>&nbsp;</td></tr></tbody></table></div>`

const COOKIE_BLOCK =
  "<span>Impossible d'afficher le résultat de la recherche, les cookies sont nécessaires au bon fonctionnement</span>"

console.log('\nIngénie — prix séjour (Champamé / Les 2 Alpes)\n')

console.log('1. Code objet sur la fiche #tarifs')
const obj = extractWidgetObject(WIDGET_SNIPPET)
check('pipe G|290|ST3N', obj?.pipe === 'G|290|ST3N', obj)
check('cid 5', obj?.cid === '5', obj)
check('cle_fiche PRESTATION-G-290-ST3N', prestationDash(obj?.pipe ?? '') === 'PRESTATION-G-290-ST3N')
check('type prestataire G', typePrestataireOf(obj?.pipe ?? '') === 'G')

console.log('2. searchAjax / detailPrestationsAjax')
const search = parseSearchAjax(
  '{"data":{"package":false,"nbResults":1,"nbResultsFiche":1,"nbResultsLibelle":"résultat"},"success":1}'
)
check('nbResultsFiche = 1', search?.nbResultsFiche === 1 && search.success)
check(
  'JSONP encapsulé',
  parseSearchAjax('cb({"data":{"nbResultsFiche":1},"success":1})')?.nbResultsFiche === 1
)
check('zéro dispo', parseSearchAjax('{"data":{"nbResultsFiche":0},"success":1}')?.nbResultsFiche === 0)

const price = parseStayPriceFromDetailHtml(DETAIL_HTML)
check('prix en cours 528,70 €, pas le barré 622', price === '528,70 €', price)
check('refus cookies → null', parseStayPriceFromDetailHtml(COOKIE_BLOCK) === null)

console.log('3. URLs')
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
  'detailAjax id=PRESTATION-G-290-ST3N',
  detailAjaxQuery({ cid: '5', dash: 'PRESTATION-G-290-ST3N' }).includes('id=PRESTATION-G-290-ST3N')
)

console.log('4. Carte SERP')
check(
  'pipe dans le HTML de carte',
  extractObjectCodeFromCardHtml('<div data-id="G|290|ST3N">x</div>') === 'G|290|ST3N'
)
check(
  'cle_fiche PRESTATION- dans la carte',
  extractObjectCodeFromCardHtml('<div id="blocResa-PRESTATION-G-290-ST3N">') === 'G|290|ST3N'
)

if (failures > 0) {
  console.error(`\n${failures} échec(s)`)
  process.exit(1)
}
console.log('\nok')
