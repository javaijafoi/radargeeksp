-- Schema para Radar Geek SP
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
CREATE TABLE IF NOT EXISTS eventos (
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
CREATE TABLE IF NOT EXISTS historico_scraping (
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

-- Limpar dados anteriores para reinicializar com dados de alta qualidade
TRUNCATE TABLE eventos CASCADE;
TRUNCATE TABLE locais_fixos CASCADE;
TRUNCATE TABLE historico_scraping CASCADE;

-- INSERIR LOCAIS FIXOS
INSERT INTO locais_fixos (id, nome, descricao, tags_consumo, distancia_mooca, imagem_hero_path) VALUES
  ('a76a5996-f00e-4ab8-95d4-65f02bc0f252', 
   'Taverna Medieval', 
   'Hamburgueria temática inspirada no universo fantástico de RPG e fantasia medieval. Oferece área de arqueria prática, drinks temáticos de poções e tabuleiros nas mesas.', 
   ARRAY['medieval', 'hamburguer', 'rpg', 'bebidas'], 
   25, 
   'https://images.unsplash.com/photo-1599420186946-7b6fb4e297f0?q=80&w=600'),

  ('b96a5996-f00e-4ab8-95d4-65f02bc0f253', 
   'Ludoteria SP', 
   'Espaço aconchegante focado em reunir amigos para jogar. Conta com um acervo de mais de 800 jogos de tabuleiro modernos e clássicos com monitores para explicar as regras. Menu com hambúrgueres e petiscos artesanais.', 
   ARRAY['plant-based', 'zero-lactose', 'jogos-tabuleiro', 'amigos'], 
   40, 
   'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?q=80&w=600'),

  ('c06a5996-f00e-4ab8-95d4-65f02bc0f254', 
   'Coffee & Games', 
   'O paraíso para quem ama videogames e um bom café. Jogue consoles clássicos e de última geração com amigos enquanto consome lanches e cafés especiais zero lactose.', 
   ARRAY['cafeteria', 'zero-lactose', 'videogames', 'retro'], 
   15, 
   'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=600'),

  ('d16a5996-f00e-4ab8-95d4-65f02bc0f255', 
   'Epic Games & RPG', 
   'Loja especializada em jogos de cartas (Magic, Pokemon, Yu-Gi-Oh) e RPG de mesa. Possui amplo espaço de mesas livres para jogar com a comunidade e campeonatos competitivos quase diariamente.', 
   ARRAY['rpg', 'cardgames', 'magic', 'torneios'], 
   20, 
   'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?q=80&w=600'),

  ('e26a5996-f00e-4ab8-95d4-65f02bc0f256', 
   'Gibi Cultura Geek', 
   'Um bar e pub temático inteiramente voltado à cultura pop, HQs e animes. Drinks autorais baseados em super-heróis famosos, petiscos deliciosos e música boa em um ambiente repleto de colecionáveis.', 
   ARRAY['HQs', 'animes', 'drinks', 'musica'], 
   30, 
   'https://images.unsplash.com/photo-1563089145-599997674d42?q=80&w=600'),

  ('f36a5996-f00e-4ab8-95d4-65f02bc0f257', 
   'Anime Café SP', 
   'Cafeteria e confeitaria inspirada nos tradicionais Maid Cafés japoneses. Doces temáticos lindamente decorados de animes de sucesso com excelentes opções plant-based.', 
   ARRAY['anime', 'doces-japoneses', 'plant-based', 'confeitaria'], 
   35, 
   'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=600');


-- INSERIR EVENTOS (11 eventos variados e ricos em detalhes)
INSERT INTO eventos (local_id, titulo, descricao, data_hora, ia_score_cilada, kid_friendly, imagem_flyer_path) VALUES
  ('a76a5996-f00e-4ab8-95d4-65f02bc0f252', 
   'Mega Encontro de RPG', 
   'Uma noite focada em campanhas curtas (one-shots) de Dungeons & Dragons e Call of Cthulhu para mestres e jogadores de todos os níveis. Comidas e poções sem lactose inclusas.', 
   NOW() + INTERVAL '2 hours', 
   9, 
   true, 
   'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?q=80&w=600'),

  ('b96a5996-f00e-4ab8-95d4-65f02bc0f253', 
   'Campeonato de Catan e Hambúrguer Vegano', 
   'Venha competir no clássico Colonizadores de Catan! O torneio garante premiação oficial e um hambúrguer 100% plant-based para todos os participantes inscritos.', 
   NOW() + INTERVAL '1 day', 
   8, 
   true, 
   'https://images.unsplash.com/photo-1585504198199-20277593b94f?q=80&w=600'),

  ('c06a5996-f00e-4ab8-95d4-65f02bc0f254', 
   'Torneio de Smash Bros & Café Express', 
   'Campeonato presencial de Super Smash Bros Ultimate com premiação em dinheiro para os 3 primeiros colocados. Inscrições abertas no balcão da cafeteria.', 
   NOW() + INTERVAL '3 days', 
   9, 
   false, 
   'https://images.unsplash.com/photo-1551103782-8ab07afd45c1?q=80&w=600'),

  ('d16a5996-f00e-4ab8-95d4-65f02bc0f255', 
   'Friday Night Magic (Draft)', 
   'O tradicional torneio semanal de Magic: The Gathering! Formato Draft com a última coleção lançada. Ótima oportunidade de conseguir cartas raras e pontos na liga.', 
   NOW() + INTERVAL '12 hours', 
   9, 
   true, 
   'https://images.unsplash.com/photo-1611195974226-a6a9be9dd763?q=80&w=600'),

  ('e26a5996-f00e-4ab8-95d4-65f02bc0f256', 
   'Karaokê & Cosplay Pop-Art', 
   'Cante suas trilhas de anime e rock favoritas fantasiado do seu personagem predileto. Os melhores cosplays da noite ganharão vouchers de consumo de drinks do bar.', 
   NOW() + INTERVAL '2 days', 
   7, 
   false, 
   'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?q=80&w=600'),

  ('f36a5996-f00e-4ab8-95d4-65f02bc0f257', 
   'Tarde de Desenho & Anime Quiz', 
   'Reunião de artistas ilustradores locais com jogos de perguntas e respostas rápidos sobre animes clássicos da TV Manchete e novos sucessos do Crunchyroll.', 
   NOW() + INTERVAL '4 days', 
   8, 
   true, 
   'https://images.unsplash.com/photo-1541701494587-cb58502866ab?q=80&w=600'),

  ('a76a5996-f00e-4ab8-95d4-65f02bc0f252', 
   'Desafio do Hidromel: RPG & Taberna', 
   'Junte-se à mesa redonda em desafios de charadas lendárias e contação de histórias medievais regadas a hidromel artesanal. Classificação indicativa: 18 anos.', 
   NOW() + INTERVAL '5 days', 
   8, 
   false, 
   'https://images.unsplash.com/photo-1599420186946-7b6fb4e297f0?q=80&w=600'),

  ('b96a5996-f00e-4ab8-95d4-65f02bc0f253', 
   'Clube do Jogo de Tabuleiro Cooperativo', 
   'Se você não gosta de competir, venha colaborar! Mesas focadas em Pandemic, Eldritch Horror e Spirit Island. Monitores dedicados para ensinar novos jogadores.', 
   NOW() + INTERVAL '6 days', 
   9, 
   true, 
   'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?q=80&w=600'),

  (NULL, 
   'Grande Convenção Anime & Comic Fest', 
   'Maior evento geek de rua do bairro, com praça de alimentação temática, stands de lojas independentes, palestras e desfiles de cosplays. Entrada franca.', 
   NOW() + INTERVAL '1 day 4 hours', 
   7, 
   true, 
   'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?q=80&w=600'),

  (NULL, 
   'Encontro de Colecionadores Retro', 
   'Troca e venda de videogames antigos, cartuchos de Mega Drive e Super Nintendo, Action Figures vintage e quadrinhos raros. Muita nostalgia.', 
   NOW() + INTERVAL '3 days 2 hours', 
   8, 
   true, 
   'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?q=80&w=600'),

  (NULL, 
   'Feira Geek de Calçadão', 
   'Grande aglomeração com stands vendendo colecionáveis de procedência duvidosa no sol, cerveja quente de latão e tumulto excessivo. Indicado apenas se você quiser passar calor.', 
   NOW() + INTERVAL '4 days 6 hours', 
   3, 
   false, 
   'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?q=80&w=600');


-- INSERIR LOGS DE HISTÓRICO DE SCRAPING INICIAIS
INSERT INTO historico_scraping (executado_em, sucesso, locais_processados, eventos_novos, logs) VALUES
  (NOW() - INTERVAL '1 day', true, 6, 2, 'Scraper iniciado às 06:00:01 UTC. Buscando novos posts no Instagram e Facebook das bases geek. Encontrados 2 novos eventos. Análise Gemini concluída com sucesso. Inserções realizadas no banco Supabase.'),
  (NOW(), true, 6, 4, 'Scraper iniciado às 06:00:03 UTC. Varredura diária de feeds concluída. Sincronização dos 6 locais fixos realizada. Encontrados 4 novos eventos de RPG e Smash Bros. IA Gemini classificou com score médio de 8.5. Execução concluída em 4.2 segundos.');
