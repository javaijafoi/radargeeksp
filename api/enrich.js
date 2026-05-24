// Vercel Serverless Function to enrich future events in the cloud
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY
const GEMINI_API_KEY = process.env.GEMINI_API_KEY

let executionLogs = []
function logMessage(msg) {
  console.log(msg)
  executionLogs.push(`[${new Date().toISOString()}] ${msg}`)
}

async function extrairOgImage(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'text/html' },
      signal: AbortSignal.timeout(6000)
    })
    if (!res.ok) return null
    const text = await res.text()
    const m = text.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
           || text.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
    if (m && m[1]?.startsWith('http')) return m[1]
    return null
  } catch (e) { return null }
}

async function buscarEventosNaWeb(titulo) {
  const query = `${titulo} evento sao paulo`
  logMessage(`🔍 [Search] Buscando informações para: "${query}"...`)
  let urls = []
  
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
  } catch (e) { logMessage(`  ⚠️ Busca DDG falhou: ${e.message}`) }

  const imagensMapeadas = []
  for (const url of urls) {
    const img = await extrairOgImage(url)
    if (img) imagensMapeadas.push({ url, img })
  }

  return { urls, imagensMapeadas }
}

async function identificarDadosComGemini(evento, urls, imagensMapeadas) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY ausente.')

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

async function supabaseRequest(metodo, endpoint, dados = null) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Credenciais Supabase ausentes.")
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`
  const headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation"
  }
  const config = { method: metodo, headers }
  if (dados) config.body = JSON.stringify(dados)
  const response = await fetch(url, config)
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Erro Supabase (${response.status}): ${text}`)
  }
  return await response.json()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' })

  executionLogs = []
  logMessage("Iniciando rotina de enriquecimento de eventos futuros na nuvem...")

  try {
    const isoNow = new Date().toISOString()
    logMessage(`📅 Buscando eventos futuros a partir de: ${isoNow}`)
    const eventos = await supabaseRequest('GET', `eventos?data_hora=gte.${isoNow}`)
    
    const eventosFaltantes = eventos.filter(ev => {
      const semImagemReal = !ev.imagem_flyer_path || 
                            ev.imagem_flyer_path.includes('placehold.co') || 
                            ev.imagem_flyer_path.includes('unsplash.com')
      const semFonte = !ev.fonte_url
      return semImagemReal || semFonte
    })

    logMessage(`⚡ Eventos futuros necessitando enriquecimento: ${eventosFaltantes.length}`)
    let enriquecidosCount = 0

    // Limit to process at most 5 events per execution on Vercel serverless to avoid timeouts (15s limit)
    const limit = eventosFaltantes.slice(0, 5)
    for (const ev of limit) {
      logMessage(`👉 Processando: "${ev.titulo}"`)
      try {
        const { urls, imagensMapeadas } = await buscarEventosNaWeb(ev.titulo)
        if (urls.length === 0) {
          logMessage(`  ⚠️ Sem URLs encontradas.`)
          continue
        }

        const dadosEnriquecidos = await identificarDadosComGemini(ev, urls, imagensMapeadas)
        const payload = {}
        if (dadosEnriquecidos.fonte_url && dadosEnriquecidos.fonte_url.startsWith('http')) {
          payload.fonte_url = dadosEnriquecidos.fonte_url
        }
        if (dadosEnriquecidos.imagem_flyer_path && dadosEnriquecidos.imagem_flyer_path.startsWith('http')) {
          payload.imagem_flyer_path = dadosEnriquecidos.imagem_flyer_path
        }

        if (Object.keys(payload).length > 0) {
          await supabaseRequest('PATCH', `eventos?id=eq.${ev.id}`, payload)
          logMessage(`  ✅ Evento enriquecido com sucesso!`)
          enriquecidosCount++
        }
      } catch (err) {
        logMessage(`  ❌ Erro processamento: ${err.message}`)
      }
      // Wait between search cycles
      await new Promise(r => setTimeout(r, 1000))
    }

    logMessage(`🎉 Processamento concluído. ${enriquecidosCount} eventos enriquecidos nesta rodada.`)
    
    await supabaseRequest('POST', 'historico_scraping', {
      executado_em: new Date().toISOString(),
      sucesso: true,
      locais_processados: 0,
      eventos_novos: enriquecidosCount,
      logs: "=== ENRIQUECIMENTO DE EVENTOS ===\n" + executionLogs.join('\n')
    }).catch(() => {});

    return res.status(200).json({ sucesso: true, enriquecidos: enriquecidosCount, logs: executionLogs.join('\n') })
  } catch (err) {
    logMessage(`❌ FATAL ERROR: ${err.message}`)
    
    await supabaseRequest('POST', 'historico_scraping', {
      executado_em: new Date().toISOString(),
      sucesso: false,
      locais_processados: 0,
      eventos_novos: 0,
      logs: "=== ENRIQUECIMENTO DE EVENTOS (Erro) ===\n" + executionLogs.join('\n')
    }).catch(() => {});

    return res.status(500).json({ sucesso: false, error: err.message, logs: executionLogs.join('\n') })
  }
}
