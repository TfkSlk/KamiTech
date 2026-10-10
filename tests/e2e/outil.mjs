/*
 * Outil commun des tests navigateur du KGD.
 *   import { ouvrir, sansDefilement } from './outil.mjs';
 *   const { p, erreurs, fermer } = await ouvrir({ largeur: 390, hauteur: 844, horloge: '2026-10-10T09:00:00', exemple: true, vue: 'dashboard' });
 *   ... await fermer();
 * Sert le dossier racine du dépôt (celui qui contient ce fichier, deux niveaux au-dessus) sur un port libre.
 * L'horloge est figée en heure locale du navigateur (Europe/Paris) avec page.clock.
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const portLibre = () => new Promise((ok, ko) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); }); s.on('error', ko); });

async function serveur() {
  const port = await portLibre();
  const proc = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: RACINE, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/index.html`); if (r.ok) break; } catch (e) { /* pas prêt */ }
    await new Promise(r => setTimeout(r, 100));
  }
  return { port, arreter: () => proc.kill() };
}

export async function ouvrir({ largeur = 390, hauteur = 844, horloge = '2026-10-10T09:00:00', exemple = false, vue = 'dashboard', stockage = null, tactile = largeur <= 760 } = {}) {
  const srv = await serveur();
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: largeur, height: hauteur }, locale: 'fr-FR', timezoneId: 'Europe/Paris', hasTouch: tactile, isMobile: tactile });
  const p = await ctx.newPage();
  const erreurs = [];
  p.on('pageerror', e => erreurs.push(String(e.message || e)));
  // Les fonctions /api/* n'existent qu'une fois déployées sur Vercel : leurs 404 locales ne comptent pas.
  p.on('response', r => { if (r.status() >= 400 && !new URL(r.url()).pathname.startsWith('/api/') && r.url().startsWith('http://127.0.0.1')) erreurs.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  p.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|net::ERR|fonts\.g|Failed to load resource/.test(m.text())) erreurs.push(m.text()); });
  if (horloge) await p.clock.install({ time: new Date(horloge) });
  const base = `http://127.0.0.1:${srv.port}/`;
  if (stockage) {
    await p.goto(base + 'index.html#vide', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await p.evaluate(s => { localStorage.clear(); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, stockage);
  }
  await p.goto(base + 'index.html#' + vue, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await p.waitForTimeout(300);
  if (exemple) {
    await p.evaluate(() => { loadDemo(); });
    await p.waitForTimeout(100);
    await p.evaluate(() => document.querySelector('#confirm-ok')?.click());
    await p.waitForTimeout(150);
  }
  const fermer = async () => { await b.close(); srv.arreter(); };
  return { b, ctx, p, base, erreurs, fermer };
}

/* Vrai si l'élément ne défile pas (scrollHeight <= clientHeight + 1) */
export const sansDefilement = (p, selecteur) => p.evaluate(s => { const e = document.querySelector(s); return !!e && e.scrollHeight <= e.clientHeight + 1; }, selecteur);

/* Petit harnais : verifier('nom', condition, détail) puis bilan() → code de sortie 1 si un échec */
const resultats = [];
export function verifier(nom, ok, detail = '') { resultats.push({ nom, ok: !!ok, detail }); console.log(`${ok ? 'OK ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`); }
export function bilan() { const ko = resultats.filter(r => !r.ok).length; console.log(`\n${resultats.length - ko}/${resultats.length} vérifications réussies`); process.exitCode = ko ? 1 : 0; return ko === 0; }
