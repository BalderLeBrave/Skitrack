import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { skiinfoPhoto, skiinfoPhotoAsset, SKIINFO_PHOTOS } from "./skiinfo.ts";
import { STATIONS } from "./stations.ts";

describe("photos Skiinfo", () => {
  it("231 copies locales distinctes ; plus aucun hotlink", () => {
    const files = readdirSync("public/stations").filter((f) => f.endsWith(".jpg"));
    // 229 copies du relevé Skiinfo, plus les photos de Val d'Ese et de Haut
    // Asco, choisies par le propriétaire le 5 octobre 2026 (hors relevé).
    assert.equal(files.length, 231);
    // 230 stations en portent une : Le Grand Puy, fermé, est sorti du
    // référentiel le 30 septembre 2026 (`STATIONS_FERMEES`). Son fichier reste,
    // les photos étant sous verrou : il n'est plus montré.
    const photos = STATIONS.map((s) => s.photo).filter((p): p is string => p != null);
    assert.equal(photos.length, 230);
    assert.ok(!photos.includes("/stations/le-grand-puy.jpg"));
    assert.ok(photos.every((p) => p.startsWith("/stations/") && p.endsWith(".jpg")));
    assert.ok(photos.every((p) => !p.includes("bfldr") && !p.includes("onthesnow")));
    assert.equal(new Set(photos).size, 230);
    assert.equal(new Set(photos.map(skiinfoPhotoAsset)).size, 230);
    assert.equal(skiinfoPhoto("les-2-alpes"), "/stations/les-2-alpes.jpg");
    assert.ok(existsSync("public/stations/les-2-alpes.jpg"));
    const hashes = new Set(
      files.map((f) => readFileSync(`public/stations/${f}`).subarray(0, 64).toString("hex") + String(readFileSync(`public/stations/${f}`).length)),
    );
    assert.equal(hashes.size, 231);
  });

  it("relevé Skiinfo sans bandeau générique ; Larche et Chazelet sans fichier téléchargeable", () => {
    for (const [id, url] of Object.entries(SKIINFO_PHOTOS)) {
      assert.ok(url && url.startsWith("http"), id);
      assert.ok(!url.includes("resort_header"), id);
    }
    assert.equal(skiinfoPhoto("larche"), null);
    assert.equal(skiinfoPhoto("le-chazelet"), null);
    assert.equal(STATIONS.find((s) => s.id === "larche")!.photo, null);
  });
});
