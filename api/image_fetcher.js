// Vercel Serverless Function to fetch missing images
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

let executionLogs = [];
function logMessage(msg) {
  console.log(msg);
  executionLogs.push(`[${new Date().toISOString()}] ${msg}`);
}

async function supabaseRequest(metodo, endpoint, dados = null) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Credenciais Supabase ausentes.');
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };
  const config = { method: metodo, headers };
  if (dados) config.body = JSON.stringify(dados);
  const response = await fetch(url, config);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase ${response.status}: ${text}`);
  }
  if (response.status === 204 || response.headers.get('content-length') === '0') return null;
  try {
    return await response.json();
  } catch(e) { return null; }
}

async function fetchImageForQuery(query) {
  try {
    const searchUrl = `https://images.search.yahoo.com/search/images?p=${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const html = await res.text();
    
    // Yahoo usa <img> com data-src para lazy loading
    const matches = [...html.matchAll(/data-src=['"](https?:\/\/[^'"]+)['"]/ig)];
    if (matches && matches.length > 0) {
      for (const m of matches) {
        if (!m[1].includes('yimg.com') && !m[1].includes('clear.gif')) {
          return m[1]; 
        }
      }
    }
    return null;
  } catch (e) {
    logMessage(`⚠️ Erro busca img "${query}": ${e.message}`);
    return null;
  }
}

export default async function handler(req, res) {
  // Somente POST ou via CRON (GET)
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Verifica Auth se não for requisição local ou do cron (Vercel envia Authorization ou chamamos sem auth internamente)
  const authHeader = req.headers.authorization;
  if (req.method === 'POST' && authHeader !== `Bearer ${process.env.CRON_SECRET || 'dev'}`) {
    if (process.env.NODE_ENV === 'production' && !req.headers['x-vercel-cron']) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  logMessage("🚀 Iniciando Image Fetcher (Vercel Serverless)...");
  
  try {
    // 1. Processar Locais Fixos (limite 3 para não estourar os 10s da Vercel free)
    logMessage("Procurando locais sem imagem...");
    const locais = await supabaseRequest('GET', 'locais_fixos?imagem_hero_path=is.null&limit=3');
    if (locais && locais.length > 0) {
      logMessage(`Encontrados ${locais.length} locais. Processando...`);
      for (const local of locais) {
        const imgUrl = await fetchImageForQuery(`${local.nome} São Paulo evento`);
        if (imgUrl) {
          logMessage(`✅ Img local ${local.nome}: ${imgUrl}`);
          await supabaseRequest('PATCH', `locais_fixos?id=eq.${local.id}`, { imagem_hero_path: imgUrl });
        }
      }
    } else {
      logMessage("Nenhum local precisando de imagem neste lote.");
    }

    // 2. Processar Eventos (limite 3)
    logMessage("Procurando eventos sem imagem...");
    const eventos = await supabaseRequest('GET', 'eventos?imagem_flyer_path=is.null&limit=3');
    if (eventos && eventos.length > 0) {
      logMessage(`Encontrados ${eventos.length} eventos. Processando...`);
      for (const evento of eventos) {
        const imgUrl = await fetchImageForQuery(`${evento.titulo} evento nerd geek são paulo`);
        if (imgUrl) {
          logMessage(`✅ Img evento ${evento.titulo}: ${imgUrl}`);
          await supabaseRequest('PATCH', `eventos?id=eq.${evento.id}`, { imagem_flyer_path: imgUrl });
        }
      }
    } else {
      logMessage("Nenhum evento precisando de imagem neste lote.");
    }

    logMessage("🏁 Fim do processamento de imagens.");
    
    await supabaseRequest('POST', 'historico_scraping', {
      executado_em: new Date().toISOString(),
      sucesso: true,
      locais_processados: 0,
      eventos_novos: 0,
      logs: "=== BUSCA DE IMAGENS ===\n" + executionLogs.join('\n')
    }).catch(() => {});

    return res.status(200).json({ status: 'ok', logs: executionLogs });

  } catch (err) {
    logMessage(`❌ Falha Crítica: ${err.message}`);
    
    await supabaseRequest('POST', 'historico_scraping', {
      executado_em: new Date().toISOString(),
      sucesso: false,
      locais_processados: 0,
      eventos_novos: 0,
      logs: "=== BUSCA DE IMAGENS (Erro) ===\n" + executionLogs.join('\n')
    }).catch(() => {});

    return res.status(500).json({ error: err.message, logs: executionLogs });
  }
}
