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
