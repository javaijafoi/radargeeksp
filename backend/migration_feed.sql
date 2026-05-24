-- Tabela de Feed Manual do Scraper
-- Cole este SQL no Supabase Dashboard → SQL Editor → Run

CREATE TABLE IF NOT EXISTS scraper_feed (
    id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    url       TEXT NOT NULL,
    titulo    TEXT,
    ativo     BOOLEAN DEFAULT true,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE scraper_feed ENABLE ROW LEVEL SECURITY;

-- Leitura pública (app Android pode listar se quiser)
DROP POLICY IF EXISTS "Leitura pública scraper_feed" ON scraper_feed;
CREATE POLICY "Leitura pública scraper_feed" ON scraper_feed FOR SELECT USING (true);

-- INSERT/UPDATE/DELETE para service_role (CLI/backend) e authenticated (dashboard web)
DROP POLICY IF EXISTS "Service role scraper_feed" ON scraper_feed;
CREATE POLICY "Service role scraper_feed" ON scraper_feed
  FOR ALL USING (auth.role() = 'service_role' OR auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'authenticated');
