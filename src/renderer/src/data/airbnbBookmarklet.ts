/**
 * Le marque-page Airbnb, fabriqué à la demande.
 *
 * Contrairement à la version précédente (constante figée), l'URL est construite
 * avec le **jeton d'appairage** de cette installation : c'est lui qui autorise
 * le marque-page à déposer son relevé directement dans l'application, sans
 * passer par le presse-papiers ni obliger l'utilisateur à revenir.
 *
 * Le code exécuté est celui de `scripts/airbnb-bookmarklet.src.ts`, minifié. Il
 * tente d'abord l'envoi direct ; si SKITRACK est fermé, il retombe sur le
 * presse-papiers, et l'import se fera au retour dans l'application.
 */

const TEMPLATE = "(()=>{(function(){var s=document.getElementById(\"data-deferred-state-0\");if(!s||!s.textContent){alert(`SKITRACK : donn\\xE9es Airbnb introuvables.\n\nPlacez-vous sur une page de R\\xC9SULTATS de recherche Airbnb (l\\u2019adresse contient \\xAB /s/\\u2026/homes \\xBB), puis recliquez.`);return}var g;try{g=JSON.parse(s.textContent)}catch{alert(\"SKITRACK : donn\\xE9es illisibles. Rechargez la page et r\\xE9essayez.\");return}var o=[];function O(r){var e;return function a(t){if(!(e||t==null||typeof t!=\"object\")){var i=t.accessibilityLabel;if(typeof i==\"string\"&&i.indexOf(\"\\u20AC\")>=0){e=i;return}for(var n in t)Object.prototype.hasOwnProperty.call(t,n)&&a(t[n])}}(r),e}if(function r(e){if(!(e==null||typeof e!=\"object\")){if(Object.prototype.toString.call(e)===\"[object Array]\"){for(var a=0;a<e.length;a++)r(e[a]);return}if(e.__typename===\"StaySearchResult\"){var t=e.demandStayListing||{},i=t.location||{},n=i.coordinate||{},c=\"\",C=typeof t.id==\"string\"?t.id:\"\";if(C)try{var b=atob(C),K=b.lastIndexOf(\":\");c=K>=0?b.slice(K+1):b}catch{c=\"\"}var R=e.contextualPictures||[],m=R.length?R[0].picture:void 0,T=typeof e.subtitle==\"string\"&&e.subtitle.replace(/^\\s+|\\s+$/g,\"\")||typeof e.title==\"string\"&&e.title.replace(/^\\s+|\\s+$/g,\"\")||\"\";c&&T&&o.push({id:c,name:T,priceLabel:O(e.structuredDisplayPrice),lat:typeof n.latitude==\"number\"?n.latitude:void 0,lon:typeof n.longitude==\"number\"?n.longitude:void 0,ratingLabel:typeof e.avgRatingA11yLabel==\"string\"?e.avgRatingA11yLabel:void 0,image:m})}for(var A in e)Object.prototype.hasOwnProperty.call(e,A)&&r(e[A])}}(g),!o.length){alert(\"SKITRACK : aucune annonce trouv\\xE9e. Faites d\\u2019abord d\\xE9filer les r\\xE9sultats.\");return}for(var y={},f=[],p=0;p<o.length;p++){var d=o[p];y[d.id]||(y[d.id]=1,f.push(d))}var l=new URLSearchParams(document.location.search),u=JSON.stringify({source:\"airbnb\",checkIn:l.get(\"checkin\")||l.get(\"check_in\")||void 0,checkOut:l.get(\"checkout\")||l.get(\"check_out\")||void 0,listings:f}),h=f.length;function S(){navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(u).then(function(){alert(\"SKITRACK : \"+h+` annonce(s) copi\\xE9e(s).\n\nRetournez dans SKITRACK, l\\u2019import se fera tout seul.`)},function(){window.prompt(\"Copiez ce texte (Ctrl+C) puis collez-le dans SKITRACK :\",u)}):window.prompt(\"Copiez ce texte (Ctrl+C) puis collez-le dans SKITRACK :\",u)}try{fetch(\"http://127.0.0.1:__PORT__/paste/__TOKEN__\",{method:\"POST\",mode:\"no-cors\",headers:{\"Content-Type\":\"text/plain\"},body:u}).then(function(){alert(\"SKITRACK : \"+h+\" annonce(s) envoy\\xE9e(s) \\xE0 l\\u2019application.\")},function(){S()})}catch{S()}})();})();"

/** Port de l'oreille locale — doit rester synchronisé avec `main/pasteBridge.ts`. */
export const PASTE_PORT = 47653

/** Construit l'URL `javascript:` du marque-page pour ce poste. */
export function buildBookmarkletHref(pairingToken: string): string {
  const code = TEMPLATE.replace('__PORT__', String(PASTE_PORT)).replace('__TOKEN__', pairingToken)
  return 'javascript:' + encodeURIComponent(code)
}

export const AIRBNB_BOOKMARKLET_LABEL = 'Copier pour SKITRACK'
