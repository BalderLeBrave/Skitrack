import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseBulletin } from "./parse.ts";

const XML = `
<?xml version="1.0" encoding="UTF-8"?>
<BULLETIN>
  <CARTOUCHERISQUE RISQUE1="3" RISQUE2="2" RISQUEMAXI="3"
    LOC1="au-dessus de 2200 m" LOC2="en dessous" ALTITUDE="2200"
    DATEBULLETIN="2026-02-06T16:00:00" />
</BULLETIN>
`;

const CLOSED = `<message><![CDATA[La saison est terminée sur le massif Oisans.]]></message>`;

describe("parseBulletin", () => {
  it("lit la fixture Oisans", () => {
    const oisans = parseBulletin(15, XML);
    assert.equal(oisans.ok, true);
    assert.equal(oisans.massifCode, 15);
    assert.equal(oisans.risk, 3);
    assert.equal(oisans.risk1, 3);
    assert.equal(oisans.risk2, 2);
    assert.equal(oisans.altitude, 2200);
    assert.equal(oisans.issuedAt, "2026-02-06T16:00:00");
    assert.equal(oisans.error, null);
    assert.equal(oisans.source, "meteofrance");
  });

  it("hors saison : ok sans risque inventé", () => {
    const closed = parseBulletin(15, CLOSED);
    assert.equal(closed.ok, true);
    assert.equal(closed.risk, null);
    assert.ok((closed.message ?? "").includes("saison"));
  });

  it("illisible : pas de niveau inventé", () => {
    const garbage = parseBulletin(15, "<html>nope</html>");
    assert.equal(garbage.ok, false);
    assert.equal(garbage.risk, null);
    assert.ok((garbage.error ?? "").length > 0);
  });
});
