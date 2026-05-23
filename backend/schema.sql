-- Schema para Radar Geek SP

-- Tabela de Locais Fixos (As Bases)
CREATE TABLE locais_fixos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome TEXT NOT NULL,
    tags_consumo TEXT[] DEFAULT '{}',
    distancia_mooca INTEGER NOT NULL,
    imagem_hero_path TEXT
);

-- Tabela de Eventos (A Agenda Sazonal)
CREATE TABLE eventos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    local_id UUID REFERENCES locais_fixos(id) ON DELETE SET NULL,
    titulo TEXT NOT NULL,
    data_hora TIMESTAMP WITH TIME ZONE NOT NULL,
    ia_score_cilada INTEGER CHECK (ia_score_cilada >= 1 AND ia_score_cilada <= 10),
    kid_friendly BOOLEAN DEFAULT false,
    imagem_flyer_path TEXT
);

-- Configurações de Segurança e Acesso (RLS)
-- Como o app é apenas leitura, vamos permitir leitura pública (anon) e inserção/atualização apenas pelo scraper autenticado.

ALTER TABLE locais_fixos ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos ENABLE ROW LEVEL SECURITY;

-- Políticas para leitura pública
CREATE POLICY "Leitura pública locais_fixos" 
ON locais_fixos FOR SELECT 
USING (true);

CREATE POLICY "Leitura pública eventos" 
ON eventos FOR SELECT 
USING (true);

-- As políticas de inserção (para o scraper) seriam restritas à roles de serviço.
-- Utilizaremos a chave de serviço (service_role_key) no scraper Python, que bypassa RLS.
