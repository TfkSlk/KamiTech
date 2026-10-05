'use strict';
/* ---------- Accueil, Planning (jour / semaine / mois), Gains et graphiques ---------- */

/* Formats */
const eurK = n => Math.abs(n) >= 10000 ? (n / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' k€' : eur(n);
const pct = (a, b) => b ? Math.round((a / b) * 100) : 0;
const eurTick = v => !v ? '0' : v >= 1000 ? (v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' k€' : eur(v);
const PAS_TEMPS = [15, 30, 60, 120, 180, 240, 360, 480, 600];
const pasTemps = max => PAS_TEMPS.find(s => max / s <= 5) || 720;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const moisCourt = d => cap(d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''));
const heureTxt = (h, m) => `${h} h${m ? ' ' + pad(m) : ''}`;

/* ---------- Séries pour les graphiques ---------- */
function gainsEntre(secteur, from, to) {
  if (secteur === 'kamifood') return state.abonnes.reduce((s, a) => s + moisFactures(a, from, to) * num(a.prix), 0);
  return state.dossiers.filter(d => d.activite === secteur && d.datePaiement >= from && d.datePaiement <= to).reduce((s, d) => s + num(d.commRecue), 0);
}
function tempsEntre(secteur, from, to) {
  return state.events.filter(e => e.activite === secteur && e.date >= from && e.date <= to).reduce((s, e) => s + num(e.duree), 0);
}
function serieMois(n = 6) {
  const now = new Date(), out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const from = iso(d), to = iso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    out.push({ label: moisCourt(d), parts: PRO.map(k => ({ k, value: gainsEntre(k, from, to) })) });
  }
  return out;
}
function serieSemaine(lundi) {
  return [...Array(7)].map((_, i) => {
    const d = addDays(lundi, i), ds = iso(d);
    return { label: cap(d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')), date: ds, parts: Object.keys(SECTEURS).map(k => ({ k, value: tempsEntre(k, ds, ds) })) };
  });
}

/* ---------- Infobulle partagée ---------- */
function tipInit() {
  if ($('#tip')) return;
  const t = document.createElement('div'); t.id = 'tip'; t.setAttribute('role', 'tooltip');
  document.body.appendChild(t);
  const place = e => {
    const el = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
    if (!el) { t.classList.remove('show'); return; }
    t.innerHTML = el.dataset.tip; t.classList.add('show');
    const x = Math.max(8, Math.min(e.clientX + 14, window.innerWidth - t.offsetWidth - 12));
    const y = e.clientY - t.offsetHeight - 14;
    t.style.transform = `translate(${x}px, ${y < 8 ? e.clientY + 18 : y}px)`;
  };
  document.addEventListener('mousemove', place);
  document.addEventListener('click', e => { if (!(e.target.closest && e.target.closest('[data-tip]'))) t.classList.remove('show'); });
}
const tip = s => esc(s).replace(/\n/g, '<br>');

/* ---------- Graphiques (SVG, couleurs par jetons de thème) ---------- */
function donut(parts, fmt = eur, sub = '') {
  const vis = parts.filter(p => p.value > 0);
  const sum = vis.reduce((s, p) => s + p.value, 0);
  if (!sum) return '<div class="empty">Rien sur cette période.</div>';
  const C = 100, R = 82, r = 60, gap = vis.length > 1 ? 0.045 : 0;
  let a = -Math.PI / 2;
  const P = (ang, rad) => `${(C + rad * Math.cos(ang)).toFixed(2)} ${(C + rad * Math.sin(ang)).toFixed(2)}`;
  const arcs = vis.map(p => {
    const span = (p.value / sum) * Math.PI * 2;
    const g = span > gap * 3 ? gap / 2 : 0;
    const s = a + g, e = a + span - g, big = e - s > Math.PI ? 1 : 0;
    a += span;
    return `<path d="M${P(s, R)} A${R} ${R} 0 ${big} 1 ${P(e, R)} L${P(e, r)} A${r} ${r} 0 ${big} 0 ${P(s, r)} Z" fill="var(--${p.k})" data-tip="${tip(`${p.label}\n${fmt(p.value)} · ${pct(p.value, sum)} %`)}"><title>${esc(p.label)} : ${esc(fmt(p.value))}</title></path>`;
  }).join('');
  const principal = vis.reduce((m, p) => (p.value > m.value ? p : m), vis[0]);
  return `<div class="donut-wrap">
    <svg viewBox="0 0 200 200" class="donut" role="img" aria-label="Répartition par secteur">${arcs}
      <text x="100" y="${sub ? 96 : 106}" text-anchor="middle" class="donut-total">${esc(fmt === eur ? eurK(sum) : fmt(sum))}</text>
      ${sub ? `<text x="100" y="116" text-anchor="middle" class="donut-sub">${esc(sub)}</text>` : ''}
    </svg>
    <ul class="legend-list">${parts.map(p => `<li class="${p.value ? '' : 'dim'} ${p === principal ? 'principal' : ''}"><i style="background:var(--${p.k})"></i><span class="grow">${esc(p.label)}</span><b>${esc(fmt(p.value))}</b><span class="meta">${pct(p.value, sum)} %</span></li>`).join('')}</ul>
  </div>`;
}

function pas(max) { // graduation propre
  if (max <= 0) return 1;
  const brut = max / 4, p = Math.pow(10, Math.floor(Math.log10(brut))), f = brut / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
function colonnes(data, opts = {}) {
  const fmt = opts.fmt || eur, fmtTick = opts.fmtTick || fmt;
  const totals = data.map(d => d.parts.reduce((s, p) => s + p.value, 0));
  const max = Math.max(...totals, 0);
  if (!max) return `<div class="empty">${esc(opts.vide || 'Pas encore de données.')}</div>`;
  const step = opts.pas ? opts.pas(max) : pas(max), top = Math.ceil(max / step) * step;
  const mobile = window.innerWidth < 760;
  const n = data.length, W = Math.max(60 + n * 56, mobile ? 0 : (opts.minW || 0)), H = 190, pl = 54, pt = 18, pb = 26, ih = H - pt - pb;
  const slot = (W - pl - 10) / n;
  const y = v => pt + ih - (v / top) * ih;
  const ticks = []; for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  const grid = ticks.map(v => `<line x1="${pl}" x2="${W - 8}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grid"/><text x="${pl - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" class="tick">${esc(fmtTick(v))}</text>`).join('');
  const iMax = totals.indexOf(max);
  const cols = data.map((d, i) => {
    const cx = pl + slot * (i + 0.5), w = 24, x = cx - w / 2;
    let base = y(0), segs = '';
    const vis = d.parts.filter(p => p.value > 0);
    vis.forEach((p, j) => {
      const h = (p.value / top) * ih, y0 = base - h, dernier = j === vis.length - 1;
      const hh = Math.max(0, h - (j ? 2 : 0));
      const yy = y0 + (j ? 2 : 0);
      const path = dernier && hh > 4
        ? `M${x} ${yy + 4}a4 4 0 0 1 4-4h${w - 8}a4 4 0 0 1 4 4v${hh - 4}h-${w}z`
        : `M${x} ${yy}h${w}v${hh}h-${w}z`;
      segs += `<path d="${path}" fill="var(--${p.k})"/>`;
      base = y0;
    });
    const detail = d.parts.filter(p => p.value > 0).map(p => `${SECTEURS[p.k].label} : ${fmt(p.value)}`).join('\n');
    const lab = i === iMax ? `<text x="${cx}" y="${(y(max) - 6).toFixed(1)}" text-anchor="middle" class="val">${esc(fmt(max))}</text>` : '';
    return `<g>${segs}${lab}<rect x="${(cx - slot / 2).toFixed(1)}" y="${pt}" width="${slot.toFixed(1)}" height="${ih}" fill="transparent" data-tip="${tip(`${d.label} · ${fmt(totals[i])}${detail ? '\n' + detail : ''}`)}"/><text x="${cx}" y="${H - 8}" text-anchor="middle" class="tick">${esc(d.label)}</text></g>`;
  }).join('');
  const legende = opts.legende !== false ? `<div class="legend">${Object.keys(SECTEURS).filter(k => data.some(d => d.parts.some(p => p.k === k && p.value > 0))).map(k => `<span><i style="background:var(--${k})"></i>${esc(SECTEURS[k].label)}</span>`).join('')}</div>` : '';
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(opts.aria || 'Graphique')}">${grid}<line x1="${pl}" x2="${W - 8}" y1="${y(0)}" y2="${y(0)}" class="axis"/>${cols}</svg>${legende}`;
}

function sparkline(vals) {
  const W = 120, H = 36, max = Math.max(...vals, 1), n = vals.length;
  const X = i => 6 + (i / (n - 1)) * (W - 12), Y = v => 4 + (1 - v / max) * (H - 12);
  const pts = vals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`);
  const last = vals[n - 1];
  return `<svg viewBox="0 0 ${W} ${H}" class="spark" aria-hidden="true">
    <path d="M${pts[0]} L${pts.slice(1).join(' L')} L${X(n - 1).toFixed(1)},${H - 2} L${X(0)},${H - 2}Z" class="spark-area"/>
    <path d="M${pts.join(' L')}" class="spark-line"/>
    <circle cx="${X(n - 1).toFixed(1)}" cy="${Y(last).toFixed(1)}" r="4" class="spark-dot"/></svg>`;
}

function periodeSwitch() {
  return `<div class="seg" role="group" aria-label="Période">${Object.entries(PERIODES).map(([k, l]) =>
    `<button class="${state.prefs.periode === k ? 'on' : ''}" onclick="state.prefs.periode='${k}';save();render()">${l}</button>`).join('')}</div>`;
}

/* ---------- Accueil ---------- */
function dashboard() {
  tipInit();
  const t = today(), p = state.prefs.periode;
  const b = bilan(p), annee = bilan('annee'), semaine = bilan('semaine');
  const lundi = monday(new Date());
  const todayEv = state.events.filter(e => surJour(e, t));
  const todayItems = [...rappelsContacts().filter(r => r.date === t), ...todayEv, ...relances().filter(r => r.date === t)].sort((a, c) => (a.heure || '99').localeCompare(c.heure || '99'));
  const retard = [...rappelsContacts().filter(r => r.date < t), ...relances().filter(r => r.date < t), ...state.events.filter(e => !e.fait && (estPeriode(e) ? e.fin < t : e.date < t))].sort((a, c) => a.date.localeCompare(c.date));
  const next7 = state.events.filter(e => e.date > t && e.date <= iso(addDays(new Date(), 7))).sort((a, c) => (a.date + a.heure).localeCompare(c.date + c.heure));
  const empty = !state.dossiers.length && !state.events.length && !state.abonnes.length && !state.aVoir.length;
  const contactsSuivis = state.aVoir.filter(v => v.statut === 'suivi').sort(aVoirTri);
  const contactsDus = contactsSuivis.filter(v => v.rappel && v.rappel <= t).length;
  const serie = serieMois(6), spark = serie.map(m => m.parts.reduce((s, x) => s + x.value, 0));
  const minJour = todayEv.filter(e => !e.fait && !estPeriode(e)).reduce((s, e) => s + num(e.duree), 0);
  const h = new Date().getHours();
  const salut = h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
  const resume = [
    `${todayEv.filter(e => !estPeriode(e)).length ? `${todayEv.filter(e => !estPeriode(e)).length} RDV aujourd'hui (${hrs(minJour)})` : 'Rien de prévu aujourd\'hui'}`,
    retard.length ? `${retard.length} en retard` : 'tout est à jour',
    `${eur(b.tot.gagne)} gagnés ${PERIODES[p].toLowerCase().replace('cette ', 'cette ').replace('ce ', 'ce ')}`,
  ].join(' · ');

  const donutParts = b.rows.map(r => ({ k: r.k, label: SECTEURS[r.k].label, value: r.gagne }));
  const charge = serieSemaine(lundi);

  return `
  <div class="page-head">
    <div><h1>${salut}, Toufek</h1><p>${esc(cap(fmtLong(new Date())))} · ${esc(resume)}</p></div>
    <div class="btn-row">
      <button class="btn" onclick="openContact()">+ Contact</button>
      <button class="btn" onclick="openEvent()">+ RDV</button>
      <button class="btn" onclick="openAbonne()">+ Abonné</button>
      <button class="btn primary" onclick="openDossier()">+ Dossier</button>
    </div>
  </div>
  <div class="card capture">
    <form onsubmit="event.preventDefault();openContact(null,{nom:this.nom.value.trim(),sujet:this.sujet.value.trim()});this.reset()">
      <div class="capture-lead"><strong>Qui as-tu croisé ?</strong><span class="meta">Contact, sujet, puis rappel ou créneau dans le planning.</span></div>
      <input name="nom" placeholder="Nom (et entreprise)" required autocomplete="off">
      <input name="sujet" placeholder="De quoi vous avez parlé" autocomplete="off">
      <button class="btn primary">Noter</button>
    </form>
  </div>
  ${empty ? `<div class="card notice"><div><h2>Ton tableau de bord est vide</h2><p class="empty">Ajoute un abonné, un dossier ou un RDV, ou charge un exemple pour voir comment tout se calcule.</p></div><button class="btn" onclick="loadDemo()">Charger un exemple</button></div>` : ''}
  ${!empty && aDemo() ? `<div class="card notice"><div><h2>Des données d'exemple sont affichées</h2><p class="empty">Elles se mélangent à tes vraies données. Retire-les d'un clic : tes RDV, dossiers et abonnés réels restent.</p></div><button class="btn primary" onclick="retirerExemple()">Retirer l'exemple</button></div>` : ''}
  <div class="grid kpis">
    <div class="card kpi"><div class="label">Gagné · ${PERIODES[p].toLowerCase()}</div><div class="value">${esc(eur(b.tot.gagne))}</div><div class="sub">+ ${esc(eur(b.tot.prevu))} encore attendu</div></div>
    <div class="card kpi"><div class="label">Gagné · année</div><div class="value">${esc(eur(annee.tot.gagne))}</div><div class="sub spark-row">${sparkline(spark)}<span>6 derniers mois</span></div></div>
    <div class="card kpi"><div class="label">KamiFood · par mois</div><div class="value">${esc(eur(mrr()))}</div><div class="sub">${state.abonnes.filter(a => a.statut === 'actif').length} abonné(s) actif(s)</div></div>
    <div class="card kpi"><div class="label">Planifié · semaine</div><div class="value">${esc(hrs(semaine.tot.total + semaine.perso.total))}</div><div class="sub">${semaine.tot.rdv} RDV · ${esc(hrs(semaine.tot.fait + semaine.perso.fait))} réalisées</div></div>
  </div>
  <div class="grid cols-2 charts-row">
    <div class="card">
      <div class="card-head"><div><h2>Gains par secteur</h2><p class="meta">Encaissé · ${PERIODES[p].toLowerCase()}</p></div>${periodeSwitch()}</div>
      ${donut(donutParts, eur, `Encaissé · ${PERIODES[p].toLowerCase()}`)}
    </div>
    <div class="card">
      <div class="card-head"><div><h2>Charge de la semaine</h2><p class="meta">Heures planifiées par jour · ${esc(hrs(semaine.tot.total + semaine.perso.total))} au total</p></div><a class="link" href="#planning">Planning →</a></div>
      ${colonnes(charge, { fmt: hrs, fmtTick: v => v ? hrs(v) : '0', pas: pasTemps, vide: 'Aucun RDV cette semaine.', aria: 'Heures par jour' })}
    </div>
  </div>
  <div class="grid cols-2 agenda-row">
    <div class="card"><div class="card-head"><div><h2>Aujourd'hui</h2><p class="meta">${retard.length ? `${retard.length} en retard à traiter d'abord` : (todayEv.length ? `${todayEv.length} RDV · ${esc(hrs(minJour))}` : 'Journée libre')}</p></div><a class="link" href="#planning">Planning →</a></div>
      ${itemList([...retard.map(e => ({ ...e, retard: true })), ...todayItems], false) || '<div class="empty">Rien de prévu aujourd\'hui, et rien en retard.</div>'}</div>
    <div class="card"><div class="card-head"><div><h2>7 prochains jours</h2><p class="meta">${next7.length} RDV · ${esc(hrs(next7.reduce((s, e) => s + num(e.duree), 0)))}</p></div></div>
      ${itemList(next7, true) || '<div class="empty">Aucun RDV planifié.</div>'}</div>
  </div>
  <div class="card avoir-card"><div class="card-head"><div><h2>Contacts</h2><p class="meta">${contactsDus ? `${contactsDus} à rappeler` : contactsSuivis.length ? `${contactsSuivis.length} en cours, rien à rappeler aujourd'hui` : 'Personne en suivi'}</p></div><div class="btn-row"><button class="btn small" onclick="openContact()">+ Prise de contact</button><a class="link" href="#contacts">Tous →</a></div></div>
    ${contactsSuivis.length ? `<ul class="list">${contactsSuivis.slice(0, 5).map(v => aVoirItem(v, true)).join('')}</ul>` : '<div class="empty">Tu croises quelqu\'un, vous parlez d\'un service : note-le en 10 secondes, avec un rappel.</div>'}</div>
  <div class="grid cols-4 sect-row">${b.rows.map(r => `<a class="card act-card" style="--c:var(--${r.k})" href="#${r.k === 'kamifood' ? 'kamifood' : 'dossiers'}" onclick="filtre.activite='${r.k === 'kamifood' ? 'all' : r.k}'">
      <div class="title"><span>${esc(SECTEURS[r.k].label)}</span><span class="meta">${PERIODES[p].toLowerCase()}</span></div>
      <div class="big">${esc(eur(r.gagne))}</div>
      <dl><dt>Attendu</dt><dd>${esc(eur(r.prevu))}</dd><dt>Planifié</dt><dd>${esc(hrs(r.total))}</dd><dt>€ / heure</dt><dd>${esc(parHeure(r.gagne, r.total))}</dd>
      ${r.k === 'kamifood' ? `<dt>Abonnés actifs</dt><dd>${state.abonnes.filter(a => a.statut === 'actif').length}</dd>` : `<dt>Dossiers en cours</dt><dd>${state.dossiers.filter(d => d.activite === r.k && ACTIFS.includes(d.statut)).length}</dd>`}</dl>
    </a>`).join('')}</div>`;
}

/* ---------- Planning ---------- */
let planDate = null; // initialisé au premier affichage (app.js est chargé après)
const H0 = 7, H1 = 21, PH = 52; // heures affichées, hauteur d'une heure en px
const planVue = () => state.prefs.planVue || 'semaine';
function setPlanVue(v) { state.prefs.planVue = v; save(); render(); }
function planNav(n) {
  planDate = planDate || today();
  const d = parse(planDate), v = planVue();
  if (n === 0) planDate = today();
  else if (v === 'jour') planDate = iso(addDays(d, n));
  else if (v === 'semaine') planDate = iso(addDays(d, 7 * n));
  else planDate = iso(new Date(d.getFullYear(), d.getMonth() + n, 1));
  render();
}
function allerAuJour(ds) { planDate = ds; setPlanVue('jour'); }
const ouvrir = e => e.relance ? `openDossier('${e.lien.slice(2)}')` : `openEvent('${e.id}')`;
const minutesDe = h => { const [a, b] = String(h).split(':').map(Number); return a * 60 + (b || 0); };

function planning() {
  tipInit();
  planDate = planDate || today();
  const v = planVue();
  const all = [...state.events, ...relances()].filter(e => planFiltre === 'all' || e.activite === planFiltre);
  const d = parse(planDate);
  const lundi = monday(d);
  const label = v === 'jour' ? cap(fmtLong(d))
    : v === 'semaine' ? `${lundi.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} – ${addDays(lundi, 6).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : cap(d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }));
  const chips = [['all', 'Tout'], ...Object.entries(SECTEURS).map(([k, s]) => [k, s.label])]
    .map(([k, l]) => `<button class="chip ${planFiltre === k ? 'on' : ''}" onclick="planFiltre='${k}';render()">${k === 'all' ? '' : `<i style="background:var(--${k})"></i>`}${l}</button>`).join('');
  return `
  <div class="page-head">
    <div><h1>Planning</h1><p>${esc(label)}</p></div>
    <div class="plan-tools">
      <div class="seg" role="group" aria-label="Vue">${[['jour', 'Jour'], ['semaine', 'Semaine'], ['mois', 'Mois']].map(([k, l]) => `<button class="${v === k ? 'on' : ''}" onclick="setPlanVue('${k}')">${l}</button>`).join('')}</div>
      <div class="week-nav">
        <button class="btn icon" onclick="planNav(-1)" aria-label="Précédent">‹</button>
        <button class="btn" onclick="planNav(0)">Aujourd'hui</button>
        <button class="btn icon" onclick="planNav(1)" aria-label="Suivant">›</button>
      </div>
      <button class="btn primary" onclick="openEvent(null,'${planDate}')">+ RDV</button>
    </div>
  </div>
  <div class="toolbar">${chips}<span class="legende meta"><i class="lg-bandeau"></i>semaine ou moins <i class="lg-fil"></i>période longue <i class="lg-prevoir"></i>date à prévoir</span></div>
  ${v === 'jour' ? vueJour(all, d) : v === 'mois' ? vueMois(all, d) : vueSemaine(all, lundi)}`;
}

function vueSemaine(all, lundi) {
  const jours = [...Array(7)].map((_, i) => iso(addDays(lundi, i)));
  const t = today();
  const sem = state.events.filter(e => e.date >= jours[0] && e.date <= jours[6]);
  const totalMin = sem.reduce((s, e) => s + num(e.duree), 0);
  const charge = Object.keys(SECTEURS).map(k => [k, sem.filter(e => e.activite === k).reduce((s, e) => s + num(e.duree), 0)]).filter(([, m]) => m);
  return `<div class="card load-card">
    <div class="load-head"><strong>${esc(hrs(totalMin))} planifiées</strong><span class="meta">${sem.filter(e => e.mode !== 'tache').length} RDV · ${sem.filter(e => e.mode === 'visio').length} en visio · ${sem.filter(e => e.mode === 'place').length} sur place</span></div>
    <div class="stack">${charge.map(([k, m]) => `<span style="flex:${m};background:var(--${k})" data-tip="${tip(`${SECTEURS[k].label} : ${hrs(m)}`)}"></span>`).join('') || '<span class="stack-empty"></span>'}</div>
    <div class="legend">${charge.map(([k, m]) => `<span><i style="background:var(--${k})"></i>${esc(SECTEURS[k].label)} ${esc(hrs(m))}</span>`).join('')}</div>
  </div>
  ${window.innerWidth < 760 ? jours.map(ds => {
    const items = all.filter(e => surJour(e, ds)).sort((a, c) => (a.heure || '99').localeCompare(c.heure || '99'));
    const min = items.filter(e => !e.relance && !estPeriode(e)).reduce((s, e) => s + num(e.duree), 0);
    return `<div class="card day-card ${ds === t ? 'today' : ''}">
      <div class="card-head"><div><h2>${esc(cap(parse(ds).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' })))}</h2><p class="meta">${min ? esc(hrs(min)) : 'Libre'}</p></div><button class="btn small" onclick="openEvent(null,'${ds}')">+ RDV</button></div>
      ${itemList(items, false) || ''}</div>`;
  }).join('') : grilleHeures(jours, all)}`;
}
function vueJour(all, d) {
  const ds = iso(d);
  const items = all.filter(e => surJour(e, ds)).sort((a, c) => (a.heure || '99').localeCompare(c.heure || '99'));
  const min = items.filter(e => !e.relance && !estPeriode(e)).reduce((s, e) => s + num(e.duree), 0);
  return `<div class="jour-layout">
    ${grilleHeures([ds], all)}
    <div class="card jour-side">
      <div class="card-head"><div><h2>${esc(cap(d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })))}</h2><p class="meta">${items.length ? `${items.filter(e => !e.relance).length} RDV · ${esc(hrs(min))}` : 'Journée libre'}</p></div></div>
      ${itemList(items, false) || '<div class="empty">Rien de prévu. Clique sur un créneau pour ajouter un RDV.</div>'}
    </div>
  </div>`;
}
function vueMois(all, d) {
  const t = today();
  const premier = new Date(d.getFullYear(), d.getMonth(), 1), dernier = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const start = monday(premier);
  const nbSem = Math.ceil((Math.round((dernier - start) / 864e5) + 1) / 7);
  const cellules = [...Array(nbSem * 7)].map((_, i) => {
    const day = addDays(start, i), ds = iso(day);
    const tous = all.filter(e => surJour(e, ds)).sort((a, c) => (estPeriode(a) ? 0 : 1) - (estPeriode(c) ? 0 : 1) || (a.heure || '99').localeCompare(c.heure || '99'));
    const longues = tous.filter(periodeLongue), evs = tous.filter(e => !periodeLongue(e));
    const min = evs.filter(e => !e.relance && !estPeriode(e)).reduce((s, e) => s + num(e.duree), 0);
    const visibles = evs.slice(0, 3);
    const traits = longues.map(e => `<div class="mtrait ${e.aPrevoir ? 'prevoir' : ''} ${e.fait ? 'done' : ''} ${e.important ? 'alerte' : ''}" style="--c:var(--${e.activite})" onclick="event.stopPropagation();${ouvrir(e)}" data-tip="${tip(`${e.aPrevoir ? 'À prévoir · ' : ''}${e.titre}\n${fmtDate(e.date)} → ${fmtDate(e.fin)}`)}">${ds === e.date || day.getDay() === 1 ? `<span>${esc(e.titre)}</span>` : ''}</div>`).join('');
    return `<div class="mcell ${day.getMonth() !== d.getMonth() ? 'hors' : ''} ${ds === t ? 'today' : ''}" onclick="allerAuJour('${ds}')" role="button" tabindex="0" onkeydown="if(event.key==='Enter')allerAuJour('${ds}')">
      <div class="mhead"><b>${day.getDate()}</b>${min ? `<span class="meta">${esc(hrs(min))}</span>` : ''}</div>
      ${traits}
      ${visibles.map(e => `<div class="mchip ${e.fait ? 'done' : ''} ${e.relance ? 'relance' : ''} ${estPeriode(e) ? 'periode' : ''} ${e.aPrevoir ? 'prevoir' : ''} ${e.important ? 'alerte' : ''}" style="--c:var(--${e.activite})" onclick="event.stopPropagation();${ouvrir(e)}" data-tip="${tip(`${e.heure ? e.heure + ' · ' : ''}${e.titre}${e.relance ? '' : ' · ' + hrs(num(e.duree))}`)}"><i style="background:var(--${e.activite})"></i><span>${e.important ? '⚠ ' : ''}${e.heure ? `<b>${esc(e.heure)}</b> ` : ''}${esc(e.titre)}</span></div>`).join('')}
      ${evs.length > 3 ? `<div class="mplus">+ ${evs.length - 3}</div>` : ''}
    </div>`;
  }).join('');
  return `<div class="card mois-card">
    <div class="mgrid mhead-row">${['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(j => `<div class="mday">${j}</div>`).join('')}</div>
    <div class="mgrid" style="--rows:${nbSem}">${cellules}</div>
  </div>`;
}

/* Grille horaire : une colonne par jour, événements positionnés par heure et durée */
function grilleHeures(jours, all) {
  const t = today();
  const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
  const heures = [...Array(H1 - H0 + 1)].map((_, i) => H0 + i);
  const head = jours.map(ds => {
    const d = parse(ds), min = state.events.filter(e => e.date === ds).reduce((s, e) => s + num(e.duree), 0);
    return `<div class="tg-day ${ds === t ? 'today' : ''}" onclick="allerAuJour('${ds}')"><span>${esc(d.toLocaleDateString('fr-FR', { weekday: jours.length > 1 ? 'short' : 'long' }).replace('.', ''))}</span><b>${d.getDate()}</b>${min ? `<em>${esc(hrs(min))}</em>` : ''}</div>`;
  }).join('');
  const allday = jours.map(ds => {
    const items = all.filter(e => e.date === ds && !estPeriode(e) && (!e.heure || e.relance)).sort((a, c) => (a.relance ? 0 : 1) - (c.relance ? 0 : 1));
    return `<div class="tg-allday-col">${items.map(e => `<div class="ev ${e.fait ? 'done' : ''} ${e.relance ? 'relance' : ''} ${e.important ? 'alerte' : ''}" style="--c:var(--${e.activite})" onclick="${ouvrir(e)}" data-tip="${tip(e.relance ? e.titre : `${e.titre} · ${MODES[e.mode] || ''}${e.duree ? ' · ' + hrs(num(e.duree)) : ''}`)}">${e.important ? '⚠ ' : ''}${esc(e.titre)}</div>`).join('')}</div>`;
  }).join('');
  // périodes : un bandeau qui s'étale sur les jours couverts
  const periodes = all.filter(e => estPeriode(e) && e.date <= jours[jours.length - 1] && e.fin >= jours[0]).sort((a, c) => a.date.localeCompare(c.date));
  const bandeaux = periodes.map(e => {
    const debut = Math.max(0, jours.indexOf(jours.find(d => d >= e.date) || jours[0]));
    const fin = jours.reduce((m, d, i) => (d <= e.fin ? i : m), debut);
    return `<div class="bandeau ${periodeLongue(e) ? 'fil' : ''} ${e.aPrevoir ? 'prevoir' : ''} ${e.fait ? 'done' : ''} ${e.important ? 'alerte' : ''}" style="--c:var(--${e.activite});grid-column:${debut + 2} / ${fin + 3}" onclick="${ouvrir(e)}" data-tip="${tip(`${e.aPrevoir ? 'À prévoir · ' : ''}${e.titre}\n${fmtDate(e.date)} → ${fmtDate(e.fin)} (${joursPeriode(e)} j)${lienNom(e.lien) ? '\n' + lienNom(e.lien) : ''}`)}">${e.important ? '⚠ ' : ''}${e.aPrevoir ? '<em>à prévoir</em> ' : ''}${esc(e.titre)}<span class="meta"> ${e.date < jours[0] ? esc(fmtDate(e.date)) + ' ' : ''}→ ${esc(fmtDate(e.fin))}</span></div>`;
  }).join('');
  const cols = jours.map(ds => {
    const evs = all.filter(e => e.date === ds && e.heure && !e.relance).map(e => ({ e, s: minutesDe(e.heure), f: minutesDe(e.heure) + Math.max(15, num(e.duree) || 30) })).sort((a, c) => a.s - c.s);
    // voies : seuls les RDV qui se chevauchent réellement se partagent la largeur (par groupe)
    let groupe = [], fin = -1; const groupes = [];
    evs.forEach(x => { if (groupe.length && x.s >= fin) { groupes.push(groupe); groupe = []; fin = -1; } groupe.push(x); fin = Math.max(fin, x.f); });
    if (groupe.length) groupes.push(groupe);
    groupes.forEach(g => {
      const lanes = [];
      g.forEach(x => { let i = lanes.findIndex(l => l.every(y => y.f <= x.s || y.s >= x.f)); if (i < 0) { i = lanes.length; lanes.push([]); } lanes[i].push(x); x.lane = i; });
      g.forEach(x => { x.nb = lanes.length; });
    });
    const blocs = evs.map(({ e, s, f, lane, nb }) => {
      const top = ((s - H0 * 60) / 60) * PH, h = Math.max(24, ((f - s) / 60) * PH - 2);
      const client = lienNom(e.lien);
      return `<div class="tev ${e.fait ? 'done' : ''} ${h < 44 ? 'court' : (nb > 1 ? 'etroit' : '')}" style="--c:var(--${e.activite});top:${top}px;height:${h}px;left:calc(${(lane / nb) * 100}% + 2px);width:calc(${100 / nb}% - 4px)" onclick="${ouvrir(e)}" data-tip="${tip(`${e.heure} · ${e.titre}\n${MODES[e.mode] || ''} · ${hrs(num(e.duree))}${client ? '\n' + client : ''}`)}">
        <b>${esc(e.heure)}</b><span>${esc(e.titre)}</span>${client && h > 48 ? `<small>${esc(client)}</small>` : ''}</div>`;
    }).join('');
    const nowLine = ds === t && nowMin >= H0 * 60 && nowMin <= H1 * 60 ? `<div class="now" style="top:${((nowMin - H0 * 60) / 60) * PH}px"></div>` : '';
    return `<div class="tg-col ${ds === t ? 'today' : ''}" style="height:${(H1 - H0) * PH}px" onclick="if(event.target===this){openEvent(null,'${ds}',null,pad(Math.min(${H1 - 1},Math.floor(event.offsetY/${PH})+${H0}))+':00')}">${blocs}${nowLine}</div>`;
  }).join('');
  return `<div class="card tgrid" style="--cols:${jours.length};--ph:${PH}px">
    <div class="tg-head"><div class="tg-corner"></div>${head}</div>
    ${bandeaux ? `<div class="tg-periodes"><div class="tg-corner meta">Périodes</div>${bandeaux}</div>` : ''}
    <div class="tg-allday"><div class="tg-corner meta">Journée</div>${allday}</div>
    <div class="tg-body">
      <div class="tg-hours">${heures.map(h => `<div style="height:${PH}px">${h} h</div>`).join('')}</div>
      <div class="tg-cols">${cols}</div>
    </div>
  </div>`;
}

/* ---------- Gains et temps ---------- */
function gainsView() {
  tipInit();
  const p = state.prefs.periode, b = bilan(p);
  const donutParts = b.rows.map(r => ({ k: r.k, label: SECTEURS[r.k].label, value: r.gagne }));
  const tempsParts = [...b.rows.map(r => ({ k: r.k, label: SECTEURS[r.k].label, value: r.total })), { k: 'perso', label: SECTEURS.perso.label, value: b.perso.total }];
  const mois = serieMois(6);
  return `
  <div class="page-head">
    <div><h1>Gains et temps</h1><p>Ce que tu gagnes par secteur, et ce que ça te coûte en heures</p></div>
    ${periodeSwitch()}
  </div>
  <div class="grid kpis">
    <div class="card kpi"><div class="label">Gagné</div><div class="value">${esc(eur(b.tot.gagne))}</div><div class="sub">${PERIODES[p].toLowerCase()}</div></div>
    <div class="card kpi"><div class="label">Encore attendu</div><div class="value">${esc(eur(b.tot.prevu))}</div><div class="sub">commissions signées + abonnements</div></div>
    <div class="card kpi"><div class="label">Temps planifié</div><div class="value">${esc(hrs(b.tot.total + b.perso.total))}</div><div class="sub">${esc(hrs(b.tot.total))} pro · ${esc(hrs(b.perso.total))} perso · ${esc(hrs(b.tot.fait))} réalisées</div></div>
    <div class="card kpi"><div class="label">Gain par heure</div><div class="value">${esc(parHeure(b.tot.gagne, b.tot.total))}</div><div class="sub">sur ${esc(hrs(b.tot.total))} d'heures pro</div></div>
  </div>
  <div class="grid cols-2 charts-row">
    <div class="card"><div class="card-head"><div><h2>Répartition des gains</h2><p class="meta">Encaissé · ${PERIODES[p].toLowerCase()}</p></div></div>${donut(donutParts, eur, `Encaissé · ${PERIODES[p].toLowerCase()}`)}</div>
    <div class="card"><div class="card-head"><div><h2>Répartition du temps</h2><p class="meta">Heures planifiées · ${PERIODES[p].toLowerCase()}, perso compris</p></div></div>${donut(tempsParts, hrs, 'Planifié, perso compris')}</div>
  </div>
  <div class="card chart-card">
    <div class="card-head"><div><h2>Gains par mois</h2><p class="meta">Encaissé sur les 6 derniers mois, par secteur</p></div></div>
    ${colonnes(mois, { fmt: eur, fmtTick: eurTick, minW: 760, vide: 'Aucun encaissement sur les 6 derniers mois.', aria: 'Gains par mois' })}
  </div>
  <div class="card sect-rows only-sm">
    ${b.rows.map(r => `<div class="sect-row"><div class="sr-head">${tag(r.k)}<b>${esc(eur(r.gagne))}</b></div><div class="meta">${esc(eur(r.prevu))} attendu · ${esc(hrs(r.total))} · ${r.rdv} RDV · ${esc(parHeure(r.gagne, r.total))} / h</div></div>`).join('')}
    <div class="sect-row"><div class="sr-head">${tag('perso')}<b>—</b></div><div class="meta">${esc(hrs(b.perso.total))} · ${b.perso.rdv} RDV</div></div>
    <div class="sect-row total"><div class="sr-head"><span>Ensemble pro</span><b>${esc(eur(b.tot.gagne))}</b></div><div class="meta">${esc(eur(b.tot.prevu))} attendu · ${esc(hrs(b.tot.total))} · ${b.tot.rdv} RDV · ${esc(parHeure(b.tot.gagne, b.tot.total))} / h</div></div>
  </div>
  <div class="card table-wrap hide-sm">
    <table>
      <thead><tr><th>Secteur</th><th class="num">Gagné</th><th class="num">Attendu</th><th class="num">Temps planifié</th><th class="num">RDV</th><th class="num">€ / heure</th></tr></thead>
      <tbody>${b.rows.map(r => `<tr>
        <td>${tag(r.k)}</td><td class="num"><strong>${esc(eur(r.gagne))}</strong></td><td class="num">${esc(eur(r.prevu))}</td>
        <td class="num">${esc(hrs(r.total))}</td><td class="num">${r.rdv}</td><td class="num">${esc(parHeure(r.gagne, r.total))}</td></tr>`).join('')}
      <tr class="muted-row"><td>${tag('perso')}</td><td class="num">—</td><td class="num">—</td><td class="num">${esc(hrs(b.perso.total))}</td><td class="num">${b.perso.rdv}</td><td class="num">—</td></tr>
      </tbody>
      <tfoot><tr><td>Ensemble pro <span class="meta">(hors perso)</span></td><td class="num">${esc(eur(b.tot.gagne))}</td><td class="num">${esc(eur(b.tot.prevu))}</td><td class="num">${esc(hrs(b.tot.total))}</td><td class="num">${b.tot.rdv}</td><td class="num">${esc(parHeure(b.tot.gagne, b.tot.total))}</td></tr></tfoot>
    </table>
  </div>
  <p class="note">Le temps est le temps planifié : la durée de chaque RDV et tâche du planning sur la période, RDV à venir compris. Le total « pro » exclut Perso / Groupe. KamiFood compte un mois d'abonnement par mois actif (hors période d'essai). L'apport d'affaires compte les commissions reçues à leur date de paiement.</p>`;
}
