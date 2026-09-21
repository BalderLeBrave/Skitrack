/**
 * Les collisions de classe entre une page et un composant.
 *
 * Ce contrôle existe pour un défaut précis, et parce qu'il était **muet**.
 *
 * `/carte` pose sa grille de page sur `<main class="carte">`, et le composant
 * `Carte` nomme sa racine `.carte` lui aussi (`design/base.css`). Une règle
 * écrite pour l'une tombait donc sur l'autre. Sous 1024 px, la requête média
 * passait la grille en `height: auto` ; le composant, dont l'unique enfant est
 * en position absolue, s'effondrait à zéro.
 *
 * Rien ne le signalait. Les trois cent vingt épingles étaient dans le
 * document, les tuiles chargées, aucune erreur en console, aucun test rouge —
 * et un rectangle gris à l'écran. C'est le genre de panne qu'aucune suite ne
 * rattrape, faute de regarder une hauteur calculée.
 *
 * Ce fichier ne mesure donc pas une mise en page : il vérifie que la feuille
 * n'écrit plus le sélecteur ambigu qui l'a produite.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const STYLES = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const BASE = readFileSync(new URL("./base.css", import.meta.url), "utf8");
const CARTE = readFileSync(new URL("../routes/carte.tsx", import.meta.url), "utf8");

/**
 * Les sélecteurs d'une feuille : ce qui précède chaque `{`.
 *
 * **Les commentaires sont retirés d'abord**, et ce n'est pas une précaution de
 * style. Une première version lisait la feuille telle quelle ; le texte des
 * commentaires entrait alors dans les sélecteurs — « carte réelle à droite »
 * en était un — et, selon l'endroit où l'expression rationnelle avait fini la
 * correspondance précédente, une vraie règle se retrouvait collée à la fin du
 * commentaire qui la présentait. Le contrôle passait au vert avec le défaut
 * dans le fichier. Il a fallu réintroduire le défaut pour s'en apercevoir.
 */
function selecteurs(css: string): string[] {
  const sansCommentaires = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return sansCommentaires
    .split("}")
    .map((bloc) => bloc.slice(0, bloc.indexOf("{")))
    .flatMap((tete) => tete.split(","))
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("@"));
}

describe("`.carte` désigne deux choses, et les règles doivent le savoir", () => {
  it("le composant garde sa classe : c'est lui le propriétaire du nom", () => {
    // Si ceci tombe, c'est que le composant a été renommé — et la collision
    // n'existe plus. Le reste de ce fichier devient alors sans objet.
    assert.match(BASE, /^\.carte \{/m, "design/base.css doit toujours styler .carte");
  });

  it("la page s'annonce en `main`, ce qui la rend distinguable", () => {
    assert.match(CARTE, /<main className="carte"/);
  });

  it("styles.css ne pose plus de règle sur `.carte` tout court", () => {
    // `.carte__map`, `.carte-row`, `main.carte` : tous permis. Le seul
    // sélecteur interdit est celui qui ne dit pas de qui il parle.
    const ambigus = selecteurs(STYLES).filter((s) => s === ".carte");
    assert.deepEqual(
      ambigus,
      [],
      "une règle sur `.carte` tombe aussi sur le composant : écrire `main.carte`",
    );
  });

  it("l'hôte de la carte porte sa propre taille", () => {
    // `traces.tsx` donne une hauteur à la sienne ; celle de `/carte` n'avait
    // aucune règle et vivait de ce que la grille de page lui prêtait.
    assert.match(CARTE, /className="carte__toile-hote"/);
    assert.match(
      STYLES,
      /\.carte__toile-hote \{[^}]*position: absolute;[^}]*inset: 0;/,
      "`.carte__toile-hote` doit remplir `.carte__map` par elle-même",
    );
  });
});
