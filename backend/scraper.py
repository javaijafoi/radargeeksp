import os
import json
import uuid
import requests
from datetime import datetime, timezone

# Variáveis de ambiente
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://MOCK.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "MOCK_KEY")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "MOCK_GEMINI_KEY")

# Listas locais para coletar dados salvos (para exportar para data.json)
todos_locais = []
todos_eventos = []

def avaliar_evento_gemini(descricao_evento):
    """
    Avalia um evento geek com a API do Gemini. 
    Se a chave for mock ou a chamada falhar, cai em heurísticas locais de mock.
    """
    if not GEMINI_API_KEY or "MOCK" in GEMINI_API_KEY:
        print("Usando avaliação heurística local (Gemini API Key ausente)...")
        return heuristica_local_evento(descricao_evento)
        
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
    
    prompt = f"""
    Avalie o seguinte evento geek:
    '{descricao_evento}'
    
    Retorne APENAS um JSON válido com a seguinte estrutura:
    {{
        "ia_score_cilada": <numero de 1 a 10>,
        "kid_friendly": <booleano>,
        "tags_consumo": ["<tags extraídas>"]
    }}
    """
    
    payload = {
        "contents": [{"parts": [{"text": prompt}]}]
    }
    
    try:
        response = requests.post(url, json=payload, timeout=10)
        response.raise_for_status()
        result_text = response.json()['candidates'][0]['content']['parts'][0]['text']
        # Limpa blocos de código markdown do JSON se houver
        result_text = result_text.replace('```json', '').replace('```', '').strip()
        return json.loads(result_text)
    except Exception as e:
        print(f"Erro ao processar no Gemini ({e}). Usando heurística local...")
        return heuristica_local_evento(descricao_evento)

def heuristica_local_evento(descricao):
    """ Heurísticas simples baseadas em palavras-chave para testar sem internet/API. """
    desc_lower = descricao.lower()
    score = 7
    kid_friendly = True
    tags = []

    if "cerveja" in desc_lower or "bebida" in desc_lower or "tumulto" in desc_lower:
        score = 4
        kid_friendly = False
    if "rpg" in desc_lower or "tabuleiro" in desc_lower:
        score = 9
        tags.append("RPG")
    if "vegano" in desc_lower or "plant-based" in desc_lower:
        tags.append("Vegano")
    if "semlactose" in desc_lower or "zero lactose" in desc_lower:
        tags.append("Sem Lactose")

    return {
        "ia_score_cilada": score,
        "kid_friendly": kid_friendly,
        "tags_consumo": tags
    }

def inserir_supabase(tabela, dados):
    """
    Insere o registro no Supabase. Se for mock, simula a inserção localmente
    e retorna o JSON simulado com um ID gerado.
    """
    global todos_locais, todos_eventos
    
    # Se o Supabase estiver em modo mock
    if "MOCK" in SUPABASE_URL or not SUPABASE_URL:
        dados_salvos = dados.copy()
        dados_salvos["id"] = str(uuid.uuid4())
        
        if tabela == "locais_fixos":
            todos_locais.append(dados_salvos)
        elif tabela == "eventos":
            # Para eventos com local_id, tentamos achar o local correspondente para emular a relação
            evento_com_relacao = dados_salvos.copy()
            if "local_id" in dados_salvos:
                local_correspondente = next((loc for loc in todos_locais if loc["id"] == dados_salvos["local_id"]), None)
                if local_correspondente:
                    evento_com_relacao["locais_fixos"] = local_correspondente
            todos_eventos.append(evento_com_relacao)
            
        print(f"[MOCK] Registro simulado na tabela '{tabela}': {dados_salvos['nome'] if tabela == 'locais_fixos' else dados_salvos['titulo']}")
        return [dados_salvos]

    # Inserção real no Supabase
    url = f"{SUPABASE_URL}/rest/v1/{tabela}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }
    
    try:
        response = requests.post(url, headers=headers, json=dados, timeout=10)
        if response.status_code not in (200, 201):
            print(f"Erro ao inserir na tabela {tabela}: {response.text}")
            return None
        res_json = response.json()
        
        # Guardar para exportar para o JSON local de visualização
        if res_json:
            item = res_json[0]
            if tabela == "locais_fixos":
                todos_locais.append(item)
            elif tabela == "eventos":
                evento_com_relacao = item.copy()
                if "local_id" in item and item["local_id"]:
                    local_correspondente = next((loc for loc in todos_locais if loc["id"] == item["local_id"]), None)
                    if local_correspondente:
                        evento_com_relacao["locais_fixos"] = local_correspondente
                todos_eventos.append(evento_com_relacao)
                
        return res_json
    except Exception as e:
        print(f"Exceção ao inserir no Supabase: {e}")
        return None

def main():
    # 1. Definir/raspar alguns locais fixos e eventos mockados
    locais_exemplo = [
        {
            "nome": "Taverna Medieval",
            "tags_consumo": ["medieval", "hamburguer", "medieval-core"],
            "distancia_mooca": 25,
            "imagem_hero_path": "https://placehold.co/600x400/2c1b4d/FFFFFF?text=Taverna+Medieval"
        },
        {
            "nome": "Ludoteria SP",
            "tags_consumo": ["plant-based", "zero-lactose", "jogos-tabuleiro"],
            "distancia_mooca": 40,
            "imagem_hero_path": "https://placehold.co/600x400/0f3a1a/FFFFFF?text=Ludoteria"
        },
        {
            "nome": "Coffee & Games",
            "tags_consumo": ["cafeteira", "zero-lactose", "videogames"],
            "distancia_mooca": 15,
            "imagem_hero_path": "https://placehold.co/600x400/3e2723/FFFFFF?text=Coffee+and+Games"
        }
    ]
    
    print("Processando locais fixos...")
    locais_ids = {}
    for local in locais_exemplo:
        resultado = inserir_supabase("locais_fixos", local)
        if resultado:
            locais_ids[local["nome"]] = resultado[0]["id"]
            
    # 2. Mock de eventos da internet (representando os dados de hoje)
    eventos_crus = [
        {
            "titulo": "Mega Encontro de RPG (Taverna)",
            "descricao": "Uma noite tranquila para jogar D&D e RPG de mesa com opções de comidas típicas sem lactose.",
            "data_hora": datetime.now(timezone.utc).isoformat(),
            "local_nome": "Taverna Medieval",
            "imagem_flyer_path": "https://placehold.co/600x400/311b92/FFFFFF?text=RPG+Taverna"
        },
        {
            "titulo": "Campeonato de Catan e Hambúrguer Vegano",
            "descricao": "Venha jogar jogos de tabuleiro modernos e saborear nosso buffet 100% plant-based com a família.",
            "data_hora": datetime.now(timezone.utc).isoformat(),
            "local_nome": "Ludoteria SP",
            "imagem_flyer_path": "https://placehold.co/600x400/1b5e20/FFFFFF?text=Catan+Vegano"
        },
        {
            "titulo": "Feira Geek de Calçadão",
            "descricao": "Grande aglomeração com stands vendendo figures piratas no sol, cerveja quente e muito tumulto.",
            "data_hora": datetime.now(timezone.utc).isoformat(),
            "local_nome": None,
            "imagem_flyer_path": "https://placehold.co/600x400/b71c1c/FFFFFF?text=Feira+Baguncada"
        },
        {
            "titulo": "Torneio de Smash Bros & Café Express",
            "descricao": "Competição amigável de Smash Bros Ultimate com degustação de milkshakes de leite de aveia (zero lactose).",
            "data_hora": datetime.now(timezone.utc).isoformat(),
            "local_nome": "Coffee & Games",
            "imagem_flyer_path": "https://placehold.co/600x400/e65100/FFFFFF?text=Smash+Bros"
        }
    ]
    
    print("\nProcessando e classificando eventos com Inteligência Artificial...")
    for evento in eventos_crus:
        avaliacao = avaliar_evento_gemini(evento["descricao"])
        
        # Mesclar as tags extraídas pela IA com as tags de consumo do evento
        tags_completas = avaliacao.get("tags_consumo", [])
        
        novo_evento = {
            "titulo": evento["titulo"],
            "data_hora": evento["data_hora"],
            "ia_score_cilada": avaliacao.get("ia_score_cilada", 5),
            "kid_friendly": avaliacao.get("kid_friendly", False),
            "imagem_flyer_path": evento["imagem_flyer_path"]
        }
        
        # Associar local se aplicável
        if evento["local_nome"] and evento["local_nome"] in locais_ids:
            novo_evento["local_id"] = locais_ids[evento["local_nome"]]
            
        inserir_supabase("eventos", novo_evento)
        
    # 3. Exportar para o data.json local na pasta public do Frontend Web
    try:
        web_public_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "web", "public")
        os.makedirs(web_public_dir, exist_ok=True)
        json_path = os.path.join(web_public_dir, "data.json")
        
        dados_exportados = {
            "locais": todos_locais,
            "eventos": todos_eventos,
            "exportado_em": datetime.now(timezone.utc).isoformat()
        }
        
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(dados_exportados, f, ensure_ascii=False, indent=2)
            
        print(f"\nDados exportados com sucesso para: {json_path}")
    except Exception as e:
        print(f"Erro ao salvar arquivo JSON local: {e}")

    print("\nSincronização concluída com sucesso!")

if __name__ == "__main__":
    main()
