const SUPABASE_URL = process.env.SUPABASE_URL || 'https://asuccniyofzvwgooxjah.supabase.co';

const SYS = `Tu es un ingénieur géotechnicien expert. À partir des résumés de plusieurs études de sol réalisées autour d'un même secteur géographique, produis une synthèse géotechnique globale qui dégage les tendances et caractéristiques communes du secteur.

Réponds en JSON strict sans Markdown :
{
  "synthese": string (paragraphe de 5 à 10 phrases, HTML simple <b>/<br> autorisé — décris la nature des sols dominants, les risques géotechniques récurrents, les types de fondations généralement préconisés, la présence éventuelle de nappe, les contraintes communes),
  "points_cles": [string] (3 à 6 points clés résumant les tendances majeures, phrases courtes)
}`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY non configurée' });

  const { summaries, lat, lon, radius } = req.body || {};
  if (!summaries || !summaries.length) return res.status(400).json({ error: 'summaries manquants' });

  try {
    const text = summaries.map((s, i) => `--- ÉTUDE ${i + 1} ---\nRésumé : ${s.resume || '(vide)'}\nConclusion : ${s.conclusion || '(vide)'}`).join('\n\n');

    const ar = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system: SYS,
        messages: [{ role: 'user', content: `Secteur : lat ${lat}, lon ${lon}, rayon ${radius} m.\n\n${summaries.length} études analysées :\n\n${text}` }]
      })
    });
    const aj = await ar.json().catch(() => ({}));
    if (!ar.ok) throw new Error('Anthropic ' + ar.status + ': ' + (aj.error?.message || JSON.stringify(aj)));
    const txt = (aj.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const cleaned = txt.replace(/```json|```/g, '').trim();
    let o;
    try { o = JSON.parse(cleaned); }
    catch (e) { o = { synthese: txt || '(synthèse indisponible)', points_cles: [] }; }
    return res.status(200).json(o);
  } catch (e) {
    console.error('ged-synthesis error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
