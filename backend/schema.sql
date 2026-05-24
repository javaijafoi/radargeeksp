-- Schema puro para Radar Geek SP (Estrutura e Segurança apenas)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Remover tabelas antigas para evitar conflito com schemas anteriores
DROP TABLE IF EXISTS eventos CASCADE;
DROP TABLE IF EXISTS locais_fixos CASCADE;
DROP TABLE IF EXISTS historico_scraping CASCADE;

-- 1. Tabela de Locais Fixos (As Bases)
CREATE TABLE locais_fixos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome TEXT NOT NULL,
    descricao TEXT,
    tags_consumo TEXT[] DEFAULT '{}',
    distancia_mooca INTEGER NOT NULL,
    bairro TEXT,
    imagem_hero_path TEXT
);

-- 2. Tabela de Eventos (A Agenda Sazonal)
CREATE TABLE eventos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    local_id UUID REFERENCES locais_fixos(id) ON DELETE SET NULL,
    titulo TEXT NOT NULL,
    descricao TEXT,
    data_hora TIMESTAMP WITH TIME ZONE NOT NULL,
    ia_score_cilada INTEGER CHECK (ia_score_cilada >= 1 AND ia_score_cilada <= 10),
    kid_friendly BOOLEAN DEFAULT false,
    bairro TEXT,
    imagem_flyer_path TEXT
);

-- 3. Tabela de Histórico de Scraping (Para painel de logs)
CREATE TABLE historico_scraping (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    executado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    sucesso BOOLEAN NOT NULL,
    locais_processados INTEGER DEFAULT 0,
    eventos_novos INTEGER DEFAULT 0,
    logs TEXT
);

-- Configurações de Segurança e Acesso (RLS)
ALTER TABLE locais_fixos ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE historico_scraping ENABLE ROW LEVEL SECURITY;

-- Políticas para leitura pública (Evitar erros se políticas já existirem)
DROP POLICY IF EXISTS "Leitura pública locais_fixos" ON locais_fixos;
CREATE POLICY "Leitura pública locais_fixos" ON locais_fixos FOR SELECT USING (true);

DROP POLICY IF EXISTS "Leitura pública eventos" ON eventos;
CREATE POLICY "Leitura pública eventos" ON eventos FOR SELECT USING (true);

DROP POLICY IF EXISTS "Leitura pública historico_scraping" ON historico_scraping;
CREATE POLICY "Leitura pública historico_scraping" ON historico_scraping FOR SELECT USING (true);

-- 4. Tabela de Configurações do Scraper
CREATE TABLE IF NOT EXISTS scraper_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    search_queries JSONB DEFAULT '["eventos geek são paulo final de semana", "rpg de mesa sp", "hamburgueria tematica nerd sp"]'::jsonb,
    gemini_prompt TEXT DEFAULT 'Você é um robô extrator de dados. Analise os seguintes resultados de busca (URLs, Títulos e Trechos).
Extraia os eventos geek e os locais geek de São Paulo que encontrar. 
Crie datas e horários realistas baseados nos próximos dias para os eventos se não houver data exata.
Invente (ou infira) as imagens baseadas em URLs do Unsplash (ex: https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?q=80&w=600).

Retorne APENAS um JSON válido com esta estrutura:
{
  "locais": [
    {"nome": "Nome do Local", "descricao": "Breve info", "tags_consumo": ["tag1", "tag2"], "distancia_mooca": 20, "bairro": "Nome do Bairro", "imagem_hero_path": "url"}
  ],
  "eventos": [
    {"titulo": "Nome", "descricao": "Breve info", "data_hora": "YYYY-MM-DDTHH:MM:SSZ", "ia_score_cilada": 7, "kid_friendly": false, "bairro": "Nome do Bairro", "imagem_flyer_path": "url", "local_nome": "Nome do Local"}
  ]
}'
);

ALTER TABLE scraper_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura pública scraper_config" ON scraper_config;
CREATE POLICY "Leitura pública scraper_config" ON scraper_config FOR SELECT USING (true);

-- Permite update para usuários autenticados via Supabase Auth
DROP POLICY IF EXISTS "Update scraper_config" ON scraper_config;
CREATE POLICY "Update scraper_config" ON scraper_config FOR UPDATE USING (auth.role() = 'authenticated');

INSERT INTO scraper_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;


