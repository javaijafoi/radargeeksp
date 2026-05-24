import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

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

async function webSearchSnippets(query) {
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    const html = await res.text();
    const snippets = [...html.matchAll(/<a class="result__snippet[^>]*>(.*?)<\/a>/gi)];
    return snippets.slice(0, 3).map(m => m[1].replace(/<\/?[^>]+(>|$)/g, "")).join(" | ");
  } catch (e) {
    return "";
  }
}

async function callGemini(promptText) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY ausente.');
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const result = await model.generateContent(promptText);
  const text = result.response.text();
  
  const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/{[\s\S]*}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[1] || jsonMatch[0]);
  }
  return JSON.parse(text);
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const authHeader = req.headers.authorization;
  if (req.method === 'POST' && authHeader !== `Bearer ${process.env.CRON_SECRET || 'dev'}`) {
    if (process.env.NODE_ENV === 'production' && !req.headers['x-vercel-cron']) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  logMessage("🚀 Iniciando Maintenance Routine (Deduplicação & Enriquecimento)...");

  try {
    // ==========================================
    // PASSO 1: DEDUPLICAÇÃO DE EVENTOS FUTUROS
    // ==========================================
    logMessage("🔍 Buscando eventos futuros para deduplicação...");
    const hoje = new Date().toISOString();
    const eventos = await supabaseRequest('GET', `eventos?data_hora=gte.${hoje}&select=id,titulo,descricao,data_hora,endereco`);
    
    if (eventos && eventos.length > 1) {
      logMessage(`Analisando ${eventos.length} eventos para fusão...`);
      const dedupPrompt = `
      Você é um assistente de deduplicação de banco de dados. 
      Analise o seguinte array JSON de eventos geeks. 
      Sua missão é encontrar eventos duplicados (mesmo evento com nomes ligeiramente diferentes, ou cadastrados duas vezes).
      Para cada par/grupo de duplicatas que encontrar, você deve MESCLAR as descrições no item principal, e instruir a deleção do secundário.
      
      Retorne APENAS um JSON no seguinte formato rigoroso:
      {
        "merges": [
          {
            "keep_id": "uuid-do-evento-que-vai-ficar",
            "delete_id": "uuid-do-evento-que-vai-ser-apagado",
            "merged_descricao": "A descrição mesclando informações importantes de ambos, caso haja."
          }
        ]
      }
      Se não houver NENHUMA duplicata clara, retorne { "merges": [] }

      Dados:
      ${JSON.stringify(eventos)}
      `;

      try {
        const dedupResult = await callGemini(dedupPrompt);
        const merges = dedupResult.merges || [];
        logMessage(`Encontradas ${merges.length} duplicatas para mesclar.`);
        
        for (const m of merges) {
          if (m.keep_id && m.delete_id && m.keep_id !== m.delete_id) {
            logMessage(`Mesclando ${m.delete_id} em ${m.keep_id}...`);
            await supabaseRequest('PATCH', `eventos?id=eq.${m.keep_id}`, { 
              descricao: m.merged_descricao,
              atualizado_em: new Date().toISOString()
            });
            await supabaseRequest('DELETE', `eventos?id=eq.${m.delete_id}`);
            logMessage(`✅ Deleção de duplicata concluída.`);
          }
        }
      } catch (e) {
        logMessage(`⚠️ Erro na IA de Deduplicação: ${e.message}`);
      }
    } else {
      logMessage("Poucos eventos para deduplicar.");
    }

    // ==========================================
    // PASSO 2: ENRIQUECIMENTO (Locais)
    // ==========================================
    logMessage("🔍 Buscando locais desatualizados para enriquecimento...");
    // Pega os 2 mais velhos (atualizado_em asc ou nulo)
    const locais = await supabaseRequest('GET', `locais_fixos?order=atualizado_em.asc.nullsfirst&limit=2`);
    
    if (locais && locais.length > 0) {
      for (const local of locais) {
        logMessage(`Enriquecendo local: ${local.nome}`);
        const snippets = await webSearchSnippets(`${local.nome} São Paulo geek nerd`);
        
        const enrichPrompt = `
        Você é um assistente de atualização de banco de dados.
        Atualize os dados deste local geek baseado nos trechos de busca recentes (snippets).
        Não invente dados. Se não houver nada de novo nos snippets, apenas melhore a descrição atual.
        
        Local atual: ${JSON.stringify(local)}
        Trechos recentes da Web: "${snippets}"
        
        Retorne APENAS um JSON no formato (ajuste tags e preco_medio se encontrar info nova):
        {
          "descricao": "nova descrição...",
          "tags_consumo": ["tag1", "tag2"],
          "preco_medio": "$ a $$$ (ou info exata)"
        }
        `;
        
        try {
          const enrichResult = await callGemini(enrichPrompt);
          if (enrichResult.descricao) {
            await supabaseRequest('PATCH', `locais_fixos?id=eq.${local.id}`, {
              descricao: enrichResult.descricao,
              tags_consumo: enrichResult.tags_consumo || local.tags_consumo,
              preco_medio: enrichResult.preco_medio || local.preco_medio,
              atualizado_em: new Date().toISOString()
            });
            logMessage(`✅ Local ${local.nome} atualizado.`);
          }
        } catch(e) {
          logMessage(`⚠️ Erro enriquecendo local ${local.nome}: ${e.message}`);
          // Marca como atualizado mesmo com erro pra não ficar travado nele pra sempre
          await supabaseRequest('PATCH', `locais_fixos?id=eq.${local.id}`, { atualizado_em: new Date().toISOString() });
        }
      }
    }

    // ==========================================
    // PASSO 3: ENRIQUECIMENTO (Eventos)
    // ==========================================
    logMessage("🔍 Buscando eventos desatualizados para enriquecimento...");
    const evsToEnrich = await supabaseRequest('GET', `eventos?order=atualizado_em.asc.nullsfirst&limit=2`);
    
    if (evsToEnrich && evsToEnrich.length > 0) {
      for (const ev of evsToEnrich) {
        logMessage(`Enriquecendo evento: ${ev.titulo}`);
        const snippets = await webSearchSnippets(`${ev.titulo} São Paulo evento geek`);
        
        const enrichPrompt = `
        Atualize os dados deste evento geek baseado nos trechos de busca recentes (snippets).
        Não invente dados. Corrija o preco_entrada e endereco se os snippets revelarem informações reais, caso contrário mantenha os originais.
        
        Evento atual: ${JSON.stringify(ev)}
        Trechos da Web: "${snippets}"
        
        Retorne APENAS um JSON:
        {
          "descricao": "nova descrição...",
          "endereco": "novo ou mesmo",
          "preco_entrada": "novo ou mesmo"
        }
        `;
        
        try {
          const enrichResult = await callGemini(enrichPrompt);
          if (enrichResult.descricao) {
            await supabaseRequest('PATCH', `eventos?id=eq.${ev.id}`, {
              descricao: enrichResult.descricao,
              endereco: enrichResult.endereco || ev.endereco,
              preco_entrada: enrichResult.preco_entrada || ev.preco_entrada,
              atualizado_em: new Date().toISOString()
            });
            logMessage(`✅ Evento ${ev.titulo} atualizado.`);
          }
        } catch(e) {
          logMessage(`⚠️ Erro enriquecendo evento ${ev.titulo}: ${e.message}`);
          await supabaseRequest('PATCH', `eventos?id=eq.${ev.id}`, { atualizado_em: new Date().toISOString() });
        }
      }
    }

    logMessage("🏁 Fim do processamento de manutenção.");
    
    await supabaseRequest('POST', 'historico_scraping', {
      executado_em: new Date().toISOString(),
      sucesso: true,
      locais_processados: 0,
      eventos_novos: 0,
      logs: "=== MANUTENÇÃO ===\n" + executionLogs.join('\n')
    }).catch(() => {});

    return res.status(200).json({ status: 'ok', logs: executionLogs });

  } catch (err) {
    logMessage(`❌ Falha Crítica na Manutenção: ${err.message}`);
    
    await supabaseRequest('POST', 'historico_scraping', {
      executado_em: new Date().toISOString(),
      sucesso: false,
      locais_processados: 0,
      eventos_novos: 0,
      logs: "=== MANUTENÇÃO (Erro) ===\n" + executionLogs.join('\n')
    }).catch(() => {});

    return res.status(500).json({ error: err.message, logs: executionLogs });
  }
}
