/* M1 — Navigation au pouce : 5 onglets, cibles de 44 px, Kami discret sans jeton, Réglages sans bouton Enregistrer */
import { ouvrir, verifier, bilan } from './outil.mjs';

const VUES = ['dashboard', 'planning', 'contacts', 'kamifood', 'dossiers', 'gains', 'jarvis', 'parametres'];
const aller = async (p, v) => { await p.evaluate(h => { location.hash = '#' + h; }, v); await p.waitForTimeout(150); };

/* 1. Barre du bas à 320, 360 et 390 px : 5 éléments visibles, dans l'écran, au moins 44x44 */
for (const largeur of [320, 360, 390]) {
  const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur: 780, exemple: true });
  const r = await p.evaluate(() => [...document.querySelectorAll('#nav > a, #nav > button')].filter(e => e.offsetParent !== null && getComputedStyle(e).display !== 'none')
    .map(e => { const b = e.getBoundingClientRect(); return { id: e.id || e.dataset.view, l: b.left, r: b.right, t: b.top, bo: b.bottom, w: b.width, h: b.height }; }));
  verifier(`${largeur}px : 5 éléments dans la barre (${r.map(x => x.id).join(', ')})`, r.length === 5 && JSON.stringify(r.map(x => x.id)) === JSON.stringify(['dashboard', 'planning', 'fab', 'contacts', 'lien-plus']));
  verifier(`${largeur}px : tous dans la fenêtre et ≥ 44x44`, r.every(x => x.l >= 0 && x.r <= largeur + 0.5 && x.bo <= 780.5 && x.w >= 44 && x.h >= 44), JSON.stringify(r));
  verifier(`${largeur}px : pas d'erreur JS`, erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

/* 2. Cibles tactiles ≥ 44 px sur chaque vue à 390x844, et rien de « Jarvis » sans jeton */
{
  const { p, erreurs, fermer } = await ouvrir({ largeur: 390, hauteur: 844, exemple: true });
  for (const v of VUES) {
    await aller(p, v);
    const petits = await p.evaluate(() => [...document.querySelectorAll('#main .btn, #main .chip, #main .seg button, #main .link, #main label.case')]
      .filter(e => e.offsetParent !== null && e.getBoundingClientRect().height > 0)
      .filter(e => e.getBoundingClientRect().height < 43.5).map(e => `${e.className}:${(e.textContent || '').trim().slice(0, 20)}:${Math.round(e.getBoundingClientRect().height)}`));
    verifier(`#${v} : aucune cible < 44 px`, petits.length === 0, petits.slice(0, 6).join(' | '));
    const jarvisTxt = await p.evaluate(() => /Jarvis/.test(document.body.innerText));
    verifier(`#${v} : aucun « Jarvis » visible`, !jarvisTxt);
    const lienKami = await p.evaluate(() => { const a = document.querySelector('#nav a[data-view="jarvis"]'); return !!a && a.offsetParent !== null; });
    verifier(`#${v} : lien Kami masqué sans jeton`, !lienKami);
  }
  /* Titre de l'onglet et aria-current */
  await aller(p, 'contacts');
  const nav = await p.evaluate(() => ({ titre: document.title, courant: document.querySelector('#nav [aria-current="page"]')?.dataset.view }));
  verifier('Titre « Contacts · KGD » et aria-current sur Contacts', nav.titre === 'Contacts · KGD' && nav.courant === 'contacts', JSON.stringify(nav));
  /* Pastilles : contacts à rappeler */
  const past = await p.evaluate(() => { const b = document.querySelector('#nav a[data-view="contacts"] .pastille'); return { visible: !!b && !b.hidden, n: b?.textContent, attendu: rappelsContacts().length }; });
  verifier(`Pastille Contacts = rappels dus (${past.attendu})`, past.attendu > 0 ? past.visible && past.n === String(past.attendu) : !past.visible, JSON.stringify(past));
  /* Libellés KPI : pas coupés, pas de « … » */
  for (const v of ['dashboard', 'kamifood', 'gains']) {
    await aller(p, v);
    const coupes = await p.evaluate(() => [...document.querySelectorAll('.kpi .label')].filter(e => e.offsetParent !== null).filter(e => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1 || /…$/.test(e.textContent.trim())).map(e => e.textContent));
    verifier(`#${v} : libellés KPI entiers`, coupes.length === 0, coupes.join(' | '));
  }
  /* Feuille Plus : tuiles, sans défilement, et navigation */
  await aller(p, 'dashboard');
  await p.click('#lien-plus'); await p.waitForTimeout(250);
  const plus = await p.evaluate(() => ({ ouvert: $('#modal').open, tuiles: [...document.querySelectorAll('#modal .tuile b')].map(b => b.textContent.trim()), defile: (() => { const b = document.querySelector('#modal .sheet-body'); return b ? b.scrollHeight > b.clientHeight + 1 : true; })() }));
  verifier(`Plus ouvre 4 tuiles (sans Kami sans jeton) : ${plus.tuiles.join(', ')}`, plus.ouvert && JSON.stringify(plus.tuiles) === JSON.stringify(['Gains', 'KamiFood', 'Apport', 'Réglages', 'Ta journée', 'Ta semaine']));
  verifier('Feuille Plus sans défilement', !plus.defile);
  await p.click('#modal .tuile >> text=Réglages'); await p.waitForTimeout(600);
  const apres = await p.evaluate(() => ({ hash: location.hash, ouvert: $('#modal').open, h1: document.querySelector('#main h1')?.textContent }));
  verifier('Tuile Réglages → #parametres, feuille fermée', apres.hash === '#parametres' && !apres.ouvert && apres.h1 === 'Réglages', JSON.stringify(apres));
  /* Retour arrière : revient à l'accueil (l'entrée de la feuille a été rendue) */
  await p.goBack(); await p.waitForTimeout(300);
  verifier('Retour arrière depuis Réglages → accueil', await p.evaluate(() => location.hash === '#dashboard' || location.hash === ''));
  verifier('390px : pas d\'erreur JS', erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

/* 3. Réglages : aucun bouton « Enregistrer », un prix modifié est gardé après rechargement */
{
  const { p, erreurs, fermer } = await ouvrir({ largeur: 1366, hauteur: 800, vue: 'parametres' });
  const enreg = await p.evaluate(() => [...document.querySelectorAll('#main button, #main .btn')].filter(b => b.textContent.trim() === 'Enregistrer').length);
  verifier('Réglages : aucun bouton Enregistrer', enreg === 0);
  await p.fill('#fp-1', '159'); await p.press('#fp-1', 'Tab'); await p.waitForTimeout(150);
  const focus = await p.evaluate(() => document.activeElement?.id);
  verifier(`Après modification, le focus passe au champ suivant (${focus})`, focus === 'fn-2');
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(300);
  verifier('Prix 159 conservé après rechargement', await p.evaluate(() => state.formules[1].prix === 159));
  await p.fill('#nom', 'Kami Sama'); await p.press('#nom', 'Tab'); await p.waitForTimeout(150);
  verifier('Nom affiché enregistré tout seul', await p.evaluate(() => state.nom === 'Kami Sama' && $('#brand-name').textContent === 'Kami Sama'));
  const ordre = await p.evaluate(() => [...document.querySelectorAll('.settings > .card > h2')].map(h => h.textContent));
  verifier(`Ordre des cartes : ${ordre.slice(0, 6).join(', ')}`, JSON.stringify(ordre.slice(0, 6)) === JSON.stringify(['Sauvegarde', 'Apparence', 'Sur ton téléphone', 'Nom affiché', 'Formules KamiFood', 'RDV inclus dans la souscription KamiFood']));
  verifier('Kami et Stripe dans « Connexions »', await p.evaluate(() => !!document.querySelector('details.connexions #j-token') && !!document.querySelector('details.connexions #btn-stripe')));
  /* Jeton posé : le lien Kami réapparaît */
  await p.evaluate(() => { const d = document.querySelector('details.connexions'); d.open = true; });
  await p.fill('#j-token', 'jeton-test'); await p.press('#j-token', 'Tab'); await p.waitForTimeout(150);
  verifier('Jeton posé : lien Kami visible', await p.evaluate(() => !document.querySelector('#nav a[data-view="jarvis"]').hidden));
  /* Contrastes */
  const contraste = await p.evaluate(() => {
    const rgb = c => { const m = c.match(/\d+(\.\d+)?/g).map(Number); return m.slice(0, 3); };
    const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const ratio = (a, b) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
    const t = document.createElement('div'); document.body.appendChild(t);
    t.style.color = 'var(--muted)'; t.style.background = 'var(--bg)';
    const r1 = ratio(getComputedStyle(t).color, getComputedStyle(t).backgroundColor);
    document.documentElement.dataset.theme = 'dark';
    const bt = document.createElement('button'); bt.className = 'btn primary'; document.body.appendChild(bt);
    const r2 = ratio(getComputedStyle(bt).color, getComputedStyle(bt).backgroundColor);
    document.documentElement.dataset.theme = 'light'; t.remove(); bt.remove();
    return { r1, r2 };
  });
  verifier(`Contraste --muted sur --bg ≥ 4,5 (${contraste.r1.toFixed(2)})`, contraste.r1 >= 4.5);
  verifier(`Contraste blanc sur bouton principal en sombre ≥ 4,5 (${contraste.r2.toFixed(2)})`, contraste.r2 >= 4.5);
  verifier('1366px : barre latérale à gauche, pas de lien Plus ni de +', await p.evaluate(() => getComputedStyle($('.sidebar')).position === 'sticky' && $('#lien-plus').offsetParent === null && $('#fab').offsetParent === null));
  verifier('1366px : pas d\'erreur JS', erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

/* 4. Paysage tactile 844x390 : barre du bas, Réglages atteignable par Plus */
{
  const { p, erreurs, fermer } = await ouvrir({ largeur: 844, hauteur: 390, tactile: true, exemple: true });
  const barre = await p.evaluate(() => { const s = $('.sidebar').getBoundingClientRect(); return { fixe: getComputedStyle($('.sidebar')).position === 'fixed', bas: Math.round(s.bottom), plus: $('#lien-plus').offsetParent !== null }; });
  verifier('Paysage : barre du bas affichée avec Plus', barre.fixe && barre.bas <= 391 && barre.plus, JSON.stringify(barre));
  await p.click('#lien-plus'); await p.waitForTimeout(250);
  await p.click('#modal .tuile >> text=Réglages'); await p.waitForTimeout(600);
  verifier('Paysage : Réglages atteint par Plus', await p.evaluate(() => location.hash === '#parametres'));
  verifier('Paysage : pas d\'erreur JS', erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}
bilan();
