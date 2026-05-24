import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

import OpenAI from 'openai';

let executionLogs = [];
function logMessage(msg) {
  console.log(msg);
  executionLogs.push(`[${new Date().toISOString()}] ${msg}`);
}

// ==========================================
// SUPABASE API
// ==========================================
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
  
  let retries = 3;
  while (retries > 0) {
    try {
      const response = await fetch(url, config);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Supabase ${response.status}: ${text}`);
      }
      if (response.status === 204 || response.headers.get('content-length') === '0') return null;
      try {
        return await response.json();
      } catch(e) { return null; }
    } catch(err) {
      retries--;
      if (retries === 0) throw err;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

// ==========================================
// MINERAÇÃO WEB E FILTRAGEM
// ==========================================
async function queryBraveSearch(query) {
  if (!BRAVE_API_KEY) {
    logMessage("⚠️ BRAVE_API_KEY ausente. Busca ignorada.");
    return [];
  }
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'X-Subscription-Token': BRAVE_API_KEY
    }
  });
  if (!res.ok) throw new Error(`Brave retornou status ${res.status}`);
  const data = await res.json();
  if (!data.web || !data.web.results) return [];
  return data.web.results.map(r => r.url);
}

async function buscarNaWeb(query) {
  logMessage(`🔍 Buscando na web via Brave por: ${query}...`);
  let urls = [];
  try {
    urls = await queryBraveSearch(query);
  } catch (e) {
    logMessage(`  ⚠️ Brave Search falhou: ${e.message}`);
  }
  logMessage(`  ✅ ${urls.length} URLs encontradas`);
  return urls;
}

async function filtrarUrlsNovas(urls) {
  if (urls.length === 0) return [];
  try {
    const encodedUrls = urls.map(u => encodeURIComponent(u).replace(/,/g, '%2C'));
    const inClause = `in.(${encodedUrls.join(',')})`;

    const [ev, LF, sq] = await Promise.all([
      supabaseRequest('GET', `eventos?fonte_url=${inClause}&select=fonte_url`).catch(() => []),
      supabaseRequest('GET', `locais_fixos?fonte_url=${inClause}&select=fonte_url`).catch(() => []),
      supabaseRequest('GET', `scraper_queue?url=${inClause}&select=url`).catch(() => [])
    ]);

    const urlsConhecidas = new Set([
      ...(ev || []).map(item => item.fonte_url),
      ...(LF || []).map(item => item.fonte_url),
      ...(sq || []).map(item => item.url)
    ].filter(Boolean));

    return urls.filter(url => !urlsConhecidas.has(url));
  } catch (e) {
    return urls;
  }
}

async function extrairPaginaEstruturada(url) {
  logMessage(`📥 Raspando página: "${url}"`);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return null;
    const html = await res.text();

    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    let titulo = titleMatch ? titleMatch[1].trim() : '';
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
    let descricao = descMatch ? descMatch[1].trim() : '';
    const imgMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    const og_image = imgMatch && imgMatch[1]?.startsWith('http') ? imgMatch[1] : null;

    let cleanHtml = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
    let text = cleanHtml.replace(/<[^>]+>/gm, ' ').replace(/\s+/g, ' ').trim();
    const conteudo_texto = text.substring(0, 4000);

    return { url, titulo, descricao, conteudo_texto, og_image };
  } catch (e) {
    return null;
  }
}

// ==========================================
// GEMINI PROCESSING
// ==========================================
async function isQuotaError(msg) {
  const lower = (msg || '').toLowerCase();
  return lower.includes('429') || lower.includes('quota') || lower.includes('resource_exhausted') || lower.includes('503');
}

async function extrairComGemini(promptBase, item) {
  const textoFontes = `\n--- FONTE 1: ${item.titulo || item.url} ---\nFONTE URL: ${item.url}\nDESCRIÇÃO: ${item.descricao}\nCONTEUDO:\n${item.conteudo_texto}`;
  const imagensInfo = item.og_image ? `\n\n🖼️ IMAGEM REAL DA PÁGINA: ${item.og_image}` : '\n\n[Sem imagens reais — use Unsplash]';
  const prompt = `${promptBase}${imagensInfo}\n\nFONTES:\n${textoFontes}`;

  try {
    if (!GEMINI_API_KEY) throw new Error('Gemini API Key não configurada.');
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return parseJsonResp(text);
  } catch (err) {
    if (await isQuotaError(err.message)) {
      logMessage(`⚠️ Limite do Gemini atingido. Acionando Fallback Groq (llama3-70b-8192)...`);
      if (!GROQ_API_KEY) throw new Error("Cota Gemini excedida e GROQ_API_KEY ausente.");
      const openai = new OpenAI({ baseURL: "https://api.groq.com/openai/v1", apiKey: GROQ_API_KEY });
      const completion = await openai.chat.completions.create({
        model: "llama3-70b-8192",
        messages: [{ role: "user", content: prompt }]
      });
      return parseJsonResp(completion.choices[0].message.content);
    }
    throw err;
  }
}

function parseJsonResp(text) {
  const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/{[\s\S]*}/);
  if (jsonMatch) return JSON.parse(jsonMatch[1] || jsonMatch[0]);
  return JSON.parse(text);
}

// ==========================================
// ROTINAS PRINCIPAIS
// ==========================================

async function rotinaScrape() {
  logMessage("🚀 INICIANDO ESTEIRA DE SCRAPING (GitHub Actions) 🚀");
  let locaisCount = 0;
  let eventosCount = 0;

  try {
    // 1. Carregar configurações
    const configData = await supabaseRequest('GET', 'scraper_config?id=eq.1&select=*');
    if (!configData || configData.length === 0) throw new Error("scraper_config vazio.");
    const { search_queries, gemini_prompt } = configData[0];

    // 2. Coletar URLs da Busca (TODOS OS TERMOS)
    logMessage(`🌐 Iniciando busca em massa para ${search_queries.length} termos...`);
    let todasUrls = [];
    for (const query of search_queries) {
      const urls = await buscarNaWeb(query);
      todasUrls.push(...urls);
      await new Promise(r => setTimeout(r, 4000)); // Espera 4s entre pesquisas para DDG não bloquear
    }

    // 3. Coletar Feed RSS
    const feedItems = await supabaseRequest('GET', 'scraper_feed?ativo=eq.true&select=url').catch(() => []);
    todasUrls.push(...feedItems.map(i => i.url));

    // 4. Filtrar e Salvar no Staging
    todasUrls = [...new Set(todasUrls)];
    const urlsNovas = await filtrarUrlsNovas(todasUrls);
    logMessage(`📊 Das ${todasUrls.length} URLs, ${urlsNovas.length} são novas inéditas.`);

    let enfileiradosCount = 0;
    for (const url of urlsNovas) {
      const pag = await extrairPaginaEstruturada(url);
      if (pag) {
        await supabaseRequest('POST', 'scraper_queue', {
          url: pag.url, titulo: pag.titulo, descricao: pag.descricao,
          conteudo_texto: pag.conteudo_texto, og_image: pag.og_image, status: 'pending'
        }).catch(()=>{});
        enfileiradosCount++;
      }
      await new Promise(r => setTimeout(r, 1000)); // Espera 1s entre scrapes
    }
    logMessage(`🏁 Fila atualizada: +${enfileiradosCount} pendentes.`);

    // 5. Processamento na Esteira do Gemini
    logMessage("🧠 Iniciando consumo da fila com o Gemini...");
    while (true) {
      const pendingItems = await supabaseRequest('GET', 'scraper_queue?status=eq.pending&order=criado_em.asc&limit=1');
      if (!pendingItems || pendingItems.length === 0) {
        logMessage("✅ Fila vazia! Tudo processado.");
        break;
      }

      const item = pendingItems[0];
      logMessage(`🤖 Lendo: ${item.url}`);
      try {
        const dadosEstruturados = await extrairComGemini(gemini_prompt, item);
        const locaisIds = {};

        if (dadosEstruturados?.locais?.length) {
          for (const local of dadosEstruturados.locais) {
            const resLocal = await supabaseRequest('POST', 'locais_fixos', {
              nome: local.nome, descricao: local.descricao, endereco: local.endereco,
              preco_medio: local.preco_medio, fonte_url: local.fonte_url || item.url,
              ia_inferido: Boolean(local.ia_inferido), tags_consumo: local.tags_consumo || [],
              imagem_hero_path: local.imagem_hero_path || item.og_image
            }).catch(()=>{});
            if (resLocal?.length) { locaisIds[local.nome] = resLocal[0].id; locaisCount++; }
          }
        }

        if (dadosEstruturados?.eventos?.length) {
          for (const evento of dadosEstruturados.eventos) {
            const novoEvento = {
              titulo: evento.titulo, descricao: evento.descricao, endereco: evento.endereco,
              preco_entrada: evento.preco_entrada, fonte_url: evento.fonte_url || item.url,
              ia_inferido: Boolean(evento.ia_inferido), data_hora: new Date(evento.data_hora || Date.now()).toISOString(),
              ia_score_cilada: parseInt(evento.ia_score_cilada) || 5, kid_friendly: Boolean(evento.kid_friendly),
              imagem_flyer_path: evento.imagem_flyer_path || item.og_image
            };
            if (evento.local_nome && locaisIds[evento.local_nome]) novoEvento.local_id = locaisIds[evento.local_nome];
            const resEv = await supabaseRequest('POST', 'eventos', novoEvento).catch(()=>{});
            if (resEv?.length) eventosCount++;
          }
        }

        await supabaseRequest('PATCH', `scraper_queue?id=eq.${item.id}`, { status: 'processed' });
        logMessage(`✅ Sucesso. Esperando 10s para não estourar a cota...`);
        await new Promise(r => setTimeout(r, 10000)); // Super delay pro Gemini

      } catch (err) {
        logMessage(`❌ Erro Gemini: ${err.message}`);
        if (await isQuotaError(err.message)) {
          logMessage("🚫 Cota do Gemini estourada (429/503). Abortando esteira de processamento por agora.");
          break; // Sai do loop e deixa o resto pra próxima execução de 4h
        } else {
          const novasTentativas = (item.tentativas || 0) + 1;
          const novoStatus = novasTentativas >= 3 ? 'failed' : 'pending';
          await supabaseRequest('PATCH', `scraper_queue?id=eq.${item.id}`, { status: novoStatus, tentativas: novasTentativas }).catch(()=>{});
          await new Promise(r => setTimeout(r, 5000));
        }
      }
    }

    await supabaseRequest('POST', 'historico_scraping', {
      executado_em: new Date().toISOString(),
      sucesso: true, locais_processados: locaisCount, eventos_novos: eventosCount,
      logs: "=== ESTEIRA COMPLETA GITHUB ACTIONS ===\n" + executionLogs.join('\n')
    }).catch(() => {});

  } catch (err) {
    logMessage(`❌ FATAL ERROR: ${err.message}`);
    await supabaseRequest('POST', 'historico_scraping', {
      executado_em: new Date().toISOString(),
      sucesso: false, locais_processados: 0, eventos_novos: 0,
      logs: "=== ERRO ESTEIRA ===\n" + executionLogs.join('\n')
    }).catch(() => {});
    process.exit(1);
  }
}

async function webSearchSnippets(query) {
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
    const html = await res.text();
    const snippets = [...html.matchAll(/<a class="result__snippet[^>]*>(.*?)<\/a>/gi)];
    return snippets.slice(0, 3).map(m => m[1].replace(/<\/?[^>]+(>|$)/g, "")).join(" | ");
  } catch (e) { return ""; }
}

async function callGemini(promptText) {
  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(promptText);
    return parseJsonResp(result.response.text());
  } catch (err) {
    if (await isQuotaError(err.message)) {
      logMessage(`⚠️ Fallback Groq acionado na Manutenção...`);
      const openai = new OpenAI({ baseURL: "https://api.groq.com/openai/v1", apiKey: GROQ_API_KEY });
      const completion = await openai.chat.completions.create({
        model: "llama3-70b-8192",
        messages: [{ role: "user", content: promptText }]
      });
      return parseJsonResp(completion.choices[0].message.content);
    }
    throw err;
  }
}

async function rotinaMaintenance() {
  logMessage("🛠️ INICIANDO ROTINA DE MANUTENÇÃO (GitHub Actions) 🛠️");
  try {
    // Deduplicação
    logMessage("🔍 Buscando eventos futuros para deduplicação...");
    const hoje = new Date().toISOString();
    const eventos = await supabaseRequest('GET', `eventos?data_hora=gte.${hoje}&select=id,titulo,descricao,data_hora,endereco`);
    
    if (eventos && eventos.length > 1) {
      const dedupPrompt = `
      Você é um assistente de deduplicação. Encontre duplicatas no array JSON.
      Retorne APENAS um JSON: { "merges": [{ "keep_id": "uuid", "delete_id": "uuid", "merged_descricao": "..." }] }
      Se não houver, retorne { "merges": [] }.
      Dados: ${JSON.stringify(eventos)}
      `;
      try {
        const dedupResult = await callGemini(dedupPrompt);
        for (const m of (dedupResult.merges || [])) {
          if (m.keep_id && m.delete_id && m.keep_id !== m.delete_id) {
            logMessage(`Mesclando duplicata ${m.delete_id} em ${m.keep_id}...`);
            await supabaseRequest('PATCH', `eventos?id=eq.${m.keep_id}`, { descricao: m.merged_descricao });
            await supabaseRequest('DELETE', `eventos?id=eq.${m.delete_id}`);
          }
        }
      } catch (e) { logMessage(`⚠️ Erro Dedup: ${e.message}`); }
    }

    // Enriquecimento Locais (limit 3)
    const locais = await supabaseRequest('GET', `locais_fixos?order=atualizado_em.asc.nullsfirst&limit=3`);
    for (const local of (locais || [])) {
      logMessage(`Enriquecendo local: ${local.nome}`);
      const snippets = await webSearchSnippets(`${local.nome} São Paulo geek nerd`);
      const prompt = `Atualize os dados baseado nos snippets recentes. Retorne JSON: {"descricao": "...", "tags_consumo": [], "preco_medio": "..."} \nLocal: ${JSON.stringify(local)}\nSnippets: ${snippets}`;
      try {
        const res = await callGemini(prompt);
        await supabaseRequest('PATCH', `locais_fixos?id=eq.${local.id}`, { descricao: res.descricao || local.descricao, tags_consumo: res.tags_consumo || local.tags_consumo, preco_medio: res.preco_medio || local.preco_medio, atualizado_em: new Date().toISOString() });
      } catch(e) {}
      await new Promise(r => setTimeout(r, 4000));
    }

    // Buscar imagens Yahoo para locais e eventos faltantes
    logMessage("🖼️ Buscando imagens faltantes...");
    const locaisSemImg = await supabaseRequest('GET', 'locais_fixos?imagem_hero_path=is.null&limit=3');
    for (const l of (locaisSemImg || [])) {
      const u = `https://images.search.yahoo.com/search/images?p=${encodeURIComponent(l.nome + " sao paulo evento")}`;
      try {
        const h = await (await fetch(u)).text();
        const m = [...h.matchAll(/data-src=['"](https?:\/\/[^'"]+)['"]/ig)].filter(x => !x[1].includes('yimg.com'))[0];
        if (m) await supabaseRequest('PATCH', `locais_fixos?id=eq.${l.id}`, { imagem_hero_path: m[1] });
      } catch(e) {}
      await new Promise(r => setTimeout(r, 2000));
    }

    await supabaseRequest('POST', 'historico_scraping', {
      executado_em: new Date().toISOString(),
      sucesso: true, locais_processados: 0, eventos_novos: 0,
      logs: "=== MANUTENÇÃO GITHUB ACTIONS ===\n" + executionLogs.join('\n')
    }).catch(() => {});

  } catch(e) {
    logMessage(`❌ FATAL ERRO MANUTENÇÃO: ${e.message}`);
    process.exit(1);
  }
}

// --------------------------------------------------------------------------------------
const args = process.argv.slice(2);
if (args.includes('--scrape')) {
  rotinaScrape();
} else if (args.includes('--maintenance')) {
  rotinaMaintenance();
} else {
  console.log("Forneça --scrape ou --maintenance");
}
