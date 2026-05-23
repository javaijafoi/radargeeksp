// Vercel Serverless Function to trigger scraping and save to Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY
const GEMINI_API_KEY = process.env.GEMINI_API_KEY

let executionLogs = []
function logMessage(msg) {
  executionLogs.push(`[${new Date().toISOString()}] ${msg}`)
}

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

async function avaliarEventoGemini(descricaoEvento) {
  if (!GEMINI_API_KEY) {
    logMessage("Usando avaliação heurística local (Gemini API Key ausente no servidor)...")
    return heuristicaLocalEvento(descricaoEvento)
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`
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
    resultText = resultText.replace(/```json/g, '').replace(/```/g, '').trim()
    return JSON.parse(resultText)
  } catch (e) {
    logMessage(`Erro ao processar no Gemini (${e.message}). Usando heurística local...`)
    return heuristicaLocalEvento(descricaoEvento)
  }
}

async function inserirSupabase(tabela, dados) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    logMessage(`[ERRO] Credenciais do Supabase ausentes no Vercel.`);
    return null
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
      logMessage(`Erro ao inserir na tabela ${tabela}: ${errText}`)
      return null
    }

    return await response.json()
  } catch (e) {
    logMessage(`Exceção ao inserir no Supabase: ${e.message}`)
    return null
  }
}

export default async function handler(req, res) {
  // Apenas aceita requisições POST para evitar acionamentos acidentais por GET
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  executionLogs = []
  logMessage("Iniciando rotina de scraping do Radar Geek SP na Nuvem (Vercel)...")
  
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ 
      sucesso: false, 
      logs: "Erro: SUPABASE_URL ou SUPABASE_KEY não configurados nas variáveis de ambiente da Vercel."
    })
  }

  const locaisExemplo = [
    {
      nome: "Taverna Medieval",
      descricao: "Hamburgueria temática inspirada no universo fantástico de RPG e fantasia medieval. Oferece arqueria, drinks de poções e tabuleiros nas mesas.",
      tags_consumo: ["medieval", "hamburguer", "medieval-core"],
      distancia_mooca: 25,
      imagem_hero_path: "https://images.unsplash.com/photo-1599420186946-7b6fb4e297f0?q=80&w=600"
    },
    {
      nome: "Ludoteria SP",
      descricao: "Espaço aconchegante focado em reunir amigos para jogar. Conta com um acervo de mais de 800 jogos de tabuleiro modernos e cardápio com hambúrgueres artesanais e opções veganas.",
      tags_consumo: ["plant-based", "zero-lactose", "jogos-tabuleiro"],
      distancia_mooca: 40,
      imagem_hero_path: "https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?q=80&w=600"
    },
    {
      nome: "Coffee & Games",
      descricao: "O paraíso para quem ama videogames e um bom café. Jogue consoles clássicos e de última geração com amigos enquanto consome lanches e cafés especiais zero lactose.",
      tags_consumo: ["cafeteira", "zero-lactose", "videogames"],
      distancia_mooca: 15,
      imagem_hero_path: "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=600"
    },
    {
      nome: "Epic Games & RPG",
      descricao: "Loja de cardgames e mesas livres de RPG e Magic: The Gathering. Campeonatos e ambiente muito amigável com a comunidade nerd de São Paulo.",
      tags_consumo: ["rpg", "cardgames", "torneios"],
      distancia_mooca: 20,
      imagem_hero_path: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?q=80&w=600"
    },
    {
      nome: "Gibi Cultura Geek",
      descricao: "Um pub estilizado recheado de quadrinhos, action figures e referências nostálgicas. Conhecido pelos hambúrgueres gigantes e drinks baseados em super-heróis.",
      tags_consumo: ["HQs", "drinks", "cinema"],
      distancia_mooca: 30,
      imagem_hero_path: "https://images.unsplash.com/photo-1563089145-599997674d42?q=80&w=600"
    },
    {
      nome: "Anime Café SP",
      descricao: "Uma aconchegante cafeteria que traz a atmosfera dos cafés de Akihabara para SP. Doces temáticos de animes com opções veganas/plant-based deliciosas.",
      tags_consumo: ["anime", "doces-japoneses", "plant-based"],
      distancia_mooca: 35,
      imagem_hero_path: "https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=600"
    }
  ]

  logMessage("Sincronizando locais fixos...");
  const locaisIds = {}
  let locaisProcessadosCount = 0
  for (const local of locaisExemplo) {
    const resultado = await inserirSupabase("locais_fixos", local)
    if (resultado && resultado.length > 0) {
      locaisIds[local.nome] = resultado[0].id
      locaisProcessadosCount++
    }
  }

  const eventosCrus = [
    {
      titulo: "Mega Encontro de RPG",
      descricao: "Campanhas rápidas de D&D e RPG para mestres e iniciantes. Poções mágicas sem lactose liberadas.",
      data_hora: new Date().toISOString(),
      local_nome: "Taverna Medieval",
      imagem_flyer_path: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?q=80&w=600"
    },
    {
      titulo: "Campeonato de Catan e Hambúrguer Vegano",
      descricao: "Desafio cooperativo e competitivo no tabuleiro clássico Catan, regado a lanches plant-based.",
      data_hora: new Date(Date.now() + 86400000).toISOString(),
      local_nome: "Ludoteria SP",
      imagem_flyer_path: "https://images.unsplash.com/photo-1585504198199-20277593b94f?q=80&w=600"
    },
    {
      titulo: "Torneio de Smash Bros & Café Express",
      descricao: "Mostre sua habilidade no controle em Smash Bros Ultimate e ganhe prêmios em dinheiro e cafés especiais.",
      data_hora: new Date(Date.now() + 172800000).toISOString(),
      local_nome: "Coffee & Games",
      imagem_flyer_path: "https://images.unsplash.com/photo-1551103782-8ab07afd45c1?q=80&w=600"
    }
  ]

  logMessage(`Processando ${eventosCrus.length} eventos coletados...`);
  let eventosNovosCount = 0
  for (const evento of eventosCrus) {
    const avaliacao = await avaliarEventoGemini(evento.descricao)
    const novoEvento = {
      titulo: evento.titulo,
      descricao: evento.descricao,
      data_hora: evento.data_hora,
      ia_score_cilada: avaliacao.ia_score_cilada ?? 5,
      kid_friendly: avaliacao.kid_friendly ?? false,
      imagem_flyer_path: evento.imagem_flyer_path
    }

    if (evento.local_nome && locaisIds[evento.local_nome]) {
      novoEvento.local_id = locaisIds[evento.local_nome]
    }

    const res = await inserirSupabase("eventos", novoEvento)
    if (res) eventosNovosCount++
  }

  logMessage("Salvando log no histórico de auditoria...");
  const logDados = {
    executado_em: new Date().toISOString(),
    sucesso: true,
    locais_processados: locaisProcessadosCount,
    eventos_novos: eventosNovosCount,
    logs: executionLogs.join('\n')
  }
  await inserirSupabase("historico_scraping", logDados)

  res.status(200).json({
    sucesso: true,
    locais_processados: locaisProcessadosCount,
    eventos_novos: eventosNovosCount,
    logs: executionLogs.join('\n')
  })
}
