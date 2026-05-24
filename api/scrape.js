// Vercel Serverless Function to trigger scraping and save to Supabase
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY
const GEMINI_API_KEY = process.env.GEMINI_API_KEY

let executionLogs = []
function logMessage(msg) {
  console.log(msg)
  executionLogs.push(`[${new Date().toISOString()}] ${msg}`)
}

// ─── Circuit Breaker local para /tmp (Vercel permite escrita em /tmp) ──────────
const ESTADO_PATH = '/tmp/.scraper_state.json'

function lerEstado() {
  try {
    if (fs.existsSync(ESTADO_PATH)) return JSON.parse(fs.readFileSync(ESTADO_PATH, 'utf-8'))
  } catch (e) {}
  return {}
}

function salvarEstado(estado) {
  try {
    fs.writeFileSync(ESTADO_PATH, JSON.stringify(estado, null, 2))
  } catch (e) {}
}

function isGeminiBloqueado() {
  const estado = lerEstado()
  if (estado.bloqueado_ate && Date.now() < new Date(estado.bloqueado_ate).getTime()) {
    return true
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
    motivo
  }
  salvarEstado(estado)
  logMessage(`🚫 BLOQUEIO EM NUVEM ATIVADO — ${motivo}`)
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
      signal: AbortSignal.timeout(6000)
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()

    // 1. Título
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i)
    let titulo = titleMatch ? titleMatch[1].trim() : ''
    const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    if (ogTitleMatch && ogTitleMatch[1]) titulo = ogTitleMatch[1].trim()

    // 2. Descrição
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
                   || html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
    let descricao = descMatch ? descMatch[1].trim() : ''

    // 3. og:image
    const imgMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    const og_image = imgMatch && imgMatch[1]?.startsWith('http') ? imgMatch[1] : null

    // 4. Limpar HTML
    let cleanHtml = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<header[\s\S]*?<\/header>/gi, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    let text = cleanHtml
      .replace(/<[^>]+>/gm, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const conteudo_texto = text.substring(0, 4000) // limite menor para serverless

    logMessage(`  ✅ Sucesso: "${titulo.substring(0, 20)}..." (${conteudo_texto.length} chars)`)
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
    logMessage(`⚠️ Falha ao filtrar URLs: ${e.message}`)
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
    signal: AbortSignal.timeout(6000)
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
  return [...new Set(urls)].slice(0, 4) // menor limite em serverless
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
    return feed || []
  } catch (e) {
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
        signal: AbortSignal.timeout(40000)
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
  throw lastError || new Error('Todos os modelos do Gemini falharam.')
}

// ─── Handler Principal ─────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' })

  executionLogs = []
  logMessage("Iniciando rotina do Scraper Radar Geek SP na Nuvem (Vercel)...")

  try {
    // 0. Verificar scraper_queue
    let queueTableExists = true
    try {
      await supabaseRequest('GET', 'scraper_queue?limit=1')
    } catch (e) {
      if (e.message.includes('42P01') || e.message.includes('relation') || e.message.includes('does not exist') || e.message.includes('404')) {
        queueTableExists = false
      }
    }

    if (!queueTableExists) {
      throw new Error("A tabela 'scraper_queue' não existe. Por favor, execute 'backend/migration_v3.sql' no Supabase SQL Editor.")
    }

    // 1. Carregar Configurações
    logMessage("⚙️ Carregando configurações...")
    const configData = await supabaseRequest('GET', 'scraper_config?id=eq.1&select=*')
    if (!configData || configData.length === 0) {
      throw new Error("scraper_config vazio ou inexistente.")
    }
    const { search_queries, gemini_prompt } = configData[0]

    // 2. Coletar URLs da Busca (apenas 3 aleatórias para caber no tempo do serverless)
    logMessage("🌐 Coletando URLs da busca...")
    const shuffledQueries = [...search_queries].sort(() => 0.5 - Math.random())
    const queriesReduzidas = shuffledQueries.slice(0, 3)
    const urlsBusca = []
    for (const query of queriesReduzidas) {
      const urls = await buscarNaWeb(query)
      urlsBusca.push(...urls)
      await new Promise(r => setTimeout(r, 1500))
    }

    // 3. Coletar URLs do Feed
    const feedItems = await lerFeed()
    const urlsFeed = feedItems.map(item => item.url)

    // 4. Filtrar conhecidos (Organizer)
    const todasUrls = [...new Set([...urlsFeed, ...urlsBusca])]
    const urlsNovas = await filtrarUrlsNovas(todasUrls)
    logMessage(`📊 Das ${todasUrls.length} URLs, ${urlsNovas.length} são novas.`)

    // 5. Raspar e enfileirar (Staging) — Limita a no máximo 3 raspagens por chamada na nuvem para não expirar o tempo
    let enfileiradosCount = 0
    const urlsParaRaspar = urlsNovas.slice(0, 3)
    for (const url of urlsParaRaspar) {
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
        } catch (e) {}
      }
      await new Promise(r => setTimeout(r, 400))
    }
    logMessage(`🏁 Fila de staging atualizada: +${enfileiradosCount} pendentes.`)

    // 6. Processador Gemini (Lote de 1 item para respeitar o limite serverless de 10s)
    let locaisCount = 0
    let eventosCount = 0

    if (isGeminiBloqueado()) {
      logMessage("🚫 Gemini bloqueado temporariamente por estouro de cota anterior. Fila acumulando.")
    } else {
      logMessage("📋 Consultando 1 item da fila staging para processar com Gemini...")
      const pendingItems = await supabaseRequest('GET', 'scraper_queue?status=eq.pending&order=criado_em.asc&limit=1')
      
      if (pendingItems.length === 0) {
        logMessage("✅ Fila vazia. Nenhum processamento pendente.")
      } else {
        const item = pendingItems[0]
        try {
          logMessage(`🧠 Processando com Gemini: ${item.url}`)
          const todosConteudos = [
            { 
              label: item.titulo || item.url, 
              texto: `FONTE URL: ${item.url}\nDESCRIÇÃO: ${item.descricao}\nCONTEUDO:\n${item.conteudo_texto}` 
            }
          ]
          const todasImagens = item.og_image ? [{ url: item.url, imagem: item.og_image }] : []

          const dadosEstruturados = await extrairComGemini(gemini_prompt, todosConteudos, todasImagens)
          const locaisIds = {}

          if (dadosEstruturados?.locais?.length) {
            for (const local of dadosEstruturados.locais) {
              try {
                const resLocal = await supabaseRequest('POST', 'locais_fixos', {
                  nome: local.nome,
                  descricao: local.descricao,
                  endereco: local.endereco || null,
                  preco_medio: local.preco_medio || null,
                  fonte_url: local.fonte_url || item.url,
                  ia_inferido: Boolean(local.ia_inferido),
                  tags_consumo: local.tags_consumo || [],
                  distancia_mooca: parseInt(local.distancia_mooca) || 30,
                  imagem_hero_path: local.imagem_hero_path
                })
                if (resLocal?.length) {
                  locaisIds[local.nome] = resLocal[0].id
                  locaisCount++
                }
              } catch (e) {}
            }
          }

          if (dadosEstruturados?.eventos?.length) {
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
                const resEv = await supabaseRequest('POST', 'eventos', novoEvento)
                if (resEv?.length) eventosCount++
              } catch (e) {}
            }
          }

          // Marcar como processado
          await supabaseRequest('PATCH', `scraper_queue?id=eq.${item.id}`, { status: 'processed' })
          logMessage(`✅ Item processado e removido da fila ativa com sucesso.`)

        } catch (err) {
          logMessage(`❌ Falha no processamento: ${err.message}`)
          if (isQuotaError(err.message)) {
            bloquear(`GEMINI_QUOTA_EXCEEDED: ${err.message.substring(0, 100)}`)
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

    // Salvar Log Histórico
    await supabaseRequest('POST', 'historico_scraping', {
      executado_em: new Date().toISOString(),
      sucesso: true,
      locais_processados: locaisCount,
      eventos_novos: eventosCount,
      logs: executionLogs.join('\n')
    }).catch(() => {})

    return res.status(200).json({
      sucesso: true,
      enfileirados: enfileiradosCount,
      processados: locaisCount > 0 || eventosCount > 0 ? 1 : 0,
      logs: executionLogs.join('\n')
    })

  } catch (err) {
    logMessage(`❌ FATAL: ${err.message}`)
    try {
      await supabaseRequest('POST', 'historico_scraping', {
        sucesso: false,
        logs: executionLogs.join('\n')
      })
    } catch (e) {}
    return res.status(500).json({ sucesso: false, error: err.message, logs: executionLogs.join('\n') })
  }
}
