-- ═══════════════════════════════════════════════════════════════════
-- RADAR GEEK SP — Migração v2: novos campos + limpeza de dados
-- Cole este SQL no Supabase Dashboard → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════════

-- 1. Limpar todos os dados existentes (recriar do zero)
DELETE FROM eventos;
DELETE FROM locais_fixos;
DELETE FROM historico_scraping;

-- 2. Adicionar novos campos em locais_fixos
ALTER TABLE locais_fixos ADD COLUMN IF NOT EXISTS endereco       TEXT;
ALTER TABLE locais_fixos ADD COLUMN IF NOT EXISTS preco_medio    TEXT;
ALTER TABLE locais_fixos ADD COLUMN IF NOT EXISTS fonte_url      TEXT;
ALTER TABLE locais_fixos ADD COLUMN IF NOT EXISTS ia_inferido    BOOLEAN DEFAULT false;

-- 3. Adicionar novos campos em eventos
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS endereco       TEXT;
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS preco_entrada  TEXT;
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS fonte_url      TEXT;
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS ia_inferido    BOOLEAN DEFAULT false;

-- 4. Criar tabela scraper_feed (se ainda não existir)
CREATE TABLE IF NOT EXISTS scraper_feed (
    id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    url       TEXT NOT NULL,
    titulo    TEXT,
    ativo     BOOLEAN DEFAULT true,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE scraper_feed ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura publica scraper_feed" ON scraper_feed;
CREATE POLICY "Leitura publica scraper_feed" ON scraper_feed FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role scraper_feed" ON scraper_feed;
CREATE POLICY "Service role scraper_feed" ON scraper_feed
  FOR ALL USING (auth.role() = 'service_role');

-- Confirmação
SELECT 'Migração v2 concluída com sucesso!' as status;
