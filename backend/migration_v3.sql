-- ═══════════════════════════════════════════════════════════════════
-- RADAR GEEK SP — Migração v3: Fila de Staging (scraper_queue)
-- Cole este SQL no Supabase Dashboard → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS scraper_queue (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    url           TEXT UNIQUE NOT NULL,
    titulo        TEXT,
    descricao     TEXT,
    conteudo_texto TEXT,
    og_image      TEXT,
    status        TEXT DEFAULT 'pending', -- 'pending', 'processed', 'failed'
    tentativas    INTEGER DEFAULT 0,
    criado_em     TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE scraper_queue ENABLE ROW LEVEL SECURITY;

-- Leitura pública para auditoria
DROP POLICY IF EXISTS "Leitura publica scraper_queue" ON scraper_queue;
CREATE POLICY "Leitura publica scraper_queue" ON scraper_queue FOR SELECT USING (true);

-- Controle total via service_role (robô do scraper)
DROP POLICY IF EXISTS "Service role scraper_queue" ON scraper_queue;
CREATE POLICY "Service role scraper_queue" ON scraper_queue
  FOR ALL USING (auth.role() = 'service_role');
