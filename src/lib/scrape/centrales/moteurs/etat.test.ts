import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { etatDuMoteur } from "./etat.ts";

/**
 * Les sept valeurs de `MoteurCentrale`, recopiées à dessein.
 *
 * Un type ne se parcourt pas à l'exécution. Cette liste est donc la copie
 * manuelle de celle de `types.ts`, et ce test est là pour qu'ajouter un moteur
 * sans lui écrire de phrase se voie tout de suite : une centrale sans motif
 * affiche un zéro muet, qui se lit « rien de disponible ».
 */
const MOTEURS = [
  "Open System",
  "MSEM",
  "Ingénie",
  "Diffusio",
  "Deskline / Feratel",
  "Elloha",
  "Orchestra",
  "Arkiane",
  "iResa",
  "Resalys",
  "Tourinsoft",
  "aucun",
  "inconnu",
] as const;

describe("l'état d'un moteur se dit toujours", () => {
  it("chaque moteur a sa phrase, et elle tient debout seule", () => {
    for (const m of MOTEURS) {
      const phrase = etatDuMoteur(m);
      assert.ok(typeof phrase === "string" && phrase.length > 40, `${m} : « ${phrase} »`);
      assert.ok(phrase.trimEnd().endsWith("."), `${m} ne finit pas par un point`);
      // Pas de tiret cadratin dans les textes d'interface, et pas d'emoji ni de
      // glyphe Unicode en guise d'icône : ces phrases s'affichent telles quelles.
      assert.ok(!phrase.includes("—"), `${m} contient un tiret cadratin`);
      assert.ok(!/\p{Extended_Pictographic}/u.test(phrase), `${m} contient un pictogramme`);
    }
  });

  it("aucune phrase ne promet ce qu'elle ne tient pas", () => {
    // Le piège à éviter : écrire « autorisé » d'après la page d'accueil, alors
    // que le fichier porte un Disallow sur la recherche datée. Chaque phrase
    // doit parler de la recherche, pas de l'accueil. Un Disallow n'arrête
    // jamais l'extraction.
    for (const m of MOTEURS) {
      const phrase = etatDuMoteur(m).toLowerCase();
      if (phrase.includes("autorise") || phrase.includes("autorisent")) {
        assert.ok(
          /recherche|datée|datee/.test(phrase),
          `${m} parle d'autorisation sans dire de quel chemin`,
        );
      }
    }
  });
});
