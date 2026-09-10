/** Témoin Skiinfo = mix affiché. */
import { classicCount, displayPct, scaleKm } from "./pistes.ts";
import { SKIINFO } from "./skiinfo.ts";
import { STATIONS } from "./stations.ts";

function main() {
  console.log("slug | n Skiinfo/app | km | % V/B/R/N Skiinfo | % app | quality | verdict");
  for (const s of STATIONS) {
    const w = SKIINFO[s.id];
    const n = classicCount(s.slopes.counts);
    const pct = `${displayPct(s.slopes, "green")}/${displayPct(s.slopes, "blue")}/${displayPct(s.slopes, "red")}/${displayPct(s.slopes, "black")}`;
    const match =
      w &&
      n === (w.n ?? 0) &&
      s.slopes.announcedKm === (w.km ?? 0) &&
      displayPct(s.slopes, "green") === w.pct.green &&
      displayPct(s.slopes, "blue") === w.pct.blue &&
      displayPct(s.slopes, "red") === w.pct.red &&
      displayPct(s.slopes, "black") === w.pct.black &&
      scaleKm(s.slopes).total === (w.km ?? 0);
    console.log(
      [
        s.id,
        `${w?.n ?? "—"}/${n}`,
        `${w?.km ?? "—"}/${s.slopes.announcedKm}`,
        w ? `${w.pct.green}/${w.pct.blue}/${w.pct.red}/${w.pct.black}` : "—",
        pct,
        s.slopes.quality,
        match ? "ok" : "ecart",
      ].join(" | "),
    );
  }
}

main();
