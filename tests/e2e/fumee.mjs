/* Test de fumée : chaque vue s'affiche sans erreur, au téléphone et à l'ordinateur, vide et avec l'exemple. */
import { ouvrir, verifier, bilan } from './outil.mjs';
const VUES = ['dashboard', 'planning', 'contacts', 'kamifood', 'dossiers', 'gains', 'jarvis', 'parametres'];
for (const [largeur, hauteur] of [[390, 844], [1366, 800]]) {
  for (const exemple of [false, true]) {
    const { p, erreurs, fermer } = await ouvrir({ largeur, hauteur, exemple });
    for (const v of VUES) {
      await p.evaluate(h => { location.hash = '#' + h; }, v);
      await p.waitForTimeout(120);
      const ok = await p.evaluate(() => document.querySelector('#main')?.children.length > 0);
      const horizontal = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      verifier(`${largeur}px ${exemple ? 'exemple' : 'vide'} #${v} s'affiche`, ok);
      verifier(`${largeur}px ${exemple ? 'exemple' : 'vide'} #${v} sans défilement horizontal`, horizontal);
    }
    verifier(`${largeur}px ${exemple ? 'exemple' : 'vide'} aucune erreur JS`, erreurs.length === 0, erreurs.join(' | '));
    await fermer();
  }
}
bilan();
