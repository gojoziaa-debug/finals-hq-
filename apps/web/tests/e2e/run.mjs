/**
 * Parcours de bout en bout sur le site lancé (next start) avec une base chargée par le worker.
 *   BASE_URL=http://localhost:3000 node tests/e2e/run.mjs
 * Utilise le Playwright installé sur la machine et axe-core pour l'accessibilité. Captures dans tests/e2e/out/.
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
mkdirSync(out, { recursive: true });
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const failures = [];
const check = (ok, label) => {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failures.push(label);
};

async function axe(page, label) {
  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(async () => {
    // @ts-ignore
    const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return r.violations.map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
  });
  check(result.length === 0, `axe ${label}${result.length ? `\n    ${result.join("\n    ")}` : ""}`);
}

const browser = await chromium.launch();
const errors = [];

async function newPage(context) {
  const page = await context.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(`${page.url()} ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${page.url()} ${e.message}`));
  return page;
}

// Téléphone, thème sombre par défaut.
const phone = await browser.newContext({ ...devices["Pixel 7"], colorScheme: "dark" });
let page = await newPage(phone);

await page.goto(`${BASE}/fr`);
check(page.url().endsWith("/fr"), "accueil en /fr");
check((await page.locator("ol li").count()) === 10, "top 10 sur l'accueil");
await page.screenshot({ path: join(out, "1-accueil-telephone.png"), fullPage: true });
await axe(page, "accueil (sombre)");

await page.goto(`${BASE}/fr/leaderboards/s12/ranked`);
const firstRows = await page.locator("tbody tr[data-index]").count();
check(firstRows > 10, `classement rendu côté serveur (${firstRows} lignes)`);
await page.waitForFunction(() => !document.body.innerText.includes("Chargement des"), null, { timeout: 15_000 });
await page.screenshot({ path: join(out, "2-classement-telephone.png") });
check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "aucun défilement horizontal de la page");
await axe(page, "classement (sombre)");

// Défilement jusqu'à la ligne 10 000 : la liste virtualisée garde peu de lignes dans le DOM.
const scroller = page.locator("div.overflow-auto").first();
const t0 = Date.now();
await scroller.evaluate((el) => (el.scrollTop = el.scrollHeight));
await page.waitForTimeout(300);
const lastRank = await page.locator("tbody tr[data-index]").last().locator("td").first().innerText();
check(lastRank.replace(/\D/g, "") === "10000", `dernière ligne = 10 000 (lu : ${lastRank}, ${Date.now() - t0} ms)`);
const domRows = await page.locator("tbody tr[data-index]").count();
check(domRows < 80, `virtualisation : ${domRows} lignes dans le DOM`);

// Ligne top 500 et raccourci.
await scroller.evaluate((el) => (el.scrollTop = 0));
await page.waitForTimeout(200);
await page.getByRole("button", { name: "Ligne top 500" }).click();
await page.waitForTimeout(300);
check(await page.getByText("ligne top 500", { exact: true }).isVisible(), "repère de la ligne top 500 visible");
await page.screenshot({ path: join(out, "3-ligne-top500-telephone.png") });

// Filtre de ligue + tri : l'URL se partage.
await page.selectOption("select >> nth=1", { label: "Diamond 1" }).catch(async () => page.locator("select").last().selectOption({ label: "Diamond 1" }));
await page.getByRole("button", { name: /Trier par 24 h/ }).click();
await page.waitForTimeout(200);
const url = new URL(page.url());
check(url.searchParams.get("league") === "d1" && url.searchParams.get("sort") === "change24h", `URL partageable : ${url.search}`);
await page.goto(page.url());
await page.waitForFunction(() => !document.body.innerText.includes("Chargement des"), null, { timeout: 15_000 });
await page.waitForTimeout(300);
const badges = await page.locator("tbody tr[data-index] td:nth-child(2) span[title]").allInnerTexts();
check(badges.length > 0 && badges.every((b) => b.includes("D1")), `filtre rechargé depuis l'URL (${badges.length} lignes D1)`);
check(await page.getByText(/sur 10 000/).isVisible(), "compteur filtré « N sur 10 000 »");
await page.screenshot({ path: join(out, "4-filtre-diamond1-telephone.png") });

// Feuille de filtres (dialog natif).
await page.getByRole("button", { name: /Filtres/ }).click();
await page.getByRole("dialog").getByPlaceholder("Filtrer par pseudo").fill("a");
await page.screenshot({ path: join(out, "5-feuille-filtres-telephone.png") });
await page.getByRole("button", { name: "Voir les résultats" }).click();

// Recherche (page sans JavaScript côté serveur).
await page.goto(`${BASE}/fr/search?q=GOJO%236255`);
check(await page.getByRole("link", { name: /GOJO#6255/ }).first().isVisible(), "recherche serveur trouve GOJO#6255");
await page.getByRole("link", { name: /GOJO#6255/ }).first().click();
await page.waitForURL(/players\/GOJO-6255/);
check(await page.getByRole("heading", { name: /GOJO#6255/ }).isVisible(), "profil minimal ouvert depuis la recherche");
await page.screenshot({ path: join(out, "6-profil-minimal-telephone.png"), fullPage: true });
await axe(page, "profil");

await page.goto(`${BASE}/fr/status`);
check(await page.getByRole("heading", { name: "État des données" }).isVisible(), "page d'état");
await page.screenshot({ path: join(out, "7-etat-telephone.png"), fullPage: true });
await axe(page, "état");

// Archive : pas de colonnes 24 h / 7 j.
await page.goto(`${BASE}/en/leaderboards/s5/ranked`);
check((await page.getByRole("columnheader", { name: /24h/ }).count()) === 0, "archive S5 sans colonnes de variation");
check(await page.getByText(/Season over/).isVisible(), "bandeau saison terminée (EN)");
await page.screenshot({ path: join(out, "8-archive-s5-en-telephone.png") });

// Thème clair.
await page.goto(`${BASE}/fr/leaderboards/s12/ranked`);
await page.getByRole("button", { name: "Thème clair" }).click();
check(!(await page.evaluate(() => document.documentElement.classList.contains("dark"))), "bascule vers le thème clair");
await page.reload();
check(!(await page.evaluate(() => document.documentElement.classList.contains("dark"))), "thème clair mémorisé au rechargement");
await page.screenshot({ path: join(out, "9-classement-clair-telephone.png") });
await axe(page, "classement (clair)");

// Ordinateur : palette ⌘K.
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark", deviceScaleFactor: 1 });
page = await newPage(desktop);
await page.goto(`${BASE}/fr/leaderboards/s12/ranked`);
await page.waitForFunction(() => !document.body.innerText.includes("Chargement des"), null, { timeout: 15_000 });
await page.screenshot({ path: join(out, "10-classement-ordinateur.png") });
await page.keyboard.press("Control+k");
await page.getByPlaceholder("Pseudo, ancien pseudo…").fill("gojo#62");
await page.getByRole("option", { name: /GOJO#6255/ }).waitFor({ timeout: 5000 });
await page.screenshot({ path: join(out, "11-palette-recherche.png") });
await page.keyboard.press("Enter");
await page.waitForURL(/players\/GOJO-6255/);
check(true, "palette ⌘K → profil au clavier");
await page.goto(`${BASE}/en`);
await page.screenshot({ path: join(out, "12-accueil-ordinateur-en.png"), fullPage: true });

check(errors.length === 0, `aucune erreur console${errors.length ? `\n    ${errors.slice(0, 5).join("\n    ")}` : ""}`);
await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} échec(s)`);
  process.exit(1);
}
console.log("\nTout est passé.");
