/* S1 — Appli instantanée : ouverture sans réseau, mise à jour proposée, polices sur place, raccourcis, partage reçu */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { RACINE, verifier, bilan } from './outil.mjs';

/* Serveur de test : sert le dépôt, avec un délai réglable et des fichiers remplaçables (simule un déploiement) */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const reglage = { delai: 0, remplace: {}, coupe: false }; // coupe : le serveur raccroche (vraie coupure réseau, y compris pour le service worker)
const srv = createServer((req, res) => {
  if (reglage.coupe) return req.socket.destroy();
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const fichier = path.join(RACINE, p === '/' ? 'index.html' : p);
  const servir = () => {
    if (reglage.remplace[p] !== undefined) { res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'text/plain', 'Cache-Control': 'no-cache' }); return res.end(reglage.remplace[p]); }
    if (!fichier.startsWith(RACINE) || !existsSync(fichier) || !statSync(fichier).isFile()) { res.writeHead(404); return res.end('absent'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(fichier)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(readFileSync(fichier));
  };
  reglage.delai ? setTimeout(servir, reglage.delai) : servir();
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}/`;

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const nouveauContexte = async (opts = {}) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR', timezoneId: 'Europe/Paris', hasTouch: true, isMobile: true, ...opts });
  const externes = [];
  ctx.on('request', r => { if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) externes.push(r.url()); });
  const p = await ctx.newPage();
  const erreurs = [];
  p.on('pageerror', e => erreurs.push(String(e.message || e)));
  /* Le service worker ne s'enregistre sous automate que sur demande (les autres tests restent sans) */
  await p.goto(base + 'index.html#vide', { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => localStorage.setItem('kgd-sw', '1'));
  return { ctx, p, erreurs, externes };
};
const pretSW = p => p.evaluate(async () => { await navigator.serviceWorker.ready; for (let i = 0; i < 50 && !navigator.serviceWorker.controller; i++) await new Promise(r => setTimeout(r, 100)); return !!navigator.serviceWorker.controller; });
const dcl = p => p.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return Math.round(n.domContentLoadedEventEnd - n.startTime); });

/* 1. Deuxième visite avec un serveur qui met 8 s à répondre : la page vient du cache en moins d'une seconde */
{
  const { ctx, p, erreurs, externes } = await nouveauContexte();
  await p.goto(base + '#dashboard', { waitUntil: 'load' });
  verifier('Service worker actif et aux commandes', await pretSW(p));
  reglage.delai = 8000;
  await p.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
  const t = await dcl(p);
  verifier(`Serveur à 8 s : DOMContentLoaded en ${t} ms (< 1 000)`, t < 1000, String(t));
  verifier('Accueil affiché', await p.evaluate(() => !!document.querySelector('#main h1, #main .noter-bar')));
  reglage.delai = 0;
  /* Polices : rien chez Google, Sora 600 disponible */
  const polices = await p.evaluate(async () => { await document.fonts.ready; await document.fonts.load('600 16px Sora'); await document.fonts.load('400 16px Inter'); return { sora: document.fonts.check('600 16px Sora'), inter: document.fonts.check('400 16px Inter'), chargees: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight) }; });
  verifier('Aucune requête vers fonts.googleapis.com ni fonts.gstatic.com', externes.length === 0, externes.join(' '));
  verifier('Sora 600 et Inter 400 chargées depuis le site', polices.sora && polices.inter && polices.chargees.some(x => /Sora 600/.test(x)), JSON.stringify(polices));
  /* Hors ligne : rechargement → accueil ; une image absente → erreur réseau, pas de page cassée.
     setOffline ne coupe pas le réseau du service worker : le serveur raccroche en plus. */
  await ctx.setOffline(true); reglage.coupe = true;
  await p.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
  await p.waitForTimeout(300);
  const hl = await p.evaluate(async () => {
    let img;
    try { const r = await fetch('/inexistant.png'); img = 'réponse ' + r.status; } catch (e) { img = 'erreur ' + e.name; }
    return { accueil: !!document.querySelector('#main .noter-bar'), img, pastille: (() => { const x = document.querySelector('#hors-ligne'); return x && !x.hidden ? x.textContent : ''; })() };
  });
  verifier('Hors ligne : le rechargement affiche l\'accueil', hl.accueil, JSON.stringify(hl));
  verifier('Hors ligne : /inexistant.png → erreur réseau', hl.img === 'erreur TypeError', hl.img);
  verifier('Hors ligne : pastille « Hors ligne · tout reste enregistré sur le téléphone »', /Hors ligne · tout reste enregistré sur le téléphone/.test(hl.pastille), hl.pastille);
  await ctx.setOffline(false); reglage.coupe = false;
  await p.evaluate(() => window.dispatchEvent(new Event('online')));
  verifier('De retour en ligne : pastille retirée', await p.evaluate(() => { const x = document.querySelector('#hors-ligne'); return !x || x.hidden; }));
  /* Une page inconnue hors ligne retombe sur l'accueil */
  await ctx.setOffline(true); reglage.coupe = true;
  await p.goto(base + 'une-page-inconnue', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  verifier('Hors ligne : une adresse inconnue ouvre l\'accueil', await p.evaluate(() => !!document.querySelector('#main .noter-bar')).catch(() => false));
  await ctx.setOffline(false); reglage.coupe = false;
  verifier('Pas d\'erreur JS (1)', erreurs.length === 0, erreurs.join(' | '));
  await ctx.close();
}

/* 2. Nouveau déploiement pendant que la page est ouverte : toast « Nouvelle version prête », jamais pendant Noter */
{
  const { ctx, p, erreurs } = await nouveauContexte();
  await p.goto(base + '#dashboard', { waitUntil: 'load' });
  await pretSW(p);
  await p.evaluate(() => { window.__marque = 1; });
  const sw = readFileSync(path.join(RACINE, 'sw.js'), 'utf8');
  reglage.remplace['/sw.js'] = sw.replace(/const VERSION = '[^']+'/, "const VERSION = 'kgd-essai-nouvelle'");
  reglage.remplace['/app.js'] = readFileSync(path.join(RACINE, 'app.js'), 'utf8') + '\n/* nouvelle version */\n';
  /* Noter ouvert : la question attend */
  await p.evaluate(() => { openContact(); });
  await p.waitForTimeout(200);
  const retour = () => p.evaluate(() => { let etat = 'hidden'; Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => etat }); document.dispatchEvent(new Event('visibilitychange')); etat = 'visible'; document.dispatchEvent(new Event('visibilitychange')); });
  await retour();
  await p.waitForFunction(() => swReg && swReg.waiting, null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(500);
  const pendant = await p.evaluate(() => ({ attente: !!(swReg && swReg.waiting), toast: document.querySelector('#toast').classList.contains('show') && /Nouvelle version/.test(document.querySelector('#toast').textContent), marque: window.__marque, noter: !document.querySelector('#rencontre').hidden }));
  verifier('Nouvelle version téléchargée et en attente', pendant.attente, JSON.stringify(pendant));
  verifier('Pendant Noter : pas de toast, pas de rechargement', !pendant.toast && pendant.marque === 1 && pendant.noter, JSON.stringify(pendant));
  /* Noter refermé : le toast arrive */
  await p.evaluate(() => fermerRencontre(true));
  await p.waitForFunction(() => document.querySelector('#toast').classList.contains('show') && /Nouvelle version prête/.test(document.querySelector('#toast').textContent), null, { timeout: 6000 }).catch(() => {});
  const apres = await p.evaluate(() => ({ txt: document.querySelector('#toast').textContent, vu: document.querySelector('#toast').classList.contains('show'), marque: window.__marque }));
  verifier('Noter refermé : toast « Nouvelle version prête · Recharger »', apres.vu && /Nouvelle version prête/.test(apres.txt) && /Recharger/.test(apres.txt) && apres.marque === 1, JSON.stringify(apres));
  await p.waitForTimeout(9000);
  verifier('Le toast reste affiché (pas de délai)', await p.evaluate(() => document.querySelector('#toast').classList.contains('show')));
  /* Recharger : la nouvelle version prend la main, un seul rechargement */
  await Promise.all([p.waitForNavigation({ timeout: 15000 }).catch(() => null), p.click('#toast .toast-action')]);
  await p.waitForTimeout(800);
  const fin = await p.evaluate(async () => ({ marque: window.__marque, version: await caches.keys() }));
  verifier('« Recharger » : page rechargée sur la nouvelle version', fin.marque === undefined && fin.version.includes('kgd-essai-nouvelle'), JSON.stringify(fin));
  reglage.remplace = {};
  verifier('Pas d\'erreur JS (2)', erreurs.length === 0, erreurs.join(' | '));
  await ctx.close();
}

/* 3. Manifeste, icône maskable, theme-color, partage reçu */
{
  const { ctx, p, erreurs } = await nouveauContexte({ colorScheme: 'light' });
  const m = await (await fetch(base + 'manifest.json')).json();
  const mask = (m.icons || []).filter(i => /maskable/.test(i.purpose || ''));
  verifier('manifest.json : 3 raccourcis (Noter, Planning, À rappeler)', (m.shortcuts || []).length === 3 && m.shortcuts.map(s => s.url).join() === './#noter,./#planning,./#contacts', JSON.stringify(m.shortcuts?.map(s => s.url)));
  verifier('manifest.json : une icône maskable distincte, les autres « any »', mask.length === 1 && mask[0].purpose === 'maskable' && mask[0].src === 'icons/maskable-512.png' && m.icons.filter(i => i !== mask[0]).every(i => i.purpose === 'any'), JSON.stringify(m.icons));
  verifier('manifest.json : theme_color et background_color #f3f4f7', m.theme_color === '#f3f4f7' && m.background_color === '#f3f4f7');
  verifier('manifest.json : share_target GET vers ./', m.share_target && m.share_target.method === 'GET' && m.share_target.action === './' && m.share_target.params.text === 'text');
  await p.goto(base + '#dashboard', { waitUntil: 'load' });
  const ic = await p.evaluate(async () => { const i = new Image(); i.src = 'icons/maskable-512.png'; await i.decode(); const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; const g = c.getContext('2d'); g.drawImage(i, 0, 0); return { w: i.naturalWidth, h: i.naturalHeight, coin: [...g.getImageData(0, 0, 1, 1).data], centre: [...g.getImageData(256, 256, 1, 1).data] }; });
  verifier('icons/maskable-512.png : 512x512, coin opaque', ic.w === 512 && ic.h === 512 && ic.coin[3] === 255, JSON.stringify(ic));
  const tc = await p.evaluate(() => [...document.querySelectorAll('meta[name="theme-color"]')].filter(x => !x.media || matchMedia(x.media).matches).map(x => x.content));
  verifier('Thème clair : la meta theme-color active vaut #f3f4f7', tc.length === 1 && tc[0] === '#f3f4f7', JSON.stringify(tc));
  /* Partage reçu */
  await p.goto(base + '?text=Karim%20CEE', { waitUntil: 'load' });
  await p.waitForTimeout(400);
  const pr = await p.evaluate(() => ({ ouvert: !document.querySelector('#rencontre').hidden, note: document.querySelector('#r-note')?.value, url: location.href }));
  verifier('?text=Karim CEE : Noter s\'ouvre avec « Karim CEE »', pr.ouvert && pr.note === 'Karim CEE', JSON.stringify(pr));
  verifier('L\'adresse ne contient plus ?text', !/\?text/.test(pr.url) && /#dashboard$/.test(pr.url), pr.url);
  /* Retour arrière depuis Noter : l'accueil, pas de nouvelle ouverture */
  await p.goBack(); await p.waitForTimeout(400);
  verifier('Retour : Noter fermé, accueil', await p.evaluate(() => document.querySelector('#rencontre').hidden && !!document.querySelector('#main .noter-bar')));
  verifier('Pas d\'erreur JS (3)', erreurs.length === 0, erreurs.join(' | '));
  await ctx.close();
}

await b.close();
srv.close();
bilan();
