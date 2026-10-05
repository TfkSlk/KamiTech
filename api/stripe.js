/*
 * Stripe — lecture seule des abonnements et encaissements KamiFood pour le KGD.
 *
 * Variables Vercel :
 *   STRIPE_LECTURE_KEY  clé restreinte (rk_live_…) en lecture seule : Customers, Subscriptions, Invoices, Products.
 *   STRIPE_PRODUIT      (facultatif) filtre : id de produit (prod_…) ou morceau du nom, ex. "kamifood".
 *                       La facturation de KGD Pro restera séparée : autre produit, ou autre compte Stripe.
 *   JARVIS_TOKEN        le même jeton que pour Kami protège cet accès.
 * Ne stocke rien : renvoie une photo du moment, que le tableau de bord fusionne avec ses abonnés.
 */
const API = 'https://api.stripe.com/v1';

async function stripeGet(path, params, key, fetchImpl) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) (Array.isArray(v) ? v : [v]).forEach(x => q.append(k, x));
  const r = await fetchImpl(`${API}${path}?${q}`, { headers: { authorization: `Bearer ${key}` } });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || `Stripe ${r.status}`);
  return j;
}
async function tout(path, params, key, fetchImpl, max = 1000) {
  const out = [];
  let after;
  for (;;) {
    const page = await stripeGet(path, { limit: '100', ...params, ...(after ? { starting_after: after } : {}) }, key, fetchImpl);
    out.push(...page.data);
    if (!page.has_more || out.length >= max) return out;
    after = page.data[page.data.length - 1].id;
  }
}
const jour = ts => ts ? new Date(ts * 1000).toISOString().slice(0, 10) : '';
const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/* Mensualise un prix Stripe (annuel → /12, hebdo → ×52/12), en euros HT si Stripe gère la taxe en sus */
function mensuel(price, quantite = 1) {
  if (!price || !price.unit_amount) return 0;
  const r = price.recurring || {};
  const n = r.interval_count || 1;
  const parMois = r.interval === 'year' ? 1 / (12 * n) : r.interval === 'week' ? 52 / (12 * n) : r.interval === 'day' ? 365 / (12 * n) : 1 / n;
  return Math.round(price.unit_amount * quantite * parMois) / 100;
}
/* Stripe n'autorise que 4 niveaux d'expansion : les produits sont lus à part, par leurs ids */
function produitDe(item, produits) {
  const p = item.price?.product;
  const id = typeof p === 'object' && p ? p.id : (p || '');
  const nom = (typeof p === 'object' && p?.name) || produits.get(id) || '';
  return { id, nom };
}
async function lireProduits(subs, key, fetchImpl) {
  const ids = [...new Set(subs.flatMap(s => (s.items?.data || []).map(it => { const p = it.price?.product; return typeof p === 'object' ? p?.id : p; })).filter(Boolean))];
  const map = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const page = await stripeGet('/products', { limit: '100', 'ids[]': ids.slice(i, i + 100) }, key, fetchImpl);
    for (const p of page.data) map.set(p.id, p.name || '');
  }
  return map;
}
function garder(sub, filtre, produits) {
  if (!filtre) return true;
  const f = norm(filtre);
  return (sub.items?.data || []).some(it => { const p = produitDe(it, produits); return p.id === filtre || norm(p.nom).includes(f) || norm(it.price?.nickname).includes(f); });
}

export async function lireStripe({ key, filtre, fetchImpl = fetch, depuis }) {
  const subs = await tout('/subscriptions', { status: 'all', 'expand[]': ['data.customer'] }, key, fetchImpl);
  const produits = await lireProduits(subs, key, fetchImpl);
  const gardes = subs.filter(s => garder(s, filtre, produits));
  const clients = new Set(gardes.map(s => typeof s.customer === 'object' ? s.customer.id : s.customer));
  const abonnes = gardes.map(s => {
    const c = typeof s.customer === 'object' && s.customer ? s.customer : { id: s.customer };
    const items = s.items?.data || [];
    const prix = items.reduce((t, it) => t + mensuel(it.price, it.quantity || 1), 0);
    const statut = ['active', 'past_due', 'unpaid'].includes(s.status) ? 'actif' : s.status === 'trialing' ? 'essai' : 'resilie';
    return {
      stripeId: s.id, stripeClient: c.id,
      restaurant: c.name || c.description || c.email || s.id, email: c.email || '', tel: c.phone || '',
      formuleNom: items.map(it => it.price?.nickname || produitDe(it, produits).nom).filter(Boolean).join(' + '),
      prix, statut, stripeStatut: s.status,
      debut: jour(s.start_date), fin: jour(s.ended_at || s.canceled_at),
      impaye: ['past_due', 'unpaid'].includes(s.status),
    };
  });
  const invParams = { status: 'paid', ...(depuis ? { 'created[gte]': String(depuis) } : {}) };
  const factures = (await tout('/invoices', invParams, key, fetchImpl, 2000))
    .filter(i => !filtre || clients.has(typeof i.customer === 'object' ? i.customer.id : i.customer) || (i.lines?.data || []).some(l => norm(l.description).includes(norm(filtre))))
    .map(i => ({
      id: i.id, client: typeof i.customer === 'object' ? i.customer.id : i.customer, abonnement: typeof i.subscription === 'object' ? i.subscription?.id : i.subscription,
      date: jour(i.status_transitions?.paid_at || i.created),
      ht: ((i.subtotal_excluding_tax ?? i.total_excluding_tax ?? i.subtotal ?? i.amount_paid) || 0) / 100,
      ttc: (i.amount_paid || 0) / 100,
    }));
  const mrr = abonnes.filter(a => a.statut === 'actif').reduce((t, a) => t + a.prix, 0);
  return { abonnes, factures, mrr, filtre: filtre || '', sync: new Date().toISOString() };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') return res.status(200).json({ ok: true, cleDefinie: !!process.env.STRIPE_LECTURE_KEY, filtre: process.env.STRIPE_PRODUIT || '' });
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'méthode non autorisée' });
  if (!process.env.JARVIS_TOKEN) return res.status(500).json({ erreur: "JARVIS_TOKEN n'est pas défini sur Vercel." });
  if ((req.headers['x-jarvis-token'] || '') !== process.env.JARVIS_TOKEN) return res.status(401).json({ erreur: 'Jeton invalide. Vérifie-le dans Réglages.' });
  const key = process.env.STRIPE_LECTURE_KEY;
  if (!key) return res.status(500).json({ erreur: "STRIPE_LECTURE_KEY n'est pas définie sur Vercel. Crée une clé restreinte en lecture seule dans Stripe (Développeurs → Clés API) et ajoute-la dans Settings → Environment Variables, puis redéploie." });
  if (!/^rk_/.test(key)) return res.status(500).json({ erreur: 'La clé doit être une clé restreinte (rk_…), pas une clé secrète complète.' });
  try {
    const depuis = Math.floor(Date.now() / 1000) - 400 * 86400;
    const out = await lireStripe({ key, filtre: process.env.STRIPE_PRODUIT, depuis });
    return res.status(200).json(out);
  } catch (e) {
    return res.status(502).json({ erreur: `Stripe : ${e.message || e}` });
  }
}
