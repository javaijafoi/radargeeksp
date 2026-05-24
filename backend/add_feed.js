/**
 * CLI para adicionar URLs ao feed manual do scraper.
 *
 * Uso:
 *   node backend/add_feed.js <url> [titulo]
 *
 * Exemplos:
 *   node backend/add_feed.js https://www.ccxp.com.br
 *   node backend/add_feed.js https://www.instagram.com/p/ABC123/ "Post CCXP Instagram"
 *   node backend/add_feed.js --list          → lista todas as URLs do feed
 *   node backend/add_feed.js --remove <id>   → desativa uma URL pelo ID
 */
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Lê .env
try {
  const envPath = path.join(__dirname, '..', 'web', '.env')
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
      if (line.trim().startsWith('#') || !line.trim()) return
      const [k, ...v] = line.split('=')
      if (k && v.length && !process.env[k.trim()]) process.env[k.trim()] = v.join('=').trim()
    })
  }
} catch (e) {}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY

async function req(method, endpoint, body = null) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Supabase ${res.status}: ${err}`)
  }
  return res.json()
}

const args = process.argv.slice(2)

if (args[0] === '--list') {
  // Listar feed
  const feed = await req('GET', 'scraper_feed?order=criado_em.desc&select=*')
  if (!feed.length) {
    console.log('📋 Feed vazio. Adicione URLs com: node backend/add_feed.js <url> [titulo]')
  } else {
    console.log(`\n📋 Feed manual — ${feed.length} URL(s):\n`)
    feed.forEach(item => {
      const status = item.ativo ? '✅' : '⏸️ '
      console.log(`  ${status} [${item.id.substring(0, 8)}] ${item.titulo || item.url}`)
      if (item.titulo) console.log(`         ${item.url}`)
      console.log(`         Adicionado: ${new Date(item.criado_em).toLocaleString('pt-BR')}`)
      console.log()
    })
  }

} else if (args[0] === '--remove' && args[1]) {
  // Desativar uma URL
  const id = args[1]
  await req('PATCH', `scraper_feed?id=eq.${id}`, { ativo: false })
  console.log(`⏸️  URL ${id} desativada do feed.`)

} else if (args[0] === '--delete' && args[1]) {
  // Deletar permanentemente
  const id = args[1]
  await req('DELETE', `scraper_feed?id=eq.${id}`)
  console.log(`🗑️  URL ${id} removida permanentemente do feed.`)

} else if (args[0] && args[0].startsWith('http')) {
  // Adicionar URL
  const url = args[0]
  const titulo = args[1] || null
  const resultado = await req('POST', 'scraper_feed', { url, titulo, ativo: true })
  console.log(`\n✅ URL adicionada ao feed!`)
  console.log(`   ID:    ${resultado[0].id}`)
  console.log(`   URL:   ${resultado[0].url}`)
  console.log(`   Título: ${resultado[0].titulo || '(sem título)'}`)
  console.log('\nNa próxima execução do scraper, esta URL será processada automaticamente.')

} else {
  console.log(`
📡 add_feed.js — Gerenciador do Feed Manual do Radar Geek SP

Uso:
  node backend/add_feed.js <url> [titulo]   Adiciona URL ao feed
  node backend/add_feed.js --list           Lista todas as URLs
  node backend/add_feed.js --remove <id>    Desativa uma URL
  node backend/add_feed.js --delete <id>    Remove permanentemente

Exemplos:
  node backend/add_feed.js https://www.ccxp.com.br "Site CCXP 2026"
  node backend/add_feed.js https://www.sympla.com.br/evento/geek-sp/123
  node backend/add_feed.js --list
  `)
}
