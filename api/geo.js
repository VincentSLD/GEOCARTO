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

const ALLOW = ['brgm.fr', 'georisques.gouv.fr'];

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

  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        'User-Agent': 'GeoCarto-Proxy/1.0 (+https://geocarto.vercel.app)',
        'Accept': req.headers['accept'] || '*/*',
      },
      signal: AbortSignal.timeout(25000),
    });

    const ct = upstream.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', ct);
    // Cache court côté CDN Vercel : soulage les serveurs BRGM et accélère les
    // requêtes répétées (mêmes points, mêmes tuiles).
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.status(upstream.status).send(buf);
  } catch (e) {
    const msg = e && e.name === 'TimeoutError' ? 'délai dépassé' : (e && e.message) || 'échec';
    return res.status(502).json({ error: 'Proxy BRGM/Géorisques : ' + msg, host: target.hostname });
  }
}
