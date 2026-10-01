import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FORFAIT_CATALOG } from "./catalog.ts";
import { SOURCES_TARIFS } from "./sourcesTarifs.ts";
import { STATIONS } from "../stations.ts";

describe("table des pages de tarifs", () => {
  it("identifiants uniques, adresses lisibles, lecteurs connus", () => {
    const ids = SOURCES_TARIFS.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const s of SOURCES_TARIFS) {
      assert.ok(s.pages.length, s.id);
      assert.ok(s.perimetres.length, s.id);
      for (const p of s.pages) {
        assert.doesNotThrow(() => new URL(p.url), `${s.id} : ${p.url}`);
        assert.ok(
          ["html", "navigateur", "pdf", "image"].includes(p.lecteur),
          `${s.id} : ${p.lecteur}`,
        );
      }
    }
  });

  it("chaque domaine cité existe au catalogue, chaque station au référentiel", () => {
    const slugs = new Set(FORFAIT_CATALOG.map((d) => d.slug));
    const stations = new Set(STATIONS.map((s) => s.id));
    for (const s of SOURCES_TARIFS) {
      for (const p of s.perimetres) {
        for (const slug of p.catalogue ?? [])
          assert.ok(slugs.has(slug), `${s.id} : domaine ${slug}`);
        for (const id of p.stations ?? []) assert.ok(stations.has(id), `${s.id} : station ${id}`);
        if (p.motif) assert.doesNotThrow(() => new RegExp(p.motif!), `${s.id} : motif ${p.motif}`);
      }
    }
  });

  it("chaque périmètre couvre au moins une station", () => {
    for (const s of SOURCES_TARIFS) {
      for (const p of s.perimetres)
        assert.ok((p.catalogue?.length ?? 0) + (p.stations?.length ?? 0) > 0, `${s.id} : ${p.nom}`);
    }
  });

  it("les motifs se lisent sur un texte plié : sans accent, en minuscules", () => {
    for (const s of SOURCES_TARIFS) {
      for (const p of s.perimetres)
        if (p.motif)
          assert.equal(
            p.motif,
            p.motif
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase(),
            `${s.id} : ${p.motif}`,
          );
    }
  });
});
