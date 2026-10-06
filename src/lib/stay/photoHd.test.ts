// Une adresse réelle par hôte, relevée dans les relevés et les fixtures du
// dépôt, avant et après. Les tailles servies ont été mesurées le 6 oct. 2026.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { photoGrande, photoTailles, photoVignette } from "./photoHd.ts";

const AIRBNB = "https://a0.muscache.com/im/pictures/prohost-api/Hosting-53145660/original/4d2bd112-822d-4e86-8a56-db2831eb1677.jpeg?im_w=720";
const AIRBNB_NU = "https://a0.muscache.com/im/pictures/miso/Hosting-27623894/original/f09c2e09-9c61-4a8a-a3a2-d7481a14b78e.jpeg";
const BOOKING = "https://q-xx.bstatic.com/xdata/images/hotel/max600/508835258.jpg?k=d239ab4cd4ca0e58daecc0c391eb1edb5d8cd0943e135e01c65864ccefa110fc&o=&a=1311119";
const VRBO = "https://media.vrbo.com/lodging/106000000/105490000/105488800/105488794/41111c6d.jpg?impolicy=resizecrop&rw=575&rh=575&ra=fill";
const TRVL = "https://images.trvl-media.com/lodging/106000000/105780000/105776400/105776384/fc31906d.jpg?impolicy=resizecrop&rw=575&rh=575&ra=fill";
const OVO = "https://ovo-img.imgix.net/image_library/1719-Dorealp/wm/1719-DOREALP_240314-5-JW..jpg?dpr=2&q=20&auto=format&ixlib=php-4.1.0&fit=crop&w=500&h=375";
const MAEVA = "https://static5.maeva.com/ws-photos/FRANCE/avoriaz/residences/residence-les-alpages---maeva-home/appartement-2-pieces-5-personnes---selection/5.jpeg?w=550&h=340&crop=1&nw=1";
const GITES = "https://www.gites-de-france.com/sites/default/files/styles/landscape_375_240/public/images/375882/375882-0_40102_c109e38976ae7b07a7efd2a037248d58.jpg?itok=SCRM7eVw";
const INGENIE = "https://reservation.legrandbornand.com/medias/images/prestations/multitailles/640x480_5917479-04_salle_a_manger_copie.jpg";
const MSEM = "https://images.msem.tech/production/lodging/CR-595-GRANDBOISB12/12275490-medium.jpg";
const SKIPLANET = "https://docs.ski-planet.com/photo/avoriaz/medium/snow-appartement-2-pieces-cabine-6-personnes-117-828-sejour-911893.jpg";
const MV = "https://www.madamevacances.com/photos/etab/14474/660x365/residence_alba_2_alpes_5p10_sejour2.jpg";
const MV_CHAMBRE = "https://www.madamevacances.com/photos/etab_room/11728/1000x1000/les_deux_alpes_au_coeur_des_ours_cuisine_2.jpg";
const ARKIANE = "https://reservationpralognan.locvacances.com/lv/images/lot/0000000194_01.jpg?20220823112034";

describe("photoGrande", () => {
  it("Airbnb : la largeur servie sans paramètre, 1 200 px au lieu de 720", () => {
    assert.equal(photoGrande(AIRBNB), AIRBNB.replace("im_w=720", "im_w=1200"));
    assert.equal(photoGrande(AIRBNB_NU), `${AIRBNB_NU}?im_w=1200`);
  });
  it("Booking : la plus grande taille, clé de signature gardée (600 → 911 px, l'original)", () => {
    assert.equal(photoGrande(BOOKING), BOOKING.replace("/max600/", "/max3000/"));
  });
  it("Abritel : l'original, sans recadrage carré (575 → 1 536 et 2 560 px)", () => {
    assert.equal(photoGrande(VRBO), "https://media.vrbo.com/lodging/106000000/105490000/105488800/105488794/41111c6d.jpg");
    assert.equal(photoGrande(TRVL), "https://images.trvl-media.com/lodging/106000000/105780000/105776400/105776384/fc31906d.jpg");
  });
  it("OVO : 2 400 px sans recadrage, sans agrandissement, qualité 75 au lieu de 20", () => {
    assert.equal(
      photoGrande(OVO),
      "https://ovo-img.imgix.net/image_library/1719-Dorealp/wm/1719-DOREALP_240314-5-JW..jpg?auto=format&fit=max&q=75&w=2400",
    );
  });
  it("Maeva : l'original (550 → 2 048 px)", () => {
    assert.equal(photoGrande(MAEVA), MAEVA.split("?")[0]);
  });
  it("Gîtes de France : l'image hors style Drupal (375 → 1 098 px)", () => {
    assert.equal(
      photoGrande(GITES),
      "https://www.gites-de-france.com/sites/default/files/images/375882/375882-0_40102_c109e38976ae7b07a7efd2a037248d58.jpg",
    );
  });
  it("Ingénie : l'image hors « multitailles » (640 → 1 448 px)", () => {
    assert.equal(photoGrande(INGENIE), "https://reservation.legrandbornand.com/medias/images/prestations/5917479-04_salle_a_manger_copie.jpg");
  });
  it("MSEM : l'image sans suffixe de taille (280 → 2 048 px)", () => {
    assert.equal(photoGrande(MSEM), "https://images.msem.tech/production/lodging/CR-595-GRANDBOISB12/12275490.jpg");
  });
  it("Ski Planet : le dossier « large » (801 → 1 131 px)", () => {
    assert.equal(photoGrande(SKIPLANET), SKIPLANET.replace("/medium/", "/large/"));
  });
  it("Madame Vacances : le format 1000x1000 (660 → 1 000 px)", () => {
    assert.equal(photoGrande(MV), MV.replace("/660x365/", "/1000x1000/"));
    assert.equal(photoGrande(MV_CHAMBRE), MV_CHAMBRE);
  });
  it("Arkiane : la photo pleine plutôt que la vignette « _s »", () => {
    const vignette = ARKIANE.replace("_01.jpg", "_01_s.jpg");
    assert.equal(photoGrande(vignette), ARKIANE);
    assert.equal(photoGrande(ARKIANE), ARKIANE);
  });
  it("une adresse inconnue ou déjà grande est rendue telle quelle", () => {
    for (const u of [
      "https://cimalpes.com/cache/photos/400/photos_bien_2096_d43_8154-modifier.jpg",
      "https://media.mountaincollection.com/residence/556/accommodation/2338/studio-residence-meijotel.jpeg",
      "https://images.greengo.voyage/canonical/accommmodation/ordered_images/beauregardenete_2.jpg",
      "https://resc.deskline.net/images/FRA/1/34966ba2-1d27-4b9a-b021-bbb0f085f9ef/BALMAZ_2.jpg",
      "https://img.for-system.com/grandes/push/OP/40821/Proprietaire/1/OP_958E7B0CAFD189FEC8AC86D99C80A25B.jpg",
      "https://www.alpissime.com/images_ann/3397/vignette-3397-1.P.jpg?r=1760957333",
      "pas une adresse",
    ]) {
      assert.equal(photoGrande(u), u);
      assert.equal(photoVignette(u), u);
    }
  });
});

describe("photoVignette", () => {
  it("une taille légère quand l'hôte en sert une", () => {
    assert.equal(photoVignette(AIRBNB), AIRBNB.replace("im_w=720", "im_w=240"));
    assert.equal(photoVignette(BOOKING), BOOKING.replace("/max600/", "/max300/"));
    assert.equal(
      photoVignette(OVO),
      "https://ovo-img.imgix.net/image_library/1719-Dorealp/wm/1719-DOREALP_240314-5-JW..jpg?auto=format&fit=crop&q=60&w=240&h=160",
    );
    assert.equal(photoVignette(MAEVA), `${MAEVA.split("?")[0]}?w=240&h=160&crop=1&nw=1`);
    assert.equal(photoVignette(INGENIE), INGENIE.replace("640x480_", "320x240_"));
    assert.equal(photoVignette(SKIPLANET), SKIPLANET.replace("/medium/", "/small/"));
    assert.equal(photoVignette(MV), MV.replace("/660x365/", "/160x90/"));
    assert.equal(photoVignette(ARKIANE), ARKIANE.replace("_01.jpg", "_01_s.jpg"));
    // Travelski : la photo relevée est déjà la plus grande (800 px) ; la vignette, 320 px.
    const ts = "https://d1wek41qnoimq7.cloudfront.net/product/8493/910555/O/pierre-vacances-residence-atria-crozats-da5a0158.jpg";
    assert.equal(photoVignette(ts), ts.replace("/O/", "/S/"));
    assert.equal(photoGrande(ts), ts);
  });
  it("garde l'adresse relevée quand elle est déjà légère", () => {
    assert.equal(photoVignette(VRBO), VRBO);
    assert.equal(photoVignette(MSEM), MSEM);
    assert.equal(photoVignette(GITES), GITES);
  });
});

describe("photoTailles", () => {
  it("Airbnb : 720 et 1 200 px, à largeur connue", () => {
    const t = photoTailles(AIRBNB);
    assert.equal(t.src, photoGrande(AIRBNB));
    assert.equal(t.srcset, `${AIRBNB.replace("im_w=720", "im_w=720")} 720w, ${AIRBNB.replace("im_w=720", "im_w=1200")} 1200w`);
  });
  it("OVO : de 800 à 2 400 px", () => {
    assert.match(photoTailles(OVO).srcset ?? "", /w=800 800w, .*w=2400 2400w$/);
  });
  it("une seule taille ailleurs", () => {
    assert.deepEqual(photoTailles(MSEM), { src: photoGrande(MSEM), srcset: null });
  });
});
