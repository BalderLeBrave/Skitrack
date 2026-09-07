/** Recompute ITEA total with 8 personnes AFTER dates (exercice 2027). */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const SHELL =
  "/opt/pw-browsers/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const WIDGET =
  "https://widget-fngf.itea.fr/fiche-38G20200.html?WIDGET=RESAFNGF&KEY=FNGF-00M562O4&LANGUE=FR&NUMGITE=38G20200";

async function main() {
  const b = await chromium.launch({
    executablePath: SHELL,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const ctx = await b.newContext({ userAgent: UA, locale: "fr-FR", timezoneId: "Europe/Paris" });
  const page = await ctx.newPage();
  const xhr = [];
  page.on("request", (req) => {
    if (req.resourceType() === "xhr" || req.resourceType() === "fetch") {
      xhr.push({ url: req.url().slice(0, 180), post: (req.postData() || "").slice(0, 400) });
    }
  });
  await page.goto(WIDGET, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    window.setInputDateDeb("06/02/2027");
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    window.setInputDateFin("13/02/2027");
  });
  await page.waitForTimeout(4000);
  const mid = await page.evaluate(() => ({
    total: document.querySelector(".sp_montantPrixTotal")?.getAttribute("data-prix"),
    text: document.querySelector(".sp_montantPrixTotal")?.textContent,
    cap: document.querySelector("#formule_selectCapacite")?.value,
  }));
  await page.selectOption("#formule_selectCapacite", "8");
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    if (typeof window.changeCapacitePourFormule === "function") window.changeCapacitePourFormule();
    if (typeof window.lanceCalculPrixSejour === "function") window.lanceCalculPrixSejour();
    if (typeof window.getTabPrixFormulesSejour === "function") window.getTabPrixFormulesSejour();
  });
  await page.waitForTimeout(5000);
  const after = await page.evaluate(() => ({
    total: document.querySelector(".sp_montantPrixTotal")?.getAttribute("data-prix"),
    text: document.querySelector(".tarifFicheApartirDe")?.innerText?.replace(/\s+/g, " ").trim().slice(0, 500),
    cap: document.querySelector("#formule_selectCapacite")?.value,
    html: document.querySelector(".tarifFicheApartirDe")?.innerHTML?.slice(0, 800),
  }));
  const out = { mid, after, posts: xhr.map((x) => x.post).filter((p) => /nbAdultes|getHTML/.test(p)) };
  writeFileSync("/tmp/skitrack/docs/diagnostics/dumps/gites-itea-8p.json", JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await b.close();
}
main();
