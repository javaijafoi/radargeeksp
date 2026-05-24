import { createClient } from '@supabase/supabase-js'

let supabaseUrl = import.meta.env.VITE_SUPABASE_URL || localStorage.getItem('radar_supabase_url') || ''
let supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || localStorage.getItem('radar_supabase_anon_key') || ''

export function getSupabaseConfig() {
  return {
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
    isConfigured: !!(supabaseUrl && supabaseAnonKey)
  }
}

export function saveSupabaseConfig(url, anonKey) {
  localStorage.setItem('radar_supabase_url', url)
  localStorage.setItem('radar_supabase_anon_key', anonKey)
  supabaseUrl = url
  supabaseAnonKey = anonKey

  if (url && anonKey) {
    supabase = createClient(url, anonKey)
  } else {
    supabase = null
  }
}

export function clearSupabaseConfig() {
  localStorage.removeItem('radar_supabase_url')
  localStorage.removeItem('radar_supabase_anon_key')
  supabaseUrl = ''
  supabaseAnonKey = ''
  supabase = null
}

export let supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null

