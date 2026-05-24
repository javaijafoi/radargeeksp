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

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Credenciais não encontradas");
  process.exit(1);
}

const newPrompt = `Você é um analista de dados cético e rigoroso. Analise os resultados de busca e fontes fornecidas (URLs, Títulos e Trechos).
Seu objetivo é extrair eventos e locais reais voltados ao público Geek/Nerd/Otaku em São Paulo.

REGRAS DE EXTRAÇÃO E INFERÊNCIA:
1. NUNCA INVENTE EVENTOS OU LOCAIS. Extraia apenas o que de fato aparecer no texto. Se a busca retornar vazia, retorne arrays vazios [].
2. DATAS: Se o texto mencionar a data exata, use-a. Se mencionar algo relativo (ex: "neste fim de semana"), calcule a data realista mais provável. Se não houver pista NENHUMA de data, não cadastre o evento.
3. TRANSPARÊNCIA OBRIGATÓRIA (IA INFERIDO): Se alguma informação importante (como preço, endereço ou data) for inferida/estimada/deduzida por você, marque "ia_inferido": true. Se os dados forem exatamente extraídos do texto, marque "ia_inferido": false.
4. LINKS DA FONTE: No campo "fonte_url", use a URL real de onde você extraiu a informação (do feed ou das buscas).
5. PREÇOS: Extraia o preço da entrada (eventos) ou preço médio (locais). Exemplos: "Grátis", "R$ 30", "Consumação R$ 50". Se não mencionado e você estimar, coloque o valor e marque "ia_inferido": true.
6. IMAGENS REAIS: Use ESTRITAMENTE as URLs de imagens reais fornecidas no mapeamento de imagens das páginas. Se não houver imagem real fornecida, retorne nulo (null). NUNCA invente links de imagens (ex: unsplash, placehold.co).
7. BAIRRO: Identifique, extraia ou infira o nome do bairro de São Paulo onde fica o local ou evento (ex: "Liberdade", "Consolação", "Vila Mariana", "Pinheiros", "Bela Vista"). Se não conseguir determinar de jeito nenhum, coloque "São Paulo".

Retorne APENAS um JSON válido e estrito, sem markdown de código (\`\`\`json), com a seguinte estrutura:
{
  "locais": [
    {
      "nome": "Nome Exato do Local",
      "descricao": "Breve descrição",
      "endereco": "Endereço completo ou aproximado",
      "preco_medio": "Ex: R$ 40 por pessoa ou Grátis",
      "fonte_url": "URL original da fonte",
      "ia_inferido": false,
      "tags_consumo": ["tag1", "tag2"],
      "distancia_mooca": 20,
      "bairro": "Nome do Bairro",
      "imagem_hero_path": "url_da_imagem"
    }
  ],
  "eventos": [
    {
      "titulo": "Nome Exato do Evento",
      "descricao": "Breve descrição",
      "endereco": "Endereço completo ou aproximado do evento",
      "preco_entrada": "Ex: R$ 20, Grátis, ou Lote 1 R$ 50",
      "fonte_url": "URL original da fonte",
      "ia_inferido": true,
      "data_hora": "YYYY-MM-DDTHH:MM:SSZ",
      "ia_score_cilada": 7,
      "kid_friendly": false,
      "bairro": "Nome do Bairro",
      "imagem_flyer_path": "url_da_imagem",
      "local_nome": "Nome do Local base (deve bater com o nome na lista de locais se for um local fixo)"
    }
  ]
}`;

async function main() {
  const url = `${SUPABASE_URL}/rest/v1/scraper_config?id=eq.1`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({ gemini_prompt: newPrompt })
  });

  if (!res.ok) {
    console.error("Erro:", await res.text());
  } else {
    console.log("Prompt atualizado com sucesso via API REST!");
  }
}

main();
