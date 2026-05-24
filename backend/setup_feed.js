/**
 * Script de setup: cria a tabela scraper_feed no Supabase
 * via inserção em tabela temporária (workaround para PostgREST).
 *
 * Uso: node backend/setup_feed.js
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

// Testa se a tabela já existe tentando um SELECT
const testRes = await fetch(`${SUPABASE_URL}/rest/v1/scraper_feed?limit=1`, {
  headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
})

if (testRes.ok) {
  console.log('✅ Tabela scraper_feed já existe! Pronto para usar.')
  process.exit(0)
}

// Tabela não existe — instrução para criar manualmente
const sql = fs.readFileSync(path.join(__dirname, 'migration_feed.sql'), 'utf-8')
console.log('\n❌ A tabela scraper_feed não existe no Supabase.')
console.log('📋 Rode o seguinte SQL no Supabase Dashboard → SQL Editor:\n')
console.log('   https://supabase.com/dashboard/project/xhncsuemwfybihpxzvfj/sql/new\n')
console.log('─'.repeat(60))
console.log(sql)
console.log('─'.repeat(60))
console.log('\nDepois rode este script novamente para confirmar que funcionou.\n')
