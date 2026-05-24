import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ─── Load Environment Variables ──────────────────────────────────────────────
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

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Erro: SUPABASE_URL ou SUPABASE_KEY não configuradas no .env")
  process.exit(1)
}

// Helper to make Supabase API requests
async function supabaseRequest(metodo, endpoint, dados = null) {
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

// Extract og:image from a webpage
async function extrairOgImage(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'text/html' },
      signal: AbortSignal.timeout(5000)
    })
    if (!res.ok) return null
    const text = await res.text()
    const m = text.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
           || text.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
    if (m && m[1]?.startsWith('http')) return m[1]
    return null
  } catch (e) { return null }
}

// Search web using DuckDuckGo
async function buscarEventosNaWeb(titulo) {
  const query = `${titulo} evento sao paulo`
  console.log(`🔍 [Search] Buscando informações para: "${query}"...`)
  let urls = []
  let snippets = []

  try {
    const encoded = encodeURIComponent(query)
    const res = await fetch(`https://lite.duckduckgo.com/lite/?q=${encoded}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(8000)
    })
    if (res.ok) {
      const html = await res.text()
      const urlRegex = /uddg=(https?[^&"']+)/g
      let m
      while ((m = urlRegex.exec(html)) !== null) {
        try { urls.push(decodeURIComponent(m[1])) } catch (e) {}
      }
      urls = [...new Set(urls)].slice(0, 4)
    }
  } catch (e) { console.error(`  ⚠️ Busca DDG falhou: ${e.message}`) }

  // Extract metadata images from the found pages
  const imagensMapeadas = []
  for (const url of urls) {
    const img = await extrairOgImage(url)
    if (img) imagensMapeadas.push({ url, img })
  }

  return { urls, imagensMapeadas }
}

// Call Gemini to identify correct link and image
async function identificarDadosComGemini(evento, urls, imagensMapeadas) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY ausente.')
  }

  const prompt = `Você é um robô enriquecedor de dados. Recebemos um evento geek/nerd do banco de dados que está com link da fonte ou imagem flyer faltando.
Nome do Evento: "${evento.titulo}"
Descrição Atual: "${evento.descricao}"
Endereço Atual: "${evento.endereco}"

Links encontrados na busca sobre o evento:
${urls.map((u, i) => `${i+1}. ${u}`).join('\n')}

Imagens extraídas (og:image) correspondentes aos links:
${imagensMapeadas.map(m => `• Link: ${m.url} -> Imagem: ${m.img}`).join('\n')}

INSTRUÇÕES:
1. Encontre a URL da fonte (link oficial para detalhes ou compra de ingressos - Sympla, Eventbrite, Instagram do organizador, etc.). Ela deve ser um dos links listados acima ou um link oficial correspondente.
2. Identifique a URL da imagem oficial (flyer ou banner) do evento. Dê preferência absoluta para imagens reais extraídas das páginas (og:image).
3. Se não houver imagem real disponível de forma alguma, você pode gerar um fallback temático do Unsplash que represente o evento (ex: https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?q=80&w=600).

Retorne APENAS um JSON válido no formato abaixo, sem markdown de código ou textos explicativos:
{
  "fonte_url": "URL_DO_EVENTO_AQUI",
  "imagem_flyer_path": "URL_DO_FLYER_AQUI"
}`

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`
  const res = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 } }),
    signal: AbortSignal.timeout(30000)
  })

  if (!res.ok) throw new Error(`Gemini respondeu com status ${res.status}`)
  const data = await res.json()
  let txt = data.candidates[0].content.parts[0].text
  txt = txt.replace(/```json/g, '').replace(/```/g, '').trim()
  return JSON.parse(txt)
}

async function run() {
  console.log("=== INICIANDO SCRIPT DE ENRIQUECIMENTO DE EVENTOS ===")
  try {
    // 1. Fetch events scheduled for the future
    const isoNow = new Date().toISOString()
    console.log(`📅 Buscando eventos futuros a partir de: ${isoNow}`)
    const eventos = await supabaseRequest('GET', `eventos?data_hora=gte.${isoNow}`)
    console.log(`📋 Total de eventos futuros encontrados: ${eventos.length}`)

    // 2. Filter events that need enrichment
    const eventosFaltantes = eventos.filter(ev => {
      const semImagemReal = !ev.imagem_flyer_path || 
                            ev.imagem_flyer_path.includes('placehold.co') || 
                            ev.imagem_flyer_path.includes('unsplash.com')
      const semFonte = !ev.fonte_url
      return semImagemReal || semFonte
    })

    console.log(`⚡ Eventos futuros que precisam de imagens/links reais: ${eventosFaltantes.length}\n`)

    for (const ev of eventosFaltantes) {
      console.log(`👉 Processando evento: "${ev.titulo}" (ID: ${ev.id})`)
      try {
        const { urls, imagensMapeadas } = await buscarEventosNaWeb(ev.titulo)
        if (urls.length === 0) {
          console.log(`  ⚠️ Nenhuma URL correspondente encontrada na busca. Pulando...`)
          continue
        }

        const dadosEnriquecidos = await identificarDadosComGemini(ev, urls, imagensMapeadas)
        console.log(`  💡 Gemini sugeriu:`)
        console.log(`     - Fonte: ${dadosEnriquecidos.fonte_url}`)
        console.log(`     - Flyer: ${dadosEnriquecidos.imagem_flyer_path}`)

        // 3. Update event in Supabase
        const payload = {}
        if (dadosEnriquecidos.fonte_url && dadosEnriquecidos.fonte_url.startsWith('http')) {
          payload.fonte_url = dadosEnriquecidos.fonte_url
        }
        if (dadosEnriquecidos.imagem_flyer_path && dadosEnriquecidos.imagem_flyer_path.startsWith('http')) {
          payload.imagem_flyer_path = dadosEnriquecidos.imagem_flyer_path
        }

        if (Object.keys(payload).length > 0) {
          await supabaseRequest('PATCH', `eventos?id=eq.${ev.id}`, payload)
          console.log(`  ✅ Evento "${ev.titulo}" atualizado com sucesso!`)
        } else {
          console.log(`  ℹ️ Sem dados válidos para atualizar.`)
        }
      } catch (err) {
        console.error(`  ❌ Erro ao processar evento "${ev.titulo}": ${err.message}`)
      }
      // Wait a bit between calls to respect rate limits
      await new Promise(r => setTimeout(r, 2000))
      console.log('---')
    }

    console.log("\n🎉 Processo de enriquecimento de eventos finalizado.")
  } catch (err) {
    console.error(`❌ Erro fatal: ${err.message}`)
  }
}

run()
