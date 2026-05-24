-- ═══════════════════════════════════════════════════════════════════
-- RADAR GEEK SP — Migração v4: Adição de atualizado_em para rotina de manutenção
-- ═══════════════════════════════════════════════════════════════════

-- 1. Adicionar atualizado_em na tabela locais_fixos
ALTER TABLE locais_fixos ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT now();

-- 2. Adicionar atualizado_em na tabela eventos
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT now();

SELECT 'Migração v4 concluída com sucesso!' as status;
