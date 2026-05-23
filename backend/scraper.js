import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Emulação de __dirname em ES Modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Variáveis de ambiente
const SUPABASE_URL = process.env.SUPABASE_URL || "https://MOCK.supabase.co"
const SUPABASE_KEY = process.env.SUPABASE_KEY || "MOCK_KEY"
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "MOCK_GEMINI_KEY"

// Listas locais de persistência para o data.json
const todosLocais = []
const todosEventos = []

// Heurísticas locais se não houver Gemini API Key
function heuristicaLocalEvento(descricao) {
  const descLower = descricao.toLowerCase()
  let score = 7
  let kidFriendly = true
  const tags = []

  if (descLower.includes("cerveja") || descLower.includes("bebida") || descLower.includes("tumulto")) {
    score = 4
    kidFriendly = false
  }
  if (descLower.includes("rpg") || descLower.includes("tabuleiro")) {
    score = 9
    tags.push("RPG")
  }
  if (descLower.includes("vegano") || descLower.includes("plant-based")) {
    tags.push("Vegano")
  }
  if (descLower.includes("semlactose") || descLower.includes("zero lactose") || descLower.includes("zero-lactose")) {
    tags.push("Sem Lactose")
  }

  return {
    ia_score_cilada: score,
    kid_friendly: kidFriendly,
    tags_consumo: tags
  }
}

// Avaliação via Gemini API
async function avaliarEventoGemini(descricaoEvento) {
  if (!GEMINI_API_KEY || GEMINI_API_KEY.includes("MOCK")) {
    console.log("Usando avaliação heurística local (Gemini API Key ausente)...")
    return heuristicaLocalEvento(descricaoEvento)
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`
  const prompt = `
  Avalie o seguinte evento geek:
  '${descricaoEvento}'
  
  Retorne APENAS um JSON válido com a seguinte estrutura:
  {
      "ia_score_cilada": <numero de 1 a 10>,
      "kid_friendly": <booleano>,
      "tags_consumo": ["<tags extraídas>"]
  }
  `

  const payload = {
    contents: [{ parts: [{ text: prompt }] }]
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`)
    const resJson = await res.json()
    let resultText = resJson.candidates[0].content.parts[0].text
    
    // Limpar blocos markdown
    resultText = resultText.replace(/```json/g, '').replace(/```/g, '').trim()
    return JSON.parse(resultText)
  } catch (e) {
    console.warn(`Erro ao processar no Gemini (${e.message}). Usando heurística local...`)
    return heuristicaLocalEvento(descricaoEvento)
  }
}

// Inserção Supabase REST / Mock
async function inserirSupabase(tabela, dados) {
  if (SUPABASE_URL.includes("MOCK") || !SUPABASE_URL) {
    const dadosSalvos = { ...dados, id: crypto.randomUUID() }
    
    if (tabela === "locais_fixos") {
      todosLocais.push(dadosSalvos)
    } else if (tabela === "eventos") {
      const eventoComRelacao = { ...dadosSalvos }
      if (dadosSalvos.local_id) {
        const local = todosLocais.find(l => l.id === dadosSalvos.local_id)
        if (local) eventoComRelacao.locais_fixos = local
      }
      todosEventos.push(eventoComRelacao)
    }
    
    console.log(`[MOCK] Registro simulado na tabela '${tabela}': ${tabela === 'locais_fixos' ? dadosSalvos.nome : dadosSalvos.titulo}`)
    return [dadosSalvos]
  }

  const url = `${SUPABASE_URL}/rest/v1/${tabela}`
  const headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation"
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(dados)
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error(`Erro ao inserir na tabela ${tabela}: ${errText}`)
      return null
    }

    const resJson = await response.json()
    if (resJson && resJson.length > 0) {
      const item = resJson[0]
      if (tabela === "locais_fixos") {
        todosLocais.push(item)
      } else if (tabela === "eventos") {
        const eventoComRelacao = { ...item }
        if (item.local_id) {
          const local = todosLocais.find(l => l.id === item.local_id)
          if (local) eventoComRelacao.locais_fixos = local
        }
        todosEventos.push(eventoComRelacao)
      }
      return resJson
    }
    return null
  } catch (e) {
    console.error(`Exceção ao inserir no Supabase: ${e.message}`)
    return null
  }
}

async function main() {
  const locaisExemplo = [
    {
      nome: "Taverna Medieval",
      tags_consumo: ["medieval", "hamburguer", "medieval-core"],
      distancia_mooca: 25,
      imagem_hero_path: "https://placehold.co/600x400/2c1b4d/FFFFFF?text=Taverna+Medieval"
    },
    {
      nome: "Ludoteria SP",
      tags_consumo: ["plant-based", "zero-lactose", "jogos-tabuleiro"],
      distancia_mooca: 40,
      imagem_hero_path: "https://placehold.co/600x400/0f3a1a/FFFFFF?text=Ludoteria"
    },
    {
      nome: "Coffee & Games",
      tags_consumo: ["cafeteria", "zero-lactose", "videogames"],
      distancia_mooca: 15,
      imagem_hero_path: "https://placehold.co/600x400/3e2723/FFFFFF?text=Coffee+and+Games"
    }
  ]

  console.log("Processando locais fixos...")
  const locaisIds = {}
  for (const local of locaisExemplo) {
    const resultado = await inserirSupabase("locais_fixos", local)
    if (resultado) {
      locaisIds[local.nome] = resultado[0].id
    }
  }

  const eventosCrus = [
    {
      titulo: "Mega Encontro de RPG (Taverna)",
      descricao: "Uma noite tranquila para jogar D&D e RPG de mesa com opções de comidas típicas sem lactose.",
      data_hora: new Date().toISOString(),
      local_nome: "Taverna Medieval",
      imagem_flyer_path: "https://placehold.co/600x400/311b92/FFFFFF?text=RPG+Taverna"
    },
    {
      titulo: "Campeonato de Catan e Hambúrguer Vegano",
      descricao: "Venha jogar jogos de tabuleiro modernos e saborear nosso buffet 100% plant-based com a família.",
      data_hora: new Date().toISOString(),
      local_nome: "Ludoteria SP",
      imagem_flyer_path: "https://placehold.co/600x400/1b5e20/FFFFFF?text=Catan+Vegano"
    },
    {
      titulo: "Feira Geek de Calçadão",
      descricao: "Grande aglomeração com stands vendendo figures piratas no sol, cerveja quente e muito tumulto.",
      data_hora: new Date().toISOString(),
      local_nome: null,
      imagem_flyer_path: "https://placehold.co/600x400/b71c1c/FFFFFF?text=Feira+Baguncada"
    },
    {
      titulo: "Torneio de Smash Bros & Café Express",
      descricao: "Competição amigável de Smash Bros Ultimate com degustação de milkshakes de leite de aveia (zero lactose).",
      data_hora: new Date().toISOString(),
      local_nome: "Coffee & Games",
      imagem_flyer_path: "https://placehold.co/600x400/e65100/FFFFFF?text=Smash+Bros"
    }
  ]

  console.log("\nProcessando e classificando eventos com IA...");
  for (const evento of eventosCrus) {
    const avaliacao = await avaliarEventoGemini(evento.descricao)
    
    const novoEvento = {
      titulo: evento.titulo,
      data_hora: evento.data_hora,
      ia_score_cilada: avaliacao.ia_score_cilada ?? 5,
      kid_friendly: avaliacao.kid_friendly ?? false,
      imagem_flyer_path: evento.imagem_flyer_path
    }

    if (evento.local_nome && locaisIds[evento.local_nome]) {
      novoEvento.local_id = locaisIds[evento.local_nome]
    }

    await inserirSupabase("eventos", novoEvento)
  }

  // Exportar para o data.json
  try {
    const webPublicDir = path.join(__dirname, "..", "web", "public")
    if (!fs.existsSync(webPublicDir)) {
      fs.mkdirSync(webPublicDir, { recursive: true })
    }
    const jsonPath = path.join(webPublicDir, "data.json")

    const dadosExportados = {
      locais: todosLocais,
      eventos: todosEventos,
      exportado_em: new Date().toISOString()
    }

    fs.writeFileSync(jsonPath, JSON.stringify(dadosExportados, null, 2), 'utf-8')
    console.log(`\nDados exportados com sucesso para: ${jsonPath}`)
  } catch (e) {
    console.error(`Erro ao salvar arquivo JSON local: ${e.message}`)
  }

  console.log("\nSincronização concluída com sucesso!")
}

main()
