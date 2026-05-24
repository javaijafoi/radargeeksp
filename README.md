<div align="center">
  <img src="https://placehold.co/1000x300/12121a/ff00ff?text=RADAR+GEEK+SP" alt="Radar Geek SP Banner">
  
  # 📡 RADAR GEEK SP
  **O Motor de Recomendação Cético Alimentado por Inteligência Artificial**
  
  [![Vite](https://img.shields.io/badge/Vite-B73BFE?style=for-the-badge&logo=vite&logoColor=FFD62E)](https://vitejs.dev/)
  [![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
  [![Supabase](https://img.shields.io/badge/Supabase-181818?style=for-the-badge&logo=supabase&logoColor=3ECF8E)](https://supabase.io/)
  [![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com/)
</div>

---

## ⚡ Sobre o Projeto

O **Radar Geek SP** não é apenas uma agenda cultural; é um ecosistema autônomo. Ele monitora feeds RSS, varre a internet através de motores de busca (DuckDuckGo/Yahoo) e utiliza a IA Generativa (Google Gemini) para encontrar, classificar e organizar eventos e locais geeks em São Paulo, separando o ouro das "ciladas".

### 🤖 Arquitetura Autônoma (Scraper Sprawl)
O cérebro do projeto reside na nuvem (Vercel Serverless Functions) operando de forma 100% autônoma nas madrugadas:
1. **`00:00` (Busca)**: Vasculha a internet e Feeds RSS em busca de novas URLs sobre eventos geeks.
2. **`01:00` (Processamento)**: O Gemini lê os textos brutos dessas URLs, julga se são eventos válidos, avalia o nível de "cilada" (Score IA) e extrai dados estruturados (JSON).
3. **`02:00` (Mídia)**: Um robô secundário entra em ação caçando imagens reais na web para os eventos recém-descobertos.
4. **`03:00` (Manutenção)**: A IA realiza a deduplicação do banco (mesclando eventos clonados) e enriquece locais defasados com novos preços e descrições.

---

## 🔒 Acesso de Operador (Konami Code)

Para o público geral, o Radar Geek SP é uma plataforma de leitura limpa com os eventos e calendário. 
Para acessar o **Painel do Scraper e Logs do Sistema**, digite o **Konami Code** em qualquer lugar da tela:

> ⬆️ ⬆️ ⬇️ ⬇️ ⬅️ ➡️ ⬅️ ➡️ `B` `A`

Um terminal secreto de autenticação irá emergir das sombras.

---

## 🚀 Como Rodar Localmente

### 1. Clonar e Instalar
```bash
git clone https://github.com/javaijafoi/radargeeksp.git
cd radargeeksp/web
npm install
```

### 2. Variáveis de Ambiente
Crie um arquivo `.env` na raiz da pasta `web/` com as seguintes chaves do seu Supabase e Gemini:
```env
VITE_SUPABASE_URL="sua_url_aqui"
VITE_SUPABASE_ANON_KEY="sua_chave_aqui"
SUPABASE_URL="sua_url_aqui"
SUPABASE_KEY="sua_chave_secreta_aqui"
GEMINI_API_KEY="chave_gemini_aqui"
CRON_SECRET="dev"
```

### 3. Rodar o Front-end
```bash
npm run dev
```

### 4. Rodar o Scraper Manualmente
Em outro terminal (na raiz do projeto):
```bash
node api/scrape.js
```

---

## 🌐 Deploy na Vercel

Este repositório está otimizado como um monorepo para a Vercel. 
O arquivo `package.json` na raiz possui o script mestre `vercel-build` que irá compilar a interface React e injetar as rotas de API Serverless automaticamente.

1. Conecte este repositório na **Vercel**.
2. Deixe o "Root Directory" como o padrão (raiz `/`).
3. Adicione as mesmas Variáveis de Ambiente (`SUPABASE_URL`, `SUPABASE_KEY`, `GEMINI_API_KEY`, `CRON_SECRET`) nas configurações do projeto na Vercel.
4. Clique em Deploy. Os Cron Jobs (`vercel.json`) serão ativados instantaneamente.

---
<div align="center">
  <i>"No sprawl urbano, a informação é a única moeda que importa."</i>
</div>
