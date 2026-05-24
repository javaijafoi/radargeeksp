import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ─── Carregar .env ─────────────────────────────────────────────────────────────
try {
  const envPath = path.join(__dirname, '..', 'web', '.env')
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
      if (line.trim().startsWith('#') || !line.trim()) return
      const parts = line.split('=')
      if (parts.length >= 2) {
        const key = parts[0].trim()
        const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '')
        if (key && value && !process.env[key]) process.env[key] = value
      }
    })
  }
} catch (e) {}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY
const GEMINI_API_KEY = process.env.GEMINI_API_KEY

// ─── Estado e logs ─────────────────────────────────────────────────────────────
const todosLocais = []
const todosEventos = []
const todosLogs = []
let executionLogs = []

function logMessage(msg) {
  console.log(msg)
  executionLogs.push(`[${new Date().toISOString()}] ${msg}`)
}

// ─── Circuit Breaker ───────────────────────────────────────────────────────────
const ESTADO_PATH = path.join(__dirname, '.scraper_state.json')

function lerEstado() {
  try {
    if (fs.existsSync(ESTADO_PATH)) return JSON.parse(fs.readFileSync(ESTADO_PATH, 'utf-8'))
  } catch (e) {}
  return {}
}

function salvarEstado(estado) {
  fs.writeFileSync(ESTADO_PATH, JSON.stringify(estado, null, 2))
}

function isGeminiBloqueado() {
  const estado = lerEstado()
  if (estado.bloqueado_ate && Date.now() < new Date(estado.bloqueado_ate).getTime()) {
    return true
  }
  if (estado.bloqueado_ate && Date.now() >= new Date(estado.bloqueado_ate).getTime()) {
    console.log(`✅ Período de bloqueio encerrado. Retomando Gemini...`)
    salvarEstado({ ...estado, bloqueado_ate: null, motivo: null })
  }
  return false
}

function bloquear(motivo) {
  const amanha = new Date()
  amanha.setDate(amanha.getDate() + 1)
  amanha.setHours(1, 0, 0, 0) // 01:00 do dia seguinte

  const estado = {
    bloqueado_em: new Date().toISOString(),
    bloqueado_ate: amanha.toISOString(),
    motivo,
    ultimo_log: executionLogs.slice(-10).join('\n')
  }
  salvarEstado(estado)

  logMessage(`\n🚫 BLOQUEIO ATIVADO — ${motivo}`)
  logMessage(`   Retoma automaticamente em: ${amanha.toLocaleString('pt-BR')}`)
  logMessage(`   Estado salvo em: ${ESTADO_PATH}`)
}

function isQuotaError(msg) {
  const lower = (msg || '').toLowerCase()
  return lower.includes('429') ||
    lower.includes('quota') ||
    lower.includes('resource_exhausted') ||
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('503') ||
    lower.includes('unavailable')
}

function isMemoryError(msg) {
  const lower = (msg || '').toLowerCase()
  return lower.includes('out of memory') ||
    lower.includes('heap') ||
    lower.includes('enomem') ||
    lower.includes('memory limit')
}

// ─── Supabase ──────────────────────────────────────────────────────────────────
async function supabaseRequest(metodo, endpoint, dados = null) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Credenciais Supabase ausentes.')
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  }
  const config = { method: metodo, headers }
  if (dados) config.body = JSON.stringify(dados)
  const response = await fetch(url, config)
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Supabase ${response.status}: ${text}`)
  }
  return await response.json()
}

// ─── Raspagem Inteligente de Página Inteira ────────────────────────────────────
async function extrairPaginaEstruturada(url) {
  logMessage(`📥 Raspando página: "${url}"`)
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml'
      },
      signal: AbortSignal.timeout(12000)
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()

    // 1. Título
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i)
    let titulo = titleMatch ? titleMatch[1].trim() : ''
    const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
                      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)
    if (ogTitleMatch && ogTitleMatch[1]) titulo = ogTitleMatch[1].trim()

    // 2. Descrição
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
                   || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)
                   || html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
    let descricao = descMatch ? descMatch[1].trim() : ''

    // 3. og:image
    const imgMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
                  || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
    const og_image = imgMatch && imgMatch[1]?.startsWith('http') ? imgMatch[1] : null

    // 4. Limpar HTML para extrair texto limpo
    let cleanHtml = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<header[\s\S]*?<\/header>/gi, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
      .replace(/<form[\s\S]*?<\/form>/gi, ' ')
    let text = cleanHtml
      .replace(/<[^>]+>/gm, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const conteudo_texto = text.substring(0, 5000)

    logMessage(`  ✅ Sucesso: "${titulo.substring(0, 30)}..." (${conteudo_texto.length} chars)`)
    return { url, titulo, descricao, conteudo_texto, og_image }
  } catch (e) {
    logMessage(`  ⚠️ Falha ao raspar ${url}: ${e.message}`)
    return null
  }
}

// ─── O Organizador: Filtragem de URLs Novas contra o Banco ──────────────────────
async function filtrarUrlsNovas(urls) {
  if (urls.length === 0) return []
  try {
    // PostgREST "in" format: "in.(val1,val2,val3)"
    const encodedUrls = urls.map(u => encodeURIComponent(u).replace(/,/g, '%2C'))
    const inClause = `in.(${encodedUrls.join(',')})`

    const [ev, LF, sq] = await Promise.all([
      supabaseRequest('GET', `eventos?fonte_url=${inClause}&select=fonte_url`).catch(() => []),
      supabaseRequest('GET', `locais_fixos?fonte_url=${inClause}&select=fonte_url`).catch(() => []),
      supabaseRequest('GET', `scraper_queue?url=${inClause}&select=url`).catch(() => [])
    ])

    const urlsConhecidas = new Set([
      ...(ev || []).map(item => item.fonte_url),
      ...(LF || []).map(item => item.fonte_url),
      ...(sq || []).map(item => item.url)
    ].filter(Boolean))

    return urls.filter(url => !urlsConhecidas.has(url))
  } catch (e) {
    logMessage(`⚠️ Falha ao filtrar URLs: ${e.message}. Processando todas como novas.`)
    return urls
  }
}

// ─── Busca de URLs na Web ──────────────────────────────────────────────────────
async function queryDDG(endpoint, query) {
  const p = new URLSearchParams({ q: query, df: 'w' })
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
    },
    body: p.toString(),
    signal: AbortSignal.timeout(10000)
  })
  if (!res.ok) throw new Error(`DDG retornou status ${res.status}`)

  const html = await res.text()
  let urls = []
  const re = /href=["']([^"']+)["']/g
  let m
  while ((m = re.exec(html)) !== null) {
    let url = m[1].replace(/&amp;/g, '&')
    if (url.includes('uddg=')) {
      const match = url.match(/uddg=([^&"']+)/)
      if (match) {
        try { url = decodeURIComponent(match[1]) } catch (e) {}
      }
    }
    
    if (url.startsWith('http') && 
        !url.includes('duckduckgo.com/') && 
        !url.includes('google.com/')) {
      urls.push(url)
    }
  }
  return [...new Set(urls)].slice(0, 8)
}

async function buscarNaWeb(query) {
  logMessage(`🔍 Buscando na web por: ${query}...`)
  let urls = []
  
  // 1. Tentar DDG Lite
  try {
    urls = await queryDDG('https://lite.duckduckgo.com/lite/', query)
  } catch (e) {
    logMessage(`  ⚠️ DDG Lite falhou: ${e.message}`)
  }

  // 2. Fallback para DDG HTML se Lite falhar ou der 0 resultados
  if (urls.length === 0) {
    logMessage(`  ⚠️ DDG Lite sem resultados. Tentando canal secundário (DDG HTML)...`)
    try {
      urls = await queryDDG('https://html.duckduckgo.com/html/', query)
    } catch (e) {
      logMessage(`  ⚠️ DDG HTML falhou: ${e.message}`)
    }
  }

  logMessage(`  ✅ ${urls.length} URLs encontradas`)
  return urls
}

// ─── Ler feed do Supabase ──────────────────────────────────────────────────────
async function lerFeed() {
  try {
    const feed = await supabaseRequest('GET', 'scraper_feed?ativo=eq.true&order=criado_em.asc&select=*')
    if (feed?.length > 0) logMessage(`\n📋 Feed manual: ${feed.length} URL(s) ativa(s).`)
    else logMessage(`\n📋 Feed manual vazio.`)
    return feed || []
  } catch (e) {
    if (e.message.includes('42P01') || e.message.includes('404') || e.message.includes('relation') || e.message.includes('does not exist')) {
      logMessage(`ℹ️  Tabela scraper_feed não existe. Rode migration_feed.sql no Supabase para ativar o feed.`)
    } else {
      logMessage(`⚠️ Erro ao ler feed: ${e.message}`)
    }
    return []
  }
}

// ─── Gemini LLM Call ───────────────────────────────────────────────────────────
async function extrairComGemini(promptBase, todosConteudos, todasImagens) {
  if (!GEMINI_API_KEY) throw new Error('Gemini API Key não configurada.')

  const textoFontes = todosConteudos
    .map((c, i) => `\n--- FONTE ${i + 1}${c.label ? ': ' + c.label : ''} ---\n${c.texto}`)
    .join('\n')

  const imagensInfo = todasImagens.length > 0
    ? `\n\n🖼️ IMAGENS REAIS DAS PÁGINAS (use estas preferencialmente):\n` +
      todasImagens.map(img => `  • ${img.url}\n    imagem: ${img.imagem}`).join('\n')
    : '\n\n[Sem imagens reais — use Unsplash relevante como fallback]'

  const prompt = `${promptBase}${imagensInfo}\n\nFONTES:\n${textoFontes}`

  const models = ['gemini-2.5-flash', 'gemini-2.0-flash']
  let lastError = null

  for (const model of models) {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`
    logMessage(`🤖 Chamando Gemini via modelo: ${model}...`)
    try {
      const res = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7 } }),
        signal: AbortSignal.timeout(90000)
      })

      if (res.status === 429 || res.status === 503) {
        const errTxt = await res.text()
        logMessage(`  ⚠️ Modelo ${model} atingiu cota de uso (Status ${res.status}). Tentando fallback...`)
        lastError = new Error(`GEMINI_QUOTA: ${res.status} ${errTxt}`)
        continue
      }
      if (!res.ok) {
        const errTxt = await res.text()
        logMessage(`  ⚠️ Modelo ${model} falhou com erro HTTP (Status ${res.status}). Tentando fallback...`)
        lastError = new Error(`GEMINI_HTTP: ${res.status}: ${errTxt}`)
        continue
      }

      const resJson = await res.json()
      let resultText = resJson.candidates[0].content.parts[0].text
      resultText = resultText.replace(/```json/g, '').replace(/```/g, '').trim()
      logMessage(`✅ Gemini respondeu com sucesso usando o modelo: ${model}`)
      return JSON.parse(resultText)
    } catch (e) {
      logMessage(`  ⚠️ Modelo ${model} falhou: ${e.message}`)
      lastError = e
    }
  }

  // Se todos os modelos falharem
  if (lastError && isQuotaError(lastError.message)) {
    bloquear(`GEMINI_QUOTA_EXCEEDED: ${lastError.message.substring(0, 200)}`)
  }
  throw lastError || new Error('Todos os modelos do Gemini falharam.')
}

// ─── Exportar JSON ─────────────────────────────────────────────────────────────
function exportarJSON() {
  try {
    const webPublicDir = path.join(__dirname, '..', 'web', 'public')
    if (!fs.existsSync(webPublicDir)) fs.mkdirSync(webPublicDir, { recursive: true })
    const jsonPath = path.join(webPublicDir, 'data.json')
    const estado = lerEstado()
    const payload = {
      locais: todosLocais,
      eventos: todosEventos,
      logs: todosLogs,
      estado_scraper: {
        bloqueado: !!(estado.bloqueado_ate && Date.now() < new Date(estado.bloqueado_ate).getTime()),
        bloqueado_ate: estado.bloqueado_ate || null,
        motivo: estado.motivo || null,
        bloqueado_em: estado.bloqueado_em || null
      },
      exportado_em: new Date().toISOString()
    }
    fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf-8')
    logMessage(`\n[Sync] data.json → ${jsonPath}`)
  } catch (e) { logMessage(`Erro ao salvar JSON: ${e.message}`) }
}

// ─── Main Pipeline ─────────────────────────────────────────────────────────────
async function main() {
  const startTime = Date.now()
  const memStart = process.memoryUsage().rss / 1024 / 1024
  logMessage(`\nRadar Geek SP Scraper v3 (Decoupled) iniciado. (Memória: ${memStart.toFixed(2)} MB)`)

  // Monitor de memória — bloqueia se passar de 400MB
  const memMonitor = setInterval(() => {
    const memAtual = process.memoryUsage().rss / 1024 / 1024
    if (memAtual > 400) {
      clearInterval(memMonitor)
      bloquear(`MEMORY_LIMIT_EXCEEDED: ${memAtual.toFixed(0)} MB usado (limite: 400 MB)`)
      exportarJSON()
      process.exit(1)
    }
  }, 5000)

  try {
    // 0. Verificar existência da tabela scraper_queue
    let queueTableExists = true
    try {
      await supabaseRequest('GET', 'scraper_queue?limit=1')
    } catch (e) {
      if (e.message.includes('42P01') || e.message.includes('relation') || e.message.includes('does not exist') || e.message.includes('404')) {
        queueTableExists = false
      }
    }

    if (!queueTableExists) {
      clearInterval(memMonitor)
      logMessage(`\n❌ A tabela 'scraper_queue' não existe no Supabase.`)
      logMessage(`   Por favor, execute o SQL em 'backend/migration_v3.sql' no Supabase Dashboard.`)
      process.exit(1)
    }

    // 1. Configurações
    logMessage('\n⚙️  Carregando configurações...')
    const configData = await supabaseRequest('GET', 'scraper_config?id=eq.1&select=*')
    if (!configData?.length) throw new Error('scraper_config vazio.')
    const { search_queries, gemini_prompt } = configData[0]
    logMessage(`   ${search_queries.length} queries de busca configuradas.`)

    // 2. Coletar URLs da Busca
    logMessage('\n🌐 Iniciando busca de URLs...')
    const urlsBusca = []
    for (const query of search_queries) {
      const urls = await buscarNaWeb(query)
      urlsBusca.push(...urls)
      const delay = Math.floor(Math.random() * (4500 - 2500 + 1) + 2500)
      logMessage(`  💤 Aguardando respiro de ${(delay / 1000).toFixed(1)}s...`)
      await new Promise(r => setTimeout(r, delay))
    }

    // 3. Coletar URLs do Feed
    const feedItems = await lerFeed()
    const urlsFeed = feedItems.map(item => item.url)

    // 4. Juntar e filtrar duplicados locais
    const todasUrls = [...new Set([...urlsFeed, ...urlsBusca])]
    logMessage(`\n🔍 Total de URLs descobertas: ${todasUrls.length}`)

    // 5. O Organizador: Filtrar URLs contra o Banco (novas vs conhecidas)
    const urlsNovas = await filtrarUrlsNovas(todasUrls)
    logMessage(`📊 Das ${todasUrls.length} URLs, ${urlsNovas.length} são novas.`)

    // 6. Raspar páginas novas e enfileirar (Staging)
    let enfileiradosCount = 0
    if (urlsNovas.length > 0) {
      logMessage(`\n📥 Iniciando raspagem das ${urlsNovas.length} páginas novas...`)
      for (const url of urlsNovas) {
        const pag = await extrairPaginaEstruturada(url)
        if (pag) {
          try {
            await supabaseRequest('POST', 'scraper_queue', {
              url: pag.url,
              titulo: pag.titulo || null,
              descricao: pag.descricao || null,
              conteudo_texto: pag.conteudo_texto || null,
              og_image: pag.og_image || null,
              status: 'pending'
            })
            enfileiradosCount++
            logMessage(`  📥 Enfileirado com sucesso: ${url}`)
          } catch (e) {
            logMessage(`  ⚠️ Erro ao inserir na scraper_queue: ${e.message}`)
          }
        }
        await new Promise(r => setTimeout(r, 500))
      }
    }

    logMessage(`\n🏁 Fase de Scraping concluída. ${enfileiradosCount} links novos enfileirados em 'scraper_queue'.`)

    // 7. Processamento Gemini com Fila & Lotes
    if (isGeminiBloqueado()) {
      const estado = lerEstado()
      const ate = new Date(estado.bloqueado_ate).toLocaleString('pt-BR')
      logMessage(`\n🚫 PROCESSAMENTO GEMINI PENDENTE (BLOQUEADO)`)
      logMessage(`   O Gemini está temporariamente fora de cota.`)
      logMessage(`   O processador do Gemini retomará em: ${ate}`)
    } else {
      logMessage('\n📋 Verificando fila de processamento (scraper_queue)...')
      // Consome lote de 3 itens pendentes
      const pendingItems = await supabaseRequest('GET', 'scraper_queue?status=eq.pending&order=criado_em.asc&limit=3')
      
      if (pendingItems.length === 0) {
        logMessage('  ✅ Nenhuma página pendente na fila.')
      } else {
        logMessage(`  📊 Encontrados ${pendingItems.length} itens pendentes. Iniciando processamento com Gemini...`)
        
        for (const item of pendingItems) {
          try {
            logMessage(`\n🧠 Chamando Gemini para: "${item.titulo || item.url}"`)
            
            const todosConteudos = [
              { 
                label: item.titulo || item.url, 
                texto: `FONTE URL: ${item.url}\nDESCRIÇÃO: ${item.descricao}\nCONTEUDO:\n${item.conteudo_texto}` 
              }
            ]
            const todasImagens = item.og_image ? [{ url: item.url, imagem: item.og_image }] : []

            const dadosEstruturados = await extrairComGemini(gemini_prompt, todosConteudos, todasImagens)
            if (!dadosEstruturados) throw new Error('Gemini retornou JSON null ou inválido.')

            let locaisCount = 0, eventosCount = 0
            const locaisIds = {}

            // Inserir Locais
            if (dadosEstruturados.locais?.length) {
              logMessage(`  💾 Salvando locais...`)
              for (const local of dadosEstruturados.locais) {
                try {
                  const dados = {
                    nome: local.nome,
                    descricao: local.descricao,
                    endereco: local.endereco || null,
                    preco_medio: local.preco_medio || null,
                    fonte_url: local.fonte_url || item.url,
                    ia_inferido: Boolean(local.ia_inferido),
                    tags_consumo: local.tags_consumo || [],
                    distancia_mooca: parseInt(local.distancia_mooca) || 30,
                    imagem_hero_path: local.imagem_hero_path
                  }
                  const res = await supabaseRequest('POST', 'locais_fixos', dados)
                  if (res?.length > 0) {
                    locaisIds[local.nome] = res[0].id
                    locaisCount++
                    todosLocais.push(res[0])
                    logMessage(`    ✅ Local "${local.nome}" salvo.`)
                  }
                } catch (e) {
                  logMessage(`    ⚠️ Erro local "${local.nome}": ${e.message}`)
                }
              }
            }

            // Inserir Eventos
            if (dadosEstruturados.eventos?.length) {
              logMessage(`  💾 Salvando eventos...`)
              for (const evento of dadosEstruturados.eventos) {
                try {
                  const novoEvento = {
                    titulo: evento.titulo,
                    descricao: evento.descricao,
                    endereco: evento.endereco || null,
                    preco_entrada: evento.preco_entrada || null,
                    fonte_url: evento.fonte_url || item.url,
                    ia_inferido: Boolean(evento.ia_inferido),
                    data_hora: new Date(evento.data_hora || Date.now()).toISOString(),
                    ia_score_cilada: parseInt(evento.ia_score_cilada) || 5,
                    kid_friendly: Boolean(evento.kid_friendly),
                    imagem_flyer_path: evento.imagem_flyer_path
                  }
                  if (evento.local_nome && locaisIds[evento.local_nome]) {
                    novoEvento.local_id = locaisIds[evento.local_nome]
                  }
                  const res = await supabaseRequest('POST', 'eventos', novoEvento)
                  if (res?.length > 0) {
                    eventosCount++
                    todosEventos.push(res[0])
                    logMessage(`    ✅ Evento "${evento.titulo}" salvo.`)
                  }
                } catch (e) {
                  logMessage(`    ⚠️ Erro evento "${evento.titulo}": ${e.message}`)
                }
              }
            }

            // Marcar como processado
            await supabaseRequest('PATCH', `scraper_queue?id=eq.${item.id}`, { status: 'processed' })
            logMessage(`  ✅ Fila resolvida para URL: ${item.url}`)
            
            await new Promise(r => setTimeout(r, 1000))

          } catch (err) {
            logMessage(`  ❌ Erro processando URL ${item.url}: ${err.message}`)
            
            if (isQuotaError(err.message)) {
              const estado = lerEstado()
              if (!estado.bloqueado_ate || Date.now() >= new Date(estado.bloqueado_ate).getTime()) {
                bloquear(`GEMINI_QUOTA_EXCEEDED: ${err.message.substring(0, 200)}`)
              }
              logMessage('🚫 Abortando processamento do lote devido à cota de Gemini.')
              break
            } else {
              const novasTentativas = (item.tentativas || 0) + 1
              const novoStatus = novasTentativas >= 3 ? 'failed' : 'pending'
              await supabaseRequest('PATCH', `scraper_queue?id=eq.${item.id}`, { 
                status: novoStatus, 
                tentativas: novasTentativas 
              }).catch(() => {})
            }
          }
        }
      }
    }

    clearInterval(memMonitor)
    const memEnd = process.memoryUsage().rss / 1024 / 1024
    const durSec = ((Date.now() - startTime) / 1000).toFixed(2)
    logMessage(`\n🎉 Execução concluída em ${durSec}s. (Memória: ${memStart.toFixed(2)} → ${memEnd.toFixed(2)} MB)`)

    await supabaseRequest('POST', 'historico_scraping', {
      executado_em: new Date().toISOString(),
      sucesso: true,
      locais_processados: todosLocais.length,
      eventos_novos: todosEventos.length,
      logs: executionLogs.join('\n')
    }).then(r => { if (r?.length) todosLogs.push(r[0]) }).catch(() => {})

  } catch (err) {
    clearInterval(memMonitor)
    logMessage(`\n❌ FATAL: ${err.message}`)

    if (isQuotaError(err.message)) {
      const estado = lerEstado()
      if (!estado.bloqueado_ate || Date.now() >= new Date(estado.bloqueado_ate).getTime()) {
        bloquear(`QUOTA_LIMIT_EXCEEDED: ${err.message.substring(0, 200)}`)
      }
    } else if (isMemoryError(err.message)) {
      bloquear(`MEMORY_ERROR: ${err.message.substring(0, 200)}`)
    }

    try {
      if (SUPABASE_URL && SUPABASE_KEY) {
        await supabaseRequest('POST', 'historico_scraping', {
          sucesso: false,
          logs: executionLogs.join('\n')
        })
      }
    } catch (e) {}
  }

  exportarJSON()
}

main()
