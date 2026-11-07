/**
 * Parcours de bout en bout sur le site lancé (next start) avec une base chargée par le worker.
 *   BASE_URL=http://localhost:3000 node tests/e2e/run.mjs
 * Utilise le Playwright installé sur la machine et axe-core pour l'accessibilité. Captures dans tests/e2e/out/.
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
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
check(await page.getByRole("heading", { name: /GOJO#6255/ }).isVisible(), "profil ouvert depuis la recherche");
await page.locator("#chart-title").waitFor();
await page.waitForTimeout(1200); // ECharts chargé à la demande
await page.screenshot({ path: join(out, "6-profil-telephone.png"), fullPage: true });
await axe(page, "profil (vue d'ensemble)");
check(await page.locator("#panel-career").isHidden(), "onglet Carrière fermé par défaut");
await page.getByRole("tab", { name: /Carrière/ }).click();
check(page.url().endsWith("#career") && (await page.locator("#panel-career").isVisible()), "onglet Carrière ouvert, ancre #career");
await page.screenshot({ path: join(out, "6b-profil-carriere-telephone.png"), fullPage: true });
await axe(page, "profil (carrière)");
await page.getByRole("tab", { name: /Vue d'ensemble/ }).click();
await page.getByRole("button", { name: "Suivre" }).first().click();
check((await page.getByRole("button", { name: "Suivi" }).count()) >= 1, "bouton Suivre → Suivi");
await page.getByRole("link", { name: "Suivi" }).last().click();
await page.waitForURL(/following/);
await page.getByRole("link", { name: /GOJO#6255/ }).waitFor({ timeout: 10_000 });
const followedRank = await page.locator("tbody tr").first().locator("td").first().filter({ hasText: /n°/ }).waitFor({ timeout: 10_000 }).then(() => true, async () => {
  console.log(await page.locator("main").innerText());
  return false;
});
check(followedRank, "page Suivi : GOJO#6255 avec son rang");
await page.screenshot({ path: join(out, "6c-suivi-telephone.png"), fullPage: true });
await axe(page, "suivi");

// Critère du sprint 3 : cinq joueurs au hasard dans trois ligues, rang et RS identiques au classement (aucune donnée inventée).
const board = await (await page.request.get(`${BASE}/api/boards/1500`)).json();
const byTier = { platinumLow: [], platinumHigh: [], diamond: [] };
board.rows.name.forEach((name, i) => {
  if (!name) return;
  const lg = board.rows.league[i];
  const key = lg >= 17 ? "diamond" : lg >= 15 ? "platinumHigh" : "platinumLow";
  byTier[key].push(i);
});
const picks = [...byTier.diamond.sort(() => Math.random() - 0.5).slice(0, 2), ...byTier.platinumHigh.sort(() => Math.random() - 0.5).slice(0, 2), ...byTier.platinumLow.sort(() => Math.random() - 0.5).slice(0, 1)];
for (const i of picks) {
  const name = board.rows.name[i];
  const m = /^(.*)#(\d{4})$/.exec(name);
  const slug = encodeURIComponent(m ? `${m[1]}-${m[2]}` : name);
  const res = await page.goto(`${BASE}/fr/players/${slug}`);
  const text = await page.locator("main header").first().innerText();
  const rank = `n° ${board.rows.rank[i].toLocaleString("fr-FR").replace(/[\u00a0\u202f ]/g, "\u202f")}`;
  const score = board.rows.score[i].toLocaleString("fr-FR").replace(/[\u00a0\u202f ]/g, "\u202f");
  const norm = (x) => x.replace(/[\u00a0\u202f ]/g, "\u202f");
  check(res.status() === 200 && norm(text).includes(norm(rank)) && norm(text).includes(norm(score)), `profil ${name} (ligue ${board.rows.league[i]}) : ${rank}, ${score} RS comme au classement`);
}

// Hors du top 10 000 et inconnu.
await page.goto(`${BASE}/fr/players/Personne-0000`);
check(await page.getByText("Joueur introuvable").isVisible(), "profil inconnu : état « introuvable »");

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

// Sprint 4 : ligne top 500, clubs, comparaison, progressions (téléphone).
page = await newPage(phone);
await page.goto(`${BASE}/fr/top-500`);
const line = await page.locator("text=RS du 500e").first().isVisible();
check(line, "ligne top 500 : RS du 500e affiché");
const around500 = await page.locator("li", { hasText: "n° 500" }).count();
check(around500 >= 1, "ligne top 500 : le 500e est dans « autour de la ligne »");
await axe(page, "ligne top 500");
await page.goto(`${BASE}/fr/clubs`);
const firstClub = page.locator("tbody tr a[href*='/clubs/']").first();
const firstTag = (await firstClub.innerText()).split("\n")[0];
const members = Number((await page.locator("tbody tr").first().locator("td").nth(2).innerText()).trim());
await axe(page, "clubs");
await firstClub.click();
await page.waitForURL(/\/clubs\/[^?]+$/);
const listed = await page.locator("tbody tr").count();
check(listed === members && members > 0, `club ${firstTag} : ${listed} membres classés listés (classement des clubs : ${members})`);
await axe(page, "page club");
await page.goto(`${BASE}/fr/compare?p=GOJO-6255,EkaZo-5318`);
check((await page.locator("text=Écart au top 500").count()) > 0, "comparaison partagée par URL : deux joueurs chargés");
await axe(page, "comparaison");
await page.goto(`${BASE}/fr/players/GOJO-6255`);
await page.getByRole("link", { name: "Comparer" }).first().click();
await page.waitForURL(/compare\?p=GOJO-6255/);
check(true, "bouton Comparer du profil → /compare?p=GOJO-6255");
await page.goto(`${BASE}/fr/movers?dir=down`);
check((await page.locator("ol li").count()) > 0, "plus grosses chutes sur 24 h listées");
await axe(page, "progressions");


// Sprint 6 : budget JavaScript, cartes de partage, SEO, pages légales, masquage de bout en bout.
page = await newPage(phone);
for (const [path, budget] of [["/fr", 150], ["/fr/leaderboards/s12/ranked", 150], ["/fr/players/GOJO-6255", 150]]) {
  await page.goto(`${BASE}${path}`, { waitUntil: "load" });
  const kb = await page.evaluate(() => Math.round(performance.getEntriesByType("resource").filter((e) => e.initiatorType === "script").reduce((s, e) => s + e.encodedBodySize, 0) / 1024));
  check(kb <= budget, `budget JavaScript ${path} : ${kb} Ko (≤ ${budget} Ko compressés)`);
}
const pngSize = (buf) => [buf.readUInt32BE(16), buf.readUInt32BE(20)];
await page.goto(`${BASE}/fr/players/GOJO-6255`);
const ogUrl = await page.locator('meta[property="og:image"]').getAttribute("content");
check(Boolean(ogUrl?.includes("/api/og/player/GOJO-6255")), `profil : balise og:image (${ogUrl})`);
check((await page.locator('meta[name="twitter:card"]').getAttribute("content")) === "summary_large_image", "profil : carte X grand format");
check((await page.locator('link[rel="alternate"][hreflang="x-default"]').count()) === 1, "profil : hreflang x-default");
const og = await page.request.get(ogUrl.replace(/^https?:\/\/[^/]+/, BASE));
const ogBuf = await og.body();
check(og.headers()["content-type"] === "image/png" && pngSize(ogBuf).join("×") === "1200×630" && /s-maxage=600/.test(og.headers()["cache-control"] ?? ""), `carte du profil : PNG ${pngSize(ogBuf).join("×")}, cache ${og.headers()["cache-control"]}`);
const story = await (await page.request.get(`${BASE}/api/og/player/GOJO-6255?l=fr&f=story`)).body();
check(pngSize(story).join("×") === "1080×1920", "story du profil : PNG 1080×1920");
check((await page.getByRole("button", { name: /Story/ }).count()) >= 1, "bouton Story sur le profil");
const club = await (await page.request.get(`${BASE}/api/og/club/${encodeURIComponent(firstTag)}?l=fr`)).body();
check(pngSize(club).join("×") === "1200×630", `carte du club ${firstTag}`);
const cmp = await page.request.get(`${BASE}/api/og/compare?p=GOJO-6255,EkaZo-5318&l=en`);
check(cmp.ok() && pngSize(await cmp.body()).join("×") === "1200×630", "carte de comparaison");
await page.getByRole("link", { name: /C'est ton profil/ }).click();
await page.waitForURL(/privacy\/request\?player=GOJO-6255/);
const prefilled = await page.waitForFunction(() => document.querySelector("input[name=player]")?.value === "GOJO#6255", null, { timeout: 5000 }).then(() => true, () => false);
check(prefilled, "lien « masquer » du profil : formulaire prérempli");

const robots = await (await page.request.get(`${BASE}/robots.txt`)).text();
check(/Allow: \/api\/og\//.test(robots), "robots.txt : cartes de partage accessibles");
const sitemap = await (await page.request.get(`${BASE}/sitemaps/players.xml`)).text();
const urls = (sitemap.match(/<url>/g) ?? []).length;
check(urls >= 2 && sitemap.includes("/fr/players/GOJO-6255") && sitemap.includes('hreflang="en"'), `sitemap des joueurs : ${urls} URL avec hreflang`);
check((await page.request.get(`${BASE}/sitemap.xml`)).ok(), "index des sitemaps");

for (const [path, heading] of [["/fr/privacy", "Confidentialité"], ["/en/privacy", "Privacy"], ["/fr/legal", "Mentions légales"], ["/fr/about", "À propos"], ["/fr/privacy/request", "Masquer mon profil"]]) {
  await page.goto(`${BASE}${path}`);
  check(await page.getByRole("heading", { level: 1, name: heading }).isVisible(), `page ${path}`);
  await axe(page, path);
}
await page.screenshot({ path: join(out, "13-masquage-telephone.png"), fullPage: true });
await page.goto(`${BASE}/fr/privacy`);
await page.screenshot({ path: join(out, "14-confidentialite-telephone.png"), fullPage: true });
check((await page.locator("footer").getByRole("link", { name: "Masquer mon profil" }).count()) === 1, "pied de page : lien de masquage");

// Masquage : demande → worker → le pseudo disparaît de la recherche (pas de cache côté serveur).
if (process.env.DATABASE_URL) {
  const target = board.rows.name.find((n, i) => n && i > 2000 && /#\d{4}$/.test(n) && !/^GOJO/.test(n));
  await page.goto(`${BASE}/fr/privacy/request`);
  await page.getByLabel(/Ton pseudo Embark/).fill(target);
  await page.getByLabel(/Comment te répondre/).fill("e2e@example.com");
  await page.getByRole("button", { name: "Envoyer la demande" }).click();
  await page.locator("form [role=alert]").waitFor({ timeout: 10_000 });
  check((await page.locator("form [role=alert]").innerText()).includes("Coche la case"), "formulaire : refusé sans la case « je suis ce joueur »");
  await page.getByLabel(/Je suis ce joueur/).check();
  await page.getByRole("button", { name: "Envoyer la demande" }).click();
  await page.getByText(/Demande reçue pour/).waitFor({ timeout: 10_000 });
  check(true, `formulaire : demande reçue pour ${target}`);
  await page.screenshot({ path: join(out, "15-demande-recue-telephone.png") });
  const worker = (...args) => execFileSync("pnpm", ["-s", "--filter", "@finals-hq/worker", "worker", "privacy", ...args], { cwd: join(here, "../../../.."), env: process.env, encoding: "utf8" });
  check(worker("list").includes(target), "worker privacy list : demande en attente, contact masqué");
  worker("apply", target, "--reason", "test e2e");
  const found = await (await page.request.get(`${BASE}/api/search?q=${encodeURIComponent(target)}`)).json();
  check(!found.results.some((r) => r.name === target), `après application : ${target} absent de la recherche`);
  worker("lift", target);
  execFileSync("psql", [process.env.DATABASE_URL, "-qc", "DELETE FROM hidden_profiles WHERE reason = 'test e2e'"]);
}

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
