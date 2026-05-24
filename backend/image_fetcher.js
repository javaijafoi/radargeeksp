import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar .env
const envPath = path.join(__dirname, '..', 'web', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    if (line.trim().startsWith('#') || !line.trim()) return;
    const parts = line.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
      if (key && value && !process.env[key]) process.env[key] = value;
    }
  });
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

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
    
    // Yahoo usa <img> com data-src para lazy loading (que contêm as urls reais grandes)
    const matches = [...html.matchAll(/data-src=['"](https?:\/\/[^'"]+)['"]/ig)];
    if (matches && matches.length > 0) {
      for (const m of matches) {
        if (!m[1].includes('yimg.com') && !m[1].includes('clear.gif')) {
          return m[1]; // Retorna a primeira útil
        }
      }
    }
    return null;
  } catch (e) {
    console.error(`  ⚠️ Erro na busca de imagem para "${query}":`, e.message);
    return null;
  }
}

async function main() {
  console.log("Iniciando Image Fetcher...");
  
  // 1. Processar Locais Fixos
  console.log("\nProcurando locais sem imagem_hero_path...");
  try {
    const locais = await supabaseRequest('GET', 'locais_fixos?imagem_hero_path=is.null');
    if (locais && locais.length > 0) {
      console.log(`Encontrados ${locais.length} locais sem imagem.`);
      for (const local of locais) {
        console.log(`🔍 Buscando imagem para local: ${local.nome}`);
        const imgUrl = await fetchImageForQuery(`${local.nome} São Paulo evento`);
        if (imgUrl) {
          console.log(`  ✅ Imagem encontrada: ${imgUrl}`);
          await supabaseRequest('PATCH', `locais_fixos?id=eq.${local.id}`, { imagem_hero_path: imgUrl });
        } else {
          console.log(`  ❌ Nenhuma imagem útil encontrada.`);
        }
        await new Promise(r => setTimeout(r, 1500));
      }
    } else {
      console.log("Nenhum local precisando de imagem.");
    }
  } catch(e) { console.error("Erro locais:", e.message); }

  // 2. Processar Eventos
  console.log("\nProcurando eventos sem imagem_flyer_path...");
  try {
    const eventos = await supabaseRequest('GET', 'eventos?imagem_flyer_path=is.null');
    if (eventos && eventos.length > 0) {
      console.log(`Encontrados ${eventos.length} eventos sem imagem.`);
      for (const evento of eventos) {
        console.log(`🔍 Buscando imagem para evento: ${evento.titulo}`);
        const imgUrl = await fetchImageForQuery(`${evento.titulo} evento nerd geek são paulo`);
        if (imgUrl) {
          console.log(`  ✅ Imagem encontrada: ${imgUrl}`);
          await supabaseRequest('PATCH', `eventos?id=eq.${evento.id}`, { imagem_flyer_path: imgUrl });
        } else {
          console.log(`  ❌ Nenhuma imagem útil encontrada.`);
        }
        await new Promise(r => setTimeout(r, 1500));
      }
    } else {
      console.log("Nenhum evento precisando de imagem.");
    }
  } catch(e) { console.error("Erro eventos:", e.message); }

  console.log("\nBusca de imagens finalizada.");
}

main();
