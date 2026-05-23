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
const todosLogs = []

// Logs acumulados durante a execução para salvar na tabela historico_scraping
let executionLogs = []
function logMessage(msg) {
  console.log(msg)
  executionLogs.push(`[${new Date().toISOString()}] ${msg}`)
}

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
    logMessage("Usando avaliação heurística local (Gemini API Key ausente)...")
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
    logMessage(`Erro ao processar no Gemini (${e.message}). Usando heurística local...`)
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
    } else if (tabela === "historico_scraping") {
      todosLogs.push(dadosSalvos)
    }
    
    logMessage(`[MOCK] Registro na tabela '${tabela}': ${tabela === 'locais_fixos' ? dadosSalvos.nome : (tabela === 'eventos' ? dadosSalvos.titulo : 'log')}`)
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
      logMessage(`Erro ao inserir na tabela ${tabela}: ${errText}`)
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
      } else if (tabela === "historico_scraping") {
        todosLogs.push(item)
      }
      return resJson
    }
    return null
  } catch (e) {
    logMessage(`Exceção ao inserir no Supabase: ${e.message}`)
    return null
  }
}

async function main() {
  logMessage("Iniciando rotina de scraping do Radar Geek SP...")
  
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
    if (resultado) {
      locaisIds[local.nome] = resultado[0].id
      locaisProcessadosCount++
    }
  }

  const eventosCrus = [
    {
      titulo: "Mega Encontro de RPG",
      descricao: "Uma noite focada em campanhas curtas (one-shots) de Dungeons & Dragons e Call of Cthulhu para mestres e jogadores de todos os níveis. Comidas e poções sem lactose inclusas.",
      data_hora: new Date().toISOString(),
      local_nome: "Taverna Medieval",
      imagem_flyer_path: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?q=80&w=600"
    },
    {
      titulo: "Campeonato de Catan e Hambúrguer Vegano",
      descricao: "Venha competir no clássico Colonizadores de Catan! O torneio garante premiação oficial e um hambúrguer 100% plant-based para todos os participantes inscritos.",
      data_hora: new Date(Date.now() + 86400000).toISOString(),
      local_nome: "Ludoteria SP",
      imagem_flyer_path: "https://images.unsplash.com/photo-1585504198199-20277593b94f?q=80&w=600"
    },
    {
      titulo: "Torneio de Smash Bros & Café Express",
      descricao: "Campeonato presencial de Super Smash Bros Ultimate com premiação em dinheiro para os 3 primeiros colocados. Inscrições abertas no balcão da cafeteria.",
      data_hora: new Date(Date.now() + 172800000).toISOString(),
      local_nome: "Coffee & Games",
      imagem_flyer_path: "https://images.unsplash.com/photo-1551103782-8ab07afd45c1?q=80&w=600"
    },
    {
      titulo: "Friday Night Magic (Draft)",
      descricao: "O tradicional torneio semanal de Magic: The Gathering! Formato Draft com a última coleção lançada. Ótima oportunidade de conseguir cartas raras e pontos na liga.",
      data_hora: new Date(Date.now() + 43200000).toISOString(),
      local_nome: "Epic Games & RPG",
      imagem_flyer_path: "https://images.unsplash.com/photo-1611195974226-a6a9be9dd763?q=80&w=600"
    },
    {
      titulo: "Karaokê & Cosplay Pop-Art",
      descricao: "Cante suas trilhas de anime e rock favoritas fantasiado do seu personagem predileto. Os melhores cosplays da noite ganharão vouchers de consumo de drinks do bar.",
      data_hora: new Date(Date.now() + 259200000).toISOString(),
      local_nome: "Gibi Cultura Geek",
      imagem_flyer_path: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?q=80&w=600"
    },
    {
      titulo: "Tarde de Desenho & Anime Quiz",
      descricao: "Reunião de artistas ilustradores locais com jogos de perguntas e respostas rápidos sobre animes clássicos da TV Manchete e novos sucessos do Crunchyroll.",
      data_hora: new Date(Date.now() + 345600000).toISOString(),
      local_nome: "Anime Café SP",
      imagem_flyer_path: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?q=80&w=600"
    },
    {
      titulo: "Grande Convenção Anime & Comic Fest",
      descricao: "Maior evento geek de rua do bairro, com praça de alimentação temática, stands de lojas independentes, palestras e desfiles de cosplays. Entrada franca.",
      data_hora: new Date(Date.now() + 100000000).toISOString(),
      local_nome: null,
      imagem_flyer_path: "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?q=80&w=600"
    },
    {
      titulo: "Feira Geek de Calçadão",
      descricao: "Grande aglomeração com stands vendendo colecionáveis de procedência duvidosa no sol, cerveja quente de latão e tumulto excessivo. Indicado apenas se você quiser passar calor.",
      data_hora: new Date(Date.now() + 500000000).toISOString(),
      local_nome: null,
      imagem_flyer_path: "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?q=80&w=600"
    }
  ]

  logMessage(`\nProcessando ${eventosCrus.length} eventos coletados...`);
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

  logMessage("\nRegistrando log de execução...");
  const logDados = {
    executado_em: new Date().toISOString(),
    sucesso: true,
    locais_processados: locaisProcessadosCount,
    eventos_novos: eventosNovosCount,
    logs: executionLogs.join('\n')
  }
  await inserirSupabase("historico_scraping", logDados)

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
      logs: todosLogs,
      exportado_em: new Date().toISOString()
    }

    fs.writeFileSync(jsonPath, JSON.stringify(dadosExportados, null, 2), 'utf-8')
    logMessage(`\n[Vite Sync] Dados offline salvos com sucesso para: ${jsonPath}`)
  } catch (e) {
    logMessage(`Erro ao salvar arquivo JSON local: ${e.message}`)
  }

  logMessage("\nRotina concluída com sucesso!")
}

main()
