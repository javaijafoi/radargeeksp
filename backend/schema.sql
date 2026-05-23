-- Schema para Radar Geek SP
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabela de Locais Fixos (As Bases)
CREATE TABLE IF NOT EXISTS locais_fixos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome TEXT NOT NULL,
    tags_consumo TEXT[] DEFAULT '{}',
    distancia_mooca INTEGER NOT NULL,
    imagem_hero_path TEXT
);

-- Tabela de Eventos (A Agenda Sazonal)
CREATE TABLE IF NOT EXISTS eventos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    local_id UUID REFERENCES locais_fixos(id) ON DELETE SET NULL,
    titulo TEXT NOT NULL,
    data_hora TIMESTAMP WITH TIME ZONE NOT NULL,
    ia_score_cilada INTEGER CHECK (ia_score_cilada >= 1 AND ia_score_cilada <= 10),
    kid_friendly BOOLEAN DEFAULT false,
    imagem_flyer_path TEXT
);

-- Configurações de Segurança e Acesso (RLS)
ALTER TABLE locais_fixos ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos ENABLE ROW LEVEL SECURITY;

-- Políticas para leitura pública (Evitar erros se política já existir)
DROP POLICY IF EXISTS "Leitura pública locais_fixos" ON locais_fixos;
CREATE POLICY "Leitura pública locais_fixos" 
ON locais_fixos FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Leitura pública eventos" ON eventos;
CREATE POLICY "Leitura pública eventos" 
ON eventos FOR SELECT 
USING (true);

-- Limpar dados anteriores (útil para reinicialização)
TRUNCATE TABLE eventos CASCADE;
TRUNCATE TABLE locais_fixos CASCADE;

-- Inserir dados de teste iniciais (Locais com imagens reais de alta qualidade)
INSERT INTO locais_fixos (id, nome, tags_consumo, distancia_mooca, imagem_hero_path) VALUES
  ('a76a5996-f00e-4ab8-95d4-65f02bc0f252', 'Taverna Medieval', ARRAY['medieval', 'hamburguer', 'medieval-core'], 25, 'https://images.unsplash.com/photo-1599420186946-7b6fb4e297f0?q=80&w=600'),
  ('b96a5996-f00e-4ab8-95d4-65f02bc0f253', 'Ludoteria SP', ARRAY['plant-based', 'zero-lactose', 'jogos-tabuleiro'], 40, 'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?q=80&w=600'),
  ('c06a5996-f00e-4ab8-95d4-65f02bc0f254', 'Coffee & Games', ARRAY['cafeteira', 'zero-lactose', 'videogames'], 15, 'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=600');

-- Inserir dados de teste iniciais (Eventos)
INSERT INTO eventos (local_id, titulo, data_hora, ia_score_cilada, kid_friendly, imagem_flyer_path) VALUES
  ('a76a5996-f00e-4ab8-95d4-65f02bc0f252', 'Mega Encontro de RPG (Taverna)', NOW() + INTERVAL '2 hours', 9, true, 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?q=80&w=600'),
  ('b96a5996-f00e-4ab8-95d4-65f02bc0f253', 'Campeonato de Catan e Hamburguer Vegano', NOW() + INTERVAL '1 day', 8, true, 'https://images.unsplash.com/photo-1585504198199-20277593b94f?q=80&w=600'),
  ('c06a5996-f00e-4ab8-95d4-65f02bc0f254', 'Torneio de Smash Bros & Café Express', NOW() + INTERVAL '3 days', 9, false, 'https://images.unsplash.com/photo-1551103782-8ab07afd45c1?q=80&w=600'),
  (NULL, 'Feira Geek de Calçadão', NOW() + INTERVAL '4 days', 3, false, 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?q=80&w=600');

