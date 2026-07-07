const SUPABASE_URL = process.env.SUPABASE_URL || 'https://asuccniyofzvwgooxjah.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzdWNjbml5b2Z6dndnb294amFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MDQyNjgsImV4cCI6MjA4ODQ4MDI2OH0.dPerW1BApAxe26xzv9i7oWIubgGuzO5RibMvs-MFm88';

const SYS = `Tu es un ingénieur géotechnicien. À partir des extraits d'un rapport d'étude de sol, produis DEUX résumés et une fiche simplifiée. Base-toi uniquement sur le texte fourni. Réponds en JSON strict sans Markdown :
{
  "resume": string (3 à 5 phrases, HTML simple <b>/<br> autorisé),
  "conclusion": string (conclusions et recommandations clés ; chaîne vide si absentes),
  "fiche": {
    "societe": string (nom du bureau d'études ou société qui a réalisé le rapport ; chaîne vide si non trouvé),
    "type_mission": string (ex: G2 AVP, G2 PRO, G1 ES, G1 PGC, G5… chaîne vide si non trouvé),
    "client": string (nom du client/maître d'ouvrage ; chaîne vide si non trouvé),
    "type_fondation": string (superficielles, semi-profondes, profondes, radier… chaîne vide si non trouvé),
    "sol_fondation": string (nature du sol de fondation : argile, marne, calcaire, sable… chaîne vide si non trouvé),
    "profondeur_encastrement": string (profondeur d'encastrement préconisée ex: "1.20 m" ; chaîne vide si non trouvé),
    "susceptibilite_sol": string (retrait-gonflement, liquéfaction, dissolution… chaîne vide si non trouvé),
    "contrainte_sol": string (valeur de la contrainte admissible ou ELS/ELU ex: "0.15 MPa" ; chaîne vide si non trouvé),
    "essais_labo": string ("Oui" ou "Non" ou détail si mentionné),
    "profondeur_refus": string (profondeur de refus ou arrêt des pénétromètres ex: "3.5 m" ; chaîne vide si non trouvé),
    "classe_sismique": string (classe de sol sismique ex: "B", "C"… chaîne vide si non trouvé),
    "essais_pressio": boolean (true si des essais pressiométriques ont été réalisés, false sinon)
  }
}`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY non configurée' });

  const { document_id } = req.body || {};
  if (!document_id) return res.status(400).json({ error: 'document_id manquant' });

  try {
    const cr = await fetch(SUPABASE_URL + '/rest/v1/ged_chunks?select=content,chunk_index&document_id=eq.' + encodeURIComponent(document_id) + '&order=chunk_index.asc&limit=40', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    const chunks = await cr.json();
    if (!cr.ok) throw new Error('Supabase : ' + JSON.stringify(chunks));
    if (!Array.isArray(chunks) || !chunks.length) return res.status(200).json({ resume: '(aucun contenu indexé pour ce document)', conclusion: '' });

    const text = chunks.map(c => c.content).join('\n').slice(0, 30000);

    const ar = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system: SYS,
        messages: [{ role: 'user', content: 'RAPPORT (extraits) :\n' + text }]
      })
    });
    const aj = await ar.json().catch(() => ({}));
    if (!ar.ok) throw new Error('Anthropic ' + ar.status + ': ' + (aj.error?.message || JSON.stringify(aj)));
    const txt = (aj.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const cleaned = txt.replace(/```json|```/g, '').trim();
    let o;
    try { o = JSON.parse(cleaned); }
    catch (e) { o = { resume: txt || '(résumé indisponible)', conclusion: '', fiche: null }; }
    if (aj.usage) o.usage = { input_tokens: aj.usage.input_tokens || 0, output_tokens: aj.usage.output_tokens || 0 };
    return res.status(200).json(o);
  } catch (e) {
    console.error('ged-summary error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
