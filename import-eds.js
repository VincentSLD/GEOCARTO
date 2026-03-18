/**
 * Script d'import des points EDS depuis Carte_EDS_V1.csv vers Supabase
 *
 * Usage:
 *   1. npm install (si pas deja fait)
 *   2. node import-eds.js
 *
 * Variables d'environnement requises:
 *   SUPABASE_SERVICE_ROLE_KEY  — la service role key Supabase
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const SUPABASE_URL = 'https://asuccniyofzvwgooxjah.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('❌ Variable SUPABASE_SERVICE_ROLE_KEY requise.');
  console.error('   Usage: SUPABASE_SERVICE_ROLE_KEY=eyJ... node import-eds.js');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

// Parse CSV manuellement (les champs peuvent contenir des ; et des retours a la ligne entre guillemets)
function parseCsv(text) {
  const rows = [];
  let headers = null;
  let i = 0;

  function readField() {
    if (i >= text.length) return '';
    if (text[i] === '"') {
      // Champ entre guillemets
      i++; // skip opening "
      let val = '';
      while (i < text.length) {
        if (text[i] === '"') {
          if (i + 1 < text.length && text[i + 1] === '"') {
            val += '"';
            i += 2;
          } else {
            i++; // skip closing "
            break;
          }
        } else {
          val += text[i];
          i++;
        }
      }
      return val;
    } else {
      // Champ simple (pas de guillemets)
      let val = '';
      while (i < text.length && text[i] !== ';' && text[i] !== '\n' && text[i] !== '\r') {
        val += text[i];
        i++;
      }
      return val;
    }
  }

  while (i < text.length) {
    const fields = [];
    while (i < text.length) {
      fields.push(readField());
      if (i < text.length && text[i] === ';') {
        i++; // skip separator
      } else {
        // End of line
        if (text[i] === '\r') i++;
        if (text[i] === '\n') i++;
        break;
      }
    }
    if (!headers) {
      headers = fields;
    } else if (fields.length >= 2) {
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = fields[idx] || ''; });
      rows.push(obj);
    }
  }
  return rows;
}

async function main() {
  console.log('📂 Lecture de Carte_EDS_V1.csv...');
  const text = readFileSync('./Carte_EDS_V1.csv', 'utf-8');
  const data = parseCsv(text);
  console.log(`   ${data.length} lignes parsees.`);

  // Filtrer les points avec des coordonnees valides
  const valid = data.filter(r => {
    const lat = parseFloat((r.Latitude || '').replace(',', '.'));
    const lng = parseFloat((r.Longitude || '').replace(',', '.'));
    return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
  });
  console.log(`   ${valid.length} points avec coordonnees valides.`);

  // Preparer les lignes pour Supabase
  const rows = valid.map(r => ({
    dossier: r.Dossier || null,
    reference: r['Référence'] || null,
    nom: (r.Nom || '').trim() || 'Sans nom',
    adresse: r.Adresse || null,
    code_postal: r['Code Postal'] || null,
    ville: r.Ville || null,
    categorie: r['Catégorie'] || null,
    notes: r.Notes || r['Description brute'] || null,
    latitude: parseFloat((r.Latitude || '').replace(',', '.')),
    longitude: parseFloat((r.Longitude || '').replace(',', '.')),
    created_by: null,  // Import initial, pas d'auteur
  }));

  // Inserer par lots de 500
  const BATCH = 500;
  let inserted = 0;
  let errors = 0;

  for (let start = 0; start < rows.length; start += BATCH) {
    const batch = rows.slice(start, start + BATCH);
    const { error } = await sb.from('geocarto_eds').insert(batch);
    if (error) {
      console.error(`   ❌ Erreur lot ${start}-${start + batch.length}: ${error.message}`);
      errors++;
    } else {
      inserted += batch.length;
      process.stdout.write(`\r   ✅ ${inserted} / ${rows.length} inseres...`);
    }
  }

  console.log('');
  console.log(`\n🎉 Import termine : ${inserted} points inseres, ${errors} erreurs.`);

  // Importer aussi les points du XML eds_additions.xml s'il existe
  try {
    const xml = readFileSync('./eds_additions.xml', 'utf-8');
    const parser = new DOMParser();
    // Node.js n'a pas DOMParser, on parse manuellement
    const xmlRows = [];
    const regex = /<point>([\s\S]*?)<\/point>/g;
    let match;
    while ((match = regex.exec(xml)) !== null) {
      const block = match[1];
      const g = tag => { const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`)); return m ? m[1].trim() : ''; };
      const lat = parseFloat(g('Latitude'));
      const lng = parseFloat(g('Longitude'));
      if (isNaN(lat) || isNaN(lng)) continue;
      xmlRows.push({
        dossier: g('Dossier') || null,
        reference: g('Reference') || null,
        nom: g('Nom') || 'Sans nom',
        adresse: g('Adresse') || null,
        code_postal: g('Code_Postal') || null,
        ville: g('Ville') || null,
        categorie: g('Categorie') || null,
        notes: g('Notes') || null,
        latitude: lat,
        longitude: lng,
        created_by: null,
      });
    }
    if (xmlRows.length > 0) {
      const { error } = await sb.from('geocarto_eds').insert(xmlRows);
      if (error) {
        console.error(`   ❌ Erreur import XML: ${error.message}`);
      } else {
        console.log(`   ✅ ${xmlRows.length} points importes depuis eds_additions.xml`);
      }
    }
  } catch (e) {
    console.log('   ℹ️  Pas de eds_additions.xml a importer (ou fichier absent).');
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
