import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cameraWebcamHd, fournisseurApercu, imageSkaping, imageWebcamHd, priseSkaping } from "./webcamApercu.ts";

describe("aperçu des webcams", () => {
  it("reconnaît les fournisseurs dont on lit l'aperçu, et eux seuls", () => {
    assert.equal(fournisseurApercu("https://www.skaping.com/les2alpes/grande-aiguille"), "skaping");
    assert.equal(fournisseurApercu("https://app.webcam-hd.com/lesarcs/mont-blanc"), "webcam-hd");
    assert.equal(fournisseurApercu("https://app.webcam-hd.com/lesarcs"), null);
    assert.equal(fournisseurApercu("https://www.viewsurf.com/univers/montagne/vue/123"), null);
  });

  it("lit l'image d'une page Skaping et sa date", () => {
    const html = `<head><meta property="og:image"                 content="https://skaping.s3.gra.io.cloud.ovh.net/les-2-alpes/les-cretes/2026/09/30/large/14-50.jpg" />
      <meta property="og:image:type" content="image/jpeg" /></head>`;
    const image = imageSkaping(html)!;
    assert.equal(image, "https://skaping.s3.gra.io.cloud.ovh.net/les-2-alpes/les-cretes/2026/09/30/large/14-50.jpg");
    assert.deepEqual(priseSkaping(image), { jour: "2026-09-30", heure: "14:50" });
    assert.equal(imageSkaping(`<meta property="og:image" content="{{ngMeta['image']}}">`), null);
    assert.equal(imageSkaping("<html></html>"), null);
  });

  it("lit la clé d'image d'une caméra Webcam-HD dans le fichier de son groupe", () => {
    assert.deepEqual(cameraWebcamHd("https://app.webcam-hd.com/lesarcs/varet"), { groupe: "lesarcs", camera: "varet" });
    const groupe = [
      { url_part_2: "varet", webcam_display_str_image: "les_arcs_catex" },
      { url_part_2: "arpette", webcam_display_str_image: "../x" },
    ];
    assert.equal(imageWebcamHd(groupe, "varet"), "https://www.trinum.com/ibox/ftpcam/les_arcs_catex.jpg");
    assert.equal(imageWebcamHd(groupe, "arpette"), null);
    assert.equal(imageWebcamHd(groupe, "absente"), null);
    assert.equal(imageWebcamHd({ erreur: 1 }, "varet"), null);
  });
});
