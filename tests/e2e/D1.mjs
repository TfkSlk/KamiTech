/* D1 — Dictée dans Noter : texte en direct, erreurs expliquées, relance après un silence, repli vers la dictée du clavier */
import { ouvrir, verifier, bilan } from './outil.mjs';

/* Faux SpeechRecognition : pilotable depuis le test (mode ok | throwStart | silent | error:<code>) */
const FAUX = () => {
  window.__fake = { instances: [], mode: 'ok', starts: 0 };
  class FakeSR {
    constructor() { this.lang = ''; window.__fake.instances.push(this); }
    start() {
      const f = window.__fake; f.starts++;
      if (f.mode === 'throwStart') throw new DOMException('échec', 'InvalidStateError');
      if (f.mode === 'silent') return;
      setTimeout(() => {
        if (this.onstart) this.onstart();
        if (f.mode.startsWith('error:')) { const code = f.mode.slice(6); setTimeout(() => { if (this.onerror) this.onerror({ error: code }); if (this.onend) this.onend(); }, 0); }
      }, 0);
    }
    stop() { setTimeout(() => { if (this.onend) this.onend(); }, 0); }
    abort() { this.stop(); }
  }
  window.webkitSpeechRecognition = FakeSR; window.SpeechRecognition = FakeSR;
  window.__emit = (txt, isFinal) => { const r = window.__fake.instances.at(-1); const res = [{ transcript: txt }]; res.isFinal = isFinal; r.onresult({ resultIndex: 0, results: [res] }); };
  window.__end = () => { const r = window.__fake.instances.at(-1); if (r && r.onend) r.onend(); };
};
const SANS = () => { delete window.webkitSpeechRecognition; delete window.SpeechRecognition; };
const toastTxt = p => p.evaluate(() => (document.querySelector('#toast').firstChild ? document.querySelector('#toast').firstChild.textContent : ''));
const mic = p => p.evaluate(() => { const b = document.querySelector('#r-mic'); const r = b && b.getBoundingClientRect(); return b && { on: b.classList.contains('on'), clavier: b.classList.contains('clavier'), w: r.width, h: r.height }; });
const ouvrirNoter = async p => { await p.evaluate(() => { localStorage.removeItem('kgd-dictee'); if (typeof renc !== 'undefined' && renc) fermerRencontre(); openContact(); }); await p.waitForTimeout(250); };
const flag = p => p.evaluate(() => { try { return JSON.parse(localStorage.getItem('kgd-dictee') || 'null'); } catch (e) { return 'illisible'; } });

/* 1. Avec reconnaissance vocale (faux micro) à 390x844 */
{
  const { p, erreurs, fermer } = await ouvrir({ largeur: 390, hauteur: 844, exemple: true });
  await p.addInitScript(FAUX);
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(300);
  await ouvrirNoter(p);
  const m0 = await mic(p);
  verifier('Bouton micro présent, 44x44, pas en mode clavier', m0 && !m0.clavier && m0.w >= 44 && m0.h >= 44, JSON.stringify(m0));
  await p.click('#r-mic'); await p.waitForTimeout(100);
  const m1 = await mic(p);
  verifier('Un toucher démarre la reconnaissance (bouton allumé, start appelé une fois)', m1.on && (await p.evaluate(() => window.__fake.starts)) === 1, JSON.stringify(m1));
  await p.evaluate(() => window.__emit('croisé karim de', false)); await p.waitForTimeout(50);
  const i1 = await p.evaluate(() => ({ interim: document.querySelector('#r-interim').textContent, cache: document.querySelector('#r-interim').hidden, note: document.querySelector('#r-note').value }));
  verifier('Texte provisoire affiché en direct, la note reste vide', i1.interim === 'croisé karim de' && !i1.cache && i1.note === '', JSON.stringify(i1));
  const defile = await p.evaluate(() => { const b = document.querySelector('#rencontre .r-body'); return b.scrollHeight > b.clientHeight + 1; });
  verifier('Le texte provisoire ne fait rien défiler', !defile);
  await p.evaluate(() => window.__emit('croisé Karim de Karim SARL pour les CEE, je lui envoie le devis', true)); await p.waitForTimeout(300);
  const f1 = await p.evaluate(() => ({ note: document.querySelector('#r-note').value, interim: document.querySelector('#r-interim').hidden, nom: renc && renc.nom, jetons: document.querySelector('#r-jetons').textContent }));
  verifier('Texte final ajouté à la note, provisoire effacé, note relue (Karim reconnu)', f1.note === 'croisé Karim de Karim SARL pour les CEE, je lui envoie le devis' && f1.interim && /Karim/.test(f1.jetons), JSON.stringify(f1));
  await p.evaluate(() => window.__emit('rappelle-moi jeudi', true)); await p.waitForTimeout(200);
  verifier('Une seconde dictée s\'ajoute avec une espace', (await p.evaluate(() => document.querySelector('#r-note').value)).endsWith('devis rappelle-moi jeudi'));
  /* Silence : le navigateur coupe, l'appli relance tant que le bouton est allumé */
  await p.evaluate(() => window.__end()); await p.waitForTimeout(100);
  const r1 = await p.evaluate(() => ({ starts: window.__fake.starts, on: document.querySelector('#r-mic').classList.contains('on') }));
  verifier('Après un silence (onend), la reconnaissance est relancée, bouton toujours allumé', r1.starts === 2 && r1.on, JSON.stringify(r1));
  await p.click('#r-mic'); await p.waitForTimeout(150);
  const r2 = await p.evaluate(() => ({ starts: window.__fake.starts, on: document.querySelector('#r-mic').classList.contains('on') }));
  verifier('Un toucher arrête : bouton éteint, pas de relance', r2.starts === 2 && !r2.on, JSON.stringify(r2));
  /* Erreurs expliquées */
  for (const [code, attendu, drapeau] of [['not-allowed', /Micro refusé/, false], ['network', /internet/, false], ['audio-capture', /Aucun micro/, false], ['service-not-allowed', /Dicte avec/, true]]) {
    await ouvrirNoter(p);
    await p.evaluate(c => { window.__fake.mode = 'error:' + c; }, code);
    await p.click('#r-mic'); await p.waitForTimeout(150);
    const t = await toastTxt(p), m = await mic(p), fl = await flag(p);
    verifier(`Erreur ${code} : message « ${attendu.source} », bouton éteint${drapeau ? ', dictée du clavier retenue' : ''}`, attendu.test(t) && !m.on && (drapeau ? fl && fl.mode === 'clavier' && m.clavier : !fl), JSON.stringify({ t, m, fl }));
  }
  /* Appareil retenu en mode clavier : le bouton ouvre le clavier, sans appeler la reconnaissance */
  const avant = await p.evaluate(() => window.__fake.starts);
  await p.evaluate(() => { fermerRencontre(); openContact(); }); await p.waitForTimeout(250);
  await p.click('#r-mic'); await p.waitForTimeout(150);
  const k = await p.evaluate(s => ({ starts: window.__fake.starts - s, actif: document.activeElement && document.activeElement.id, clavier: document.querySelector('#r-mic').classList.contains('clavier') }), avant);
  verifier('Mode clavier retenu : focus sur la note, reconnaissance pas appelée', k.starts === 0 && k.actif === 'r-note' && k.clavier && /Dicte avec/.test(await toastTxt(p)), JSON.stringify(k));
  /* Reconnaissance muette (rien ne démarre en 3 s) → clavier */
  await ouvrirNoter(p);
  await p.evaluate(() => { window.__fake.mode = 'silent'; });
  await p.click('#r-mic'); await p.waitForTimeout(100);
  verifier('Muette : bouton allumé le temps du garde-fou', (await mic(p)).on);
  await p.clock.fastForward(3200); await p.waitForTimeout(100);
  const s1 = await p.evaluate(() => ({ on: document.querySelector('#r-mic').classList.contains('on'), fl: JSON.parse(localStorage.getItem('kgd-dictee') || 'null') }));
  verifier('Muette 3 s : repli clavier, appareil retenu', !s1.on && s1.fl && s1.fl.mode === 'clavier' && /muette/.test(await toastTxt(p)), JSON.stringify(s1));
  /* start() qui lève une erreur → clavier, pas d'échec silencieux */
  await ouvrirNoter(p);
  await p.evaluate(() => { window.__fake.mode = 'throwStart'; });
  await p.click('#r-mic'); await p.waitForTimeout(150);
  verifier('start() en erreur : message et repli clavier', /indisponible/.test(await toastTxt(p)) && (await mic(p)).clavier && (await flag(p))?.mode === 'clavier');
  verifier('Pas d\'erreur JS (1)', erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

/* 2. Sans reconnaissance vocale (Firefox, certains iPhone) : le bouton reste et ouvre la dictée du clavier */
{
  const { p, erreurs, fermer } = await ouvrir({ largeur: 390, hauteur: 844, exemple: true });
  await p.addInitScript(SANS);
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(300);
  await ouvrirNoter(p);
  const m = await mic(p);
  verifier('Sans reconnaissance : bouton micro présent, en mode clavier, 44x44', m && m.clavier && m.w >= 44 && m.h >= 44, JSON.stringify(m));
  await p.click('#r-mic'); await p.waitForTimeout(150);
  const k = await p.evaluate(() => ({ actif: document.activeElement && document.activeElement.id }));
  verifier('Un toucher : focus sur la note et aide « Dicte avec … »', k.actif === 'r-note' && /Dicte avec/.test(await toastTxt(p)), JSON.stringify(k) + ' ' + await toastTxt(p));
  const defile = await p.evaluate(() => { const b = document.querySelector('#rencontre .r-body'); return b.scrollHeight > b.clientHeight + 1; });
  verifier('Rien ne défile', !defile);
  verifier('Pas d\'erreur JS (2)', erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

/* 3. Ordinateur : iPhone détecté en appli installée + « not-allowed » → clavier retenu ; sinon simple message */
{
  const { p, erreurs, fermer } = await ouvrir({ largeur: 1366, hauteur: 900, exemple: true });
  await p.addInitScript(FAUX);
  await p.addInitScript(() => { Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15' }); Object.defineProperty(navigator, 'standalone', { get: () => true }); });
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(300);
  await ouvrirNoter(p);
  await p.evaluate(() => { window.__fake.mode = 'error:not-allowed'; });
  await p.click('#r-mic'); await p.waitForTimeout(150);
  const fl = await flag(p);
  verifier('iPhone en appli installée + not-allowed : dictée du clavier retenue, aide affichée', fl && fl.mode === 'clavier' && /touche micro du clavier/.test(await toastTxt(p)), JSON.stringify(fl) + ' ' + await toastTxt(p));
  verifier('Pas d\'erreur JS (3)', erreurs.length === 0, erreurs.join(' | '));
  await fermer();
}

bilan();
