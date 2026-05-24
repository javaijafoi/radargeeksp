// Script one-shot para atualizar o prompt e as queries do scraper no Supabase
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Lê o .env da pasta web
const envPath = path.join(__dirname, '..', 'web', '.env')
const envContent = fs.readFileSync(envPath, 'utf-8')
envContent.split('\n').forEach(line => {
  if (line.trim().startsWith('#') || !line.trim()) return
  const [key, ...rest] = line.split('=')
  if (key && rest.length && !process.env[key.trim()]) {
    process.env[key.trim()] = rest.join('=').trim()
  }
})

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY

const novoPrompt = `Você é um especialista na cena geek e nerd de São Paulo. Analise os textos de busca abaixo e extraia (ou crie baseado em seu conhecimento real) locais e eventos geek em São Paulo.

REGRAS OBRIGATÓRIAS:
1. Retorne APENAS JSON válido, sem markdown, sem texto adicional.
2. Locais: bares temáticos, ludoterias, cafés nerd, lojas de board games, espaços de RPG, etc.
3. Eventos: encontros de RPG, torneios de jogos, feiras geek, campeonatos de videogame, etc.
4. distancia_mooca: estimativa em minutos de metrô/ônibus partindo do bairro da Mooca, SP.
5. ia_score_cilada: 1=péssimo/cilada total, 10=ótimo/vale muito a pena. Avalie: aglomeração, preços, qualidade.
6. Para imagens, use URLs reais do Unsplash com tema relevante.
7. IMPORTANTE: Se os textos de busca estiverem vagos ou sem informação útil, use seu conhecimento próprio sobre SP para criar dados REAIS e PLAUSÍVEIS.
8. Crie pelo menos 2 locais e 3 eventos sempre que possível.

Estrutura JSON esperada:
{
  "locais": [
    {
      "nome": "Nome real do local em SP",
      "descricao": "Descrição breve e honesta do local",
      "tags_consumo": ["hamburguer", "plant-based", "zero-lactose", "cerveja-artesanal", "cafe", "jogos", "rpg"],
      "distancia_mooca": 25,
      "imagem_hero_path": "https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=600"
    }
  ],
  "eventos": [
    {
      "titulo": "Nome do evento",
      "descricao": "Descrição do que vai rolar, para quem é, o que esperar",
      "data_hora": "2026-06-07T14:00:00-03:00",
      "ia_score_cilada": 8,
      "kid_friendly": true,
      "imagem_flyer_path": "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=600",
      "local_nome": "Nome exato de um dos locais acima (ou null se for evento em local avulso)"
    }
  ]
}`

const novasQueries = [
  "eventos geek nerd sao paulo 2026",
  "ludoteria board game cafe sao paulo",
  "rpg de mesa encontro sao paulo",
  "hamburgueria tematica nerd geek sp",
  "feira geek comic con sao paulo 2026"
]

const body = JSON.stringify({
  gemini_prompt: novoPrompt,
  search_queries: novasQueries
})

const res = await fetch(`${SUPABASE_URL}/rest/v1/scraper_config?id=eq.1`, {
  method: 'PATCH',
  headers: {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  },
  body
})

if (res.ok) {
  console.log('✅ Prompt e queries atualizados com sucesso no Supabase!')
  const data = await res.json()
  console.log('Queries ativas:', data[0]?.search_queries)
} else {
  const err = await res.text()
  console.error('❌ Erro:', res.status, err)
}
