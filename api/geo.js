// Proxy serveur allowlisté pour les services BRGM / Géorisques.
// But : contourner les filtrages réseau (proxy d'entreprise, pare-feu),
// les blocages d'extensions et les restrictions CORS côté poste client.
// Le navigateur n'appelle plus que ce point /api/geo ; c'est le serveur
// Vercel qui interroge le BRGM, puis renvoie la réponse (JSON, XML ou image).
//
// Usage client :
//   /api/geo?url=<URL BRGM/Géorisques entièrement encodée>
//   (tout paramètre supplémentaire est réinjecté dans l'URL cible —
//    pratique pour les tuiles WMS générées par Leaflet).

const ALLOW = ['brgm.fr', 'georisques.gouv.fr', 'geopf.fr', 'cartes.gouv.fr'];

function isAllowed(host) {
  return ALLOW.some((d) => host === d || host.endsWith('.' + d));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET uniquement' });

  const base = req.query.url;
  if (!base || typeof base !== 'string') {
    return res.status(400).json({ error: 'Paramètre « url » manquant' });
  }

  let target;
  try {
    target = new URL(base);
  } catch (e) {
    return res.status(400).json({ error: 'URL invalide' });
  }

  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    return res.status(400).json({ error: 'Protocole non autorisé' });
  }
  if (!isAllowed(target.hostname)) {
    return res.status(403).json({ error: 'Hôte non autorisé : ' + target.hostname });
  }

  // Réinjecte les éventuels paramètres additionnels (cas des tuiles WMS Leaflet
  // qui ajoutent SERVICE, BBOX, etc. à la suite de l'URL de base).
  for (const [k, v] of Object.entries(req.query)) {
    if (k === 'url') continue;
    const vals = Array.isArray(v) ? v : [v];
    for (const vv of vals) target.searchParams.append(k, vv);
  }

  const accept = req.headers['accept'] || '*/*';

  async function grab(urlStr) {
    const up = await fetch(urlStr, {
      headers: {
        'User-Agent': 'GeoCarto-Proxy/1.0 (+https://geocarto.vercel.app)',
        'Accept': accept,
      },
      signal: AbortSignal.timeout(25000),
    });
    const buf = Buffer.from(await up.arrayBuffer());
    const ct = up.headers.get('content-type') || 'application/octet-stream';
    return { status: up.status, ct, buf };
  }

  // Le WAF du geocache BRGM renvoie une page HTML « Request Rejected » (souvent
  // en HTTP 200) au lieu du contenu attendu. On la détecte pour pouvoir réessayer.
  function wafRejected(r) {
    const head = r.buf.slice(0, 1500).toString('utf8');
    return /Request Rejected|The requested URL was rejected|Support ID/i.test(head);
  }

  const isBrgm = target.hostname === 'brgm.fr' || target.hostname.endsWith('.brgm.fr');

  try {
    let r = await grab(target.toString());

    // Contournement WAF BRGM : si le HTTPS est rejeté, on retente en HTTP.
    // C'est sûr ici car l'appel se fait côté SERVEUR (le navigateur ne parle
    // qu'à /api/geo en HTTPS → aucun « mixed content »).
    if (isBrgm && target.protocol === 'https:' && wafRejected(r)) {
      const httpTarget = new URL(target.toString());
      httpTarget.protocol = 'http:';
      try {
        const r2 = await grab(httpTarget.toString());
        if (!wafRejected(r2)) r = r2;
      } catch (e) { /* on conserve la réponse HTTPS d'origine */ }
    }

    res.setHeader('Content-Type', r.ct);
    // Cache court côté CDN Vercel : soulage les serveurs BRGM et accélère les
    // requêtes répétées (mêmes points, mêmes tuiles).
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(r.status).send(r.buf);
  } catch (e) {
    const msg = e && e.name === 'TimeoutError' ? 'délai dépassé' : (e && e.message) || 'échec';
    return res.status(502).json({ error: 'Proxy BRGM/Géorisques : ' + msg, host: target.hostname });
  }
}
