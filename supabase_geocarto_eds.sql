-- ═══════════════════════════════════════════════════════
-- Table geocarto_eds : points d'enquete de terrain (EDS)
-- A executer dans le SQL Editor de Supabase
-- ═══════════════════════════════════════════════════════

-- 1. Creer la table
CREATE TABLE IF NOT EXISTS geocarto_eds (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  dossier TEXT,
  reference TEXT,
  nom TEXT NOT NULL,
  adresse TEXT,
  code_postal TEXT,
  ville TEXT,
  categorie TEXT,
  notes TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Index pour les recherches geographiques (proximite)
CREATE INDEX IF NOT EXISTS idx_geocarto_eds_coords ON geocarto_eds (latitude, longitude);

-- 3. Index pour la recherche textuelle
CREATE INDEX IF NOT EXISTS idx_geocarto_eds_nom ON geocarto_eds USING gin (to_tsvector('french', coalesce(nom, '')));

-- 4. Activer RLS
ALTER TABLE geocarto_eds ENABLE ROW LEVEL SECURITY;

-- 5. Policy : tous les utilisateurs authentifies peuvent lire tous les points
DROP POLICY IF EXISTS "Authenticated users can read all eds" ON geocarto_eds;
CREATE POLICY "Authenticated users can read all eds" ON geocarto_eds
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- 6. Policy : les utilisateurs authentifies peuvent inserer des points
DROP POLICY IF EXISTS "Authenticated users can insert eds" ON geocarto_eds;
CREATE POLICY "Authenticated users can insert eds" ON geocarto_eds
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- 7. Policy : les utilisateurs peuvent modifier leurs propres points
DROP POLICY IF EXISTS "Users can update own eds" ON geocarto_eds;
CREATE POLICY "Users can update own eds" ON geocarto_eds
  FOR UPDATE
  USING (created_by = auth.uid() OR created_by IS NULL);

-- 8. Policy : les utilisateurs peuvent supprimer leurs propres points
DROP POLICY IF EXISTS "Users can delete own eds" ON geocarto_eds;
CREATE POLICY "Users can delete own eds" ON geocarto_eds
  FOR DELETE
  USING (created_by = auth.uid() OR created_by IS NULL);
