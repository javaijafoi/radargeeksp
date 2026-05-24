import React, { useState, useEffect, useMemo } from 'react'
import { supabase, getSupabaseConfig, saveSupabaseConfig, clearSupabaseConfig } from './supabase'
import { 
  Radio, LogOut, RefreshCw, Database, Calendar, 
  MapPin, Terminal, Search, ShieldCheck, AlertTriangle, 
  Info, Save, Trash2, X, Key, Mail, Cpu, Clock, ExternalLink, Plus, Globe
} from 'lucide-react'

export default function App() {
  const [config, setConfig] = useState(getSupabaseConfig())
  const [showSettings, setShowSettings] = useState(!config.isConfigured)
  
  // Autenticação
  const [session, setSession] = useState(null)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [authError, setAuthError] = useState(null)
  const [showLoginPopup, setShowLoginPopup] = useState(false)

  // Inputs de configuração temporários
  const [inputUrl, setInputUrl] = useState(config.url)
  const [inputAnonKey, setInputAnonKey] = useState(config.anonKey)

  // Estados de carregamento do Scraper na Vercel
  const [scrapeLoading, setScrapeLoading] = useState(false)

  // Configurações do Scraper
  const [scraperConfigId, setScraperConfigId] = useState(1)
  const [searchQueries, setSearchQueries] = useState('[\n  "eventos geek são paulo final de semana"\n]')
  const [geminiPrompt, setGeminiPrompt] = useState('Você é um robô extrator de dados...')
  const [savingConfig, setSavingConfig] = useState(false)

  // Dados do Supabase com Cache Local
  const [eventos, setEventos] = useState(() => {
    try {
      const cached = localStorage.getItem('radar_cache_eventos')
      return cached ? JSON.parse(cached) : []
    } catch { return [] }
  })
  const [locais, setLocais] = useState(() => {
    try {
      const cached = localStorage.getItem('radar_cache_locais')
      return cached ? JSON.parse(cached) : []
    } catch { return [] }
  })
  const [logs, setLogs] = useState(() => {
    try {
      const cached = localStorage.getItem('radar_cache_logs')
      return cached ? JSON.parse(cached) : []
    } catch { return [] }
  })
  const [filaPendentes, setFilaPendentes] = useState(() => {
    try {
      const cached = localStorage.getItem('radar_cache_fila')
      return cached ? JSON.parse(cached) : []
    } catch { return [] }
  })
  const [feedItems, setFeedItems] = useState(() => {
    try {
      const cached = localStorage.getItem('radar_cache_feed')
      return cached ? JSON.parse(cached) : []
    } catch { return [] }
  })
  const [feedUrlInput, setFeedUrlInput] = useState('')
  const [feedTitleInput, setFeedTitleInput] = useState('')
  const [addingFeed, setAddingFeed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Estados de navegação e filtros
  const [activeTab, setActiveTab] = useState('eventos') // 'eventos' | 'locais' | 'logs' | 'calendario'
  const [searchQuery, setSearchQuery] = useState('')
  const [filterOption, setFilterOption] = useState('todos')
  const [selectedLocal, setSelectedLocal] = useState(null)
  const [calendarView, setCalendarView] = useState('semana') // 'semana' | 'mes' | 'ano'
  const [calendarDate, setCalendarDate] = useState(new Date())

  // Monitorar Sessão de Autenticação
  useEffect(() => {
    if (!supabase) return

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [config])

  // Konami Code Listener
  useEffect(() => {
    const konamiCode = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    let konamiIndex = 0;

    const handleKeyDown = (e) => {
      if (e.key === konamiCode[konamiIndex] || e.key.toLowerCase() === konamiCode[konamiIndex].toLowerCase()) {
        konamiIndex++;
        if (konamiIndex === konamiCode.length) {
          setShowLoginPopup(true);
          konamiIndex = 0;
        }
      } else {
        konamiIndex = 0;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoginLoading(true)
    setAuthError(null)
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    })
    if (error) {
      setAuthError(error.message)
    }
    setLoginLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  // Carregar dados se configurado ou ler fallback local
  const fetchDados = async () => {
    setLoading(true)
    setError(null)
    try {
      if (supabase) {
        // 1. Buscar locais
        const { data: locaisData, error: locaisErr } = await supabase
          .from('locais_fixos')
          .select('*')
        if (locaisErr) throw locaisErr

        // 2. Buscar eventos
        const { data: eventosData, error: eventosErr } = await supabase
          .from('eventos')
          .select('*, locais_fixos(*)')
        if (eventosErr) throw eventosErr

        // 3. Buscar logs
        let logsData = []
        try {
          const { data, error: logsErr } = await supabase
            .from('historico_scraping')
            .select('*')
            .order('executado_em', { ascending: false })
          if (!logsErr) logsData = data
        } catch (e) {}

        // 4. Buscar config do scraper
        try {
          const { data: configData, error: configErr } = await supabase
            .from('scraper_config')
            .select('*')
            .eq('id', 1)
          if (!configErr && configData && configData.length > 0) {
            setScraperConfigId(configData[0].id)
            setSearchQueries(JSON.stringify(configData[0].search_queries, null, 2))
            setGeminiPrompt(configData[0].gemini_prompt)
          }
        } catch (e) {}

        // 5. Buscar fila staging pendentes
        let queueData = []
        try {
          const { data, error: queueErr } = await supabase
            .from('scraper_queue')
            .select('id, url, titulo, status')
            .eq('status', 'pending')
          if (!queueErr) queueData = data
        } catch (e) {}

        // 6. Buscar feeds manuais
        let feedData = []
        try {
          const { data, error: feedErr } = await supabase
            .from('scraper_feed')
            .select('*')
            .order('criado_em', { ascending: false })
          if (!feedErr) feedData = data
        } catch (e) {}

        setLocais(locaisData || [])
        setEventos(eventosData || [])
        setLogs(logsData || [])
        setFilaPendentes(queueData || [])
        setFeedItems(feedData || [])

        // Salvar no Cache Local
        try {
          localStorage.setItem('radar_cache_locais', JSON.stringify(locaisData || []))
          localStorage.setItem('radar_cache_eventos', JSON.stringify(eventosData || []))
          localStorage.setItem('radar_cache_logs', JSON.stringify(logsData || []))
          localStorage.setItem('radar_cache_fila', JSON.stringify(queueData || []))
          localStorage.setItem('radar_cache_feed', JSON.stringify(feedData || []))
        } catch (e) {
          console.warn('Falha ao gravar cache local:', e)
        }
      }
    } catch (err) {
      console.error(err)
      setError('Erro ao carregar dados. Verifique sua conexão e configurações.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDados()
  }, [config, session])

  const handleSaveSettings = (e) => {
    e.preventDefault()
    if (!inputUrl || !inputAnonKey) {
      alert('Por favor, preencha todos os campos.')
      return
    }
    saveSupabaseConfig(inputUrl, inputAnonKey)
    setConfig(getSupabaseConfig())
    setShowSettings(false)
    window.location.reload()
  }

  const handleClearSettings = () => {
    if (confirm('Deseja realmente limpar as credenciais de teste?')) {
      clearSupabaseConfig()
      setConfig(getSupabaseConfig())
      setEventos([])
      setLocais([])
      setLogs([])
      setInputUrl('')
      setInputAnonKey('')
      setShowSettings(true)
    }
  }

  const handleSaveScraperConfig = async (e) => {
    e.preventDefault()
    setSavingConfig(true)
    try {
      const parsedQueries = JSON.parse(searchQueries)
      if (!Array.isArray(parsedQueries)) throw new Error("Palavras-chave devem ser um Array JSON válido.")
      
      const { error: updErr } = await supabase
        .from('scraper_config')
        .update({
          search_queries: parsedQueries,
          gemini_prompt: geminiPrompt
        })
        .eq('id', scraperConfigId)

      if (updErr) throw updErr
      alert('Configurações do Robô salvas com sucesso!')
    } catch (err) {
      alert(`Erro ao salvar config: ${err.message}`)
    } finally {
      setSavingConfig(false)
    }
  }

  const triggerScrapeNuvem = async () => {
    setScrapeLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST'
      })
      if (!res.ok) {
        throw new Error(`Servidor respondeu com status ${res.status}`)
      }
      const data = await res.json()
      if (data.sucesso) {
        alert('Raspagem e classificação acionadas com sucesso na Nuvem!')
        await fetchDados()
      } else {
        setError(`Erro na raspagem da Nuvem: ${data.logs || 'Sem detalhes'}`)
      }
    } catch (e) {
      setError(`Esse botão funciona após o deploy na Vercel com as variáveis de ambiente setadas. Para rodar agora na sua máquina local, digite 'node backend/scraper.js' no seu terminal. Detalhes: ${e.message}`)
    } finally {
      setScrapeLoading(false)
    }
  }

  const handleAddFeedItem = async (e) => {
    e.preventDefault()
    if (!feedUrlInput.trim()) return

    setAddingFeed(true)
    try {
      let url = feedUrlInput.trim()
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url
      }

      const { error: insertErr } = await supabase
        .from('scraper_feed')
        .insert({
          url,
          titulo: feedTitleInput.trim() || null,
          ativo: true
        })

      if (insertErr) throw insertErr

      setFeedUrlInput('')
      setFeedTitleInput('')
      await fetchDados()
    } catch (err) {
      alert(`Erro ao adicionar feed: ${err.message}`)
    } finally {
      setAddingFeed(false)
    }
  }

  const handleToggleFeedItem = async (id, currentAtivo) => {
    try {
      const { error: updateErr } = await supabase
        .from('scraper_feed')
        .update({ ativo: !currentAtivo })
        .eq('id', id)

      if (updateErr) throw updateErr
      await fetchDados()
    } catch (err) {
      alert(`Erro ao alternar status do feed: ${err.message}`)
    }
  }

  const handleDeleteFeedItem = async (id) => {
    if (!confirm('Deseja realmente remover esta URL do feed?')) return
    try {
      const { error: deleteErr } = await supabase
        .from('scraper_feed')
        .delete()
        .eq('id', id)

      if (deleteErr) throw deleteErr
      await fetchDados()
    } catch (err) {
      alert(`Erro ao excluir feed: ${err.message}`)
    }
  }

  const filteredEventos = useMemo(() => {
    return eventos.filter(evento => {
      const matchesSearch = evento.titulo.toLowerCase().includes(searchQuery.toLowerCase())
      if (!matchesSearch) return false
      if (filterOption === 'recomendados') return evento.ia_score_cilada >= 7
      if (filterOption === 'alerta') return evento.ia_score_cilada < 5
      if (filterOption === 'kids') return evento.kid_friendly === true
      return true
    })
  }, [eventos, searchQuery, filterOption])

  const filteredLocais = useMemo(() => {
    return locais.filter(local => {
      const matchesSearch = local.nome.toLowerCase().includes(searchQuery.toLowerCase())
      if (!matchesSearch) return false
      if (filterOption === 'vegan') return local.tags_consumo?.some(tag => tag.toLowerCase().includes('vegan') || tag.toLowerCase().includes('plant-based'))
      if (filterOption === 'lactose') return local.tags_consumo?.some(tag => tag.toLowerCase().includes('lactose') || tag.toLowerCase().includes('zero-lactose'))
      return true
    })
  }, [locais, searchQuery, filterOption])

  const eventosDoLocalSelecionado = useMemo(() => {
    if (!selectedLocal) return []
    return eventos.filter(ev => ev.local_id === selectedLocal.id)
  }, [eventos, selectedLocal])

  const formatarData = (dataStr) => {
    try {
      const d = new Date(dataStr)
      return d.toLocaleDateString('pt-BR', {
        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
      })
    } catch { return dataStr }
  }

  const getScoreClass = (score) => {
    if (score >= 7) return 'score-safe'
    if (score >= 5) return 'score-warning'
    return 'score-danger'
  }

  const getScoreIcon = (score) => {
    if (score >= 7) return <ShieldCheck size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
    if (score >= 5) return <Info size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
    return <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
  }

  const parseLatestLogMetrics = useMemo(() => {
    if (!logs || logs.length === 0 || !logs[0].logs) return null;
    const logStr = logs[0].logs;
    
    const metrics = {
      buscas: [],
      linksNovos: 0,
      geminiStatus: 'Disponível (Aguardando lote)',
      geminiColor: 'var(--color-safe)',
      eventosSalvos: 0,
      locaisSalvos: 0
    };

    const linhas = logStr.split('\n');
    let buscaAtual = null;

    linhas.forEach(linha => {
      // 1. Buscas
      if (linha.includes('Buscando na web por:')) {
        const match = linha.match(/por:\s*(.*?)\.\.\./);
        if (match) buscaAtual = { query: match[1], urls: 0, erro: false };
      }
      if (linha.includes('URLs encontradas') && buscaAtual) {
        const match = linha.match(/(\d+)\s*URLs encontradas/);
        if (match) {
          buscaAtual.urls = parseInt(match[1]);
          metrics.buscas.push(buscaAtual);
          buscaAtual = null;
        }
      }
      if (linha.includes('falhou') && buscaAtual) {
        buscaAtual.erro = true;
        metrics.buscas.push(buscaAtual);
        buscaAtual = null;
      }

      // 2. Links novos
      if (linha.match(/(\d+)\s*são novas/)) {
        metrics.linksNovos = parseInt(linha.match(/(\d+)\s*são novas/)[1]);
      } else if (linha.match(/(\d+)\s*links novos enfileirados/)) {
        metrics.linksNovos = parseInt(linha.match(/(\d+)\s*links novos enfileirados/)[1]);
      }

      // 3. Integrações (Gemini)
      if (linha.includes('✅ Evento "')) metrics.eventosSalvos++;
      if (linha.includes('✅ Local "')) metrics.locaisSalvos++;

      // 4. Status Gemini
      if (linha.includes('BLOQUEADO') || linha.includes('BLOQUEIO')) {
        metrics.geminiStatus = 'Bloqueado (Cota Excedida)';
        metrics.geminiColor = 'var(--color-danger)';
      }
      if (linha.includes('retomará em:')) {
        const match = linha.match(/retomará em:\s*(.*)/);
        if (match) metrics.geminiStatus = `Bloqueado até ${match[1]}`;
        metrics.geminiColor = 'var(--color-danger)';
      }
    });

    return metrics;
  }, [logs]);

  // RENDERIZAÇÃO DA TELA DE LOGIN (PopUp Secreto)
  if (showLoginPopup && !session) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-primary)', padding: '1rem', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }}>
        <div className="cyber-card-terminal" style={{ width: '100%', maxWidth: '420px', position: 'relative' }}>
          <button onClick={() => setShowLoginPopup(false)} style={{ position: 'absolute', top: '10px', right: '10px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={16} />
          </button>
          <div className="terminal-header">
            <div className="terminal-dot red"></div>
            <div className="terminal-dot yellow"></div>
            <div className="terminal-dot green"></div>
            <div className="terminal-title">SISTEMA DE AUTENTICAÇÃO</div>
          </div>
          <form style={{ padding: '2rem' }} onSubmit={handleLogin}>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <div style={{ display: 'inline-flex', padding: '0.8rem', border: '1px solid var(--accent)', color: 'var(--accent)', filter: 'drop-shadow(0 0 5px var(--accent))', marginBottom: '1rem', clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)' }}>
                <Radio size={32} />
              </div>
              <h2 className="logo-title cyber-glitch-title" data-text="Radar Geek SP" style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>Radar Geek SP</h2>
              <p style={{ fontFamily: 'var(--font-label)', fontSize: '0.75rem', color: 'var(--accent-tertiary)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Acesso Restrito // Terminal Cético</p>
            </div>
            
            {authError && (
              <div style={{ background: 'rgba(255,51,102,0.1)', border: '1px solid var(--color-danger)', padding: '0.8rem', marginBottom: '1.5rem', color: 'var(--color-danger)', fontSize: '0.8rem', fontFamily: 'var(--font-body)', textAlign: 'center', clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)' }}>
                <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                {authError}
              </div>
            )}

            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Mail size={12} /> E-mail de Operador
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--accent)', fontSize: '0.9rem', fontFamily: 'var(--font-label)' }}>&gt;</span>
                <input 
                  type="email" 
                  className="form-input" 
                  style={{ width: '100%', paddingLeft: '1.8rem' }}
                  value={loginEmail} 
                  onChange={e => setLoginEmail(e.target.value)} 
                  required 
                  placeholder="operador@radargeek.net" 
                />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: '2rem' }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Key size={12} /> Chave Criptografada
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--accent)', fontSize: '0.9rem', fontFamily: 'var(--font-label)' }}>&gt;</span>
                <input 
                  type="password" 
                  className="form-input" 
                  style={{ width: '100%', paddingLeft: '1.8rem' }}
                  value={loginPassword} 
                  onChange={e => setLoginPassword(e.target.value)} 
                  required 
                  placeholder="••••••••" 
                />
              </div>
            </div>
            
            <button type="submit" className="cyber-btn cyber-btn-glitch" style={{ width: '100%', justifyContent: 'center' }} disabled={loginLoading}>
              {loginLoading ? 'PROCESSANDO ACESSO...' : 'AUTENTICAR NO SPRAWL'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="app-container">
      <header className="header">
        <div className="logo-container">
          <span className="logo-icon">
            <Radio size={40} />
          </span>
          <div>
            <h1 className="logo-title cyber-glitch-title" data-text="Radar Geek SP">Radar Geek SP</h1>
            <p className="logo-subtitle">
              <Terminal size={12} style={{ color: 'var(--accent)', marginRight: '4px' }} />
              Motor de Recomendação Cético
              <span className="cyber-cursor"></span>
            </p>
          </div>
        </div>
        <div className="header-actions">
          {session && (
            <button className="cyber-btn cyber-btn-outline cyber-btn-secondary" onClick={handleLogout} style={{ padding: '0.6rem 1.1rem' }}>
              <LogOut size={14} /> Sair
            </button>
          )}
          {config.isConfigured && (
            <button 
              className="cyber-btn" 
              onClick={fetchDados} 
              disabled={loading}
              style={{ padding: '0.6rem 1.1rem' }}
            >
              <RefreshCw 
                size={14} 
                style={{ animation: loading ? 'spin 1.5s linear infinite' : 'none' }}
              /> 
              Sincronizar
            </button>
          )}
          {!config.isConfigured && (
            <button className="cyber-btn cyber-btn-secondary" onClick={() => setShowSettings(true)}>
              <Database size={14} /> Configurar Banco
            </button>
          )}
        </div>
      </header>

      <div className="tabs-container">
          <button 
            className={`tab-btn ${activeTab === 'eventos' ? 'active' : ''}`}
            onClick={() => { setActiveTab('eventos'); setFilterOption('todos'); }}
          >
            <Calendar size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
            Eventos da Semana
          </button>
          <button 
            className={`tab-btn ${activeTab === 'calendario' ? 'active' : ''}`}
            onClick={() => { setActiveTab('calendario'); setFilterOption('todos'); }}
          >
            <Calendar size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
            Calendário
          </button>
          <button 
            className={`tab-btn ${activeTab === 'locais' ? 'active' : ''}`}
            onClick={() => { setActiveTab('locais'); setFilterOption('todos'); }}
          >
            <MapPin size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
            Lugares Fixos
          </button>
          {session && (
            <button 
              className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
              onClick={() => setActiveTab('logs')}
            >
              <Terminal size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
              Painel do Scraper
            </button>
          )}
        </div>

      {error && (
        <div style={{ background: 'rgba(255,51,102,0.1)', border: '1px solid var(--color-danger)', padding: '1.25rem', marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', clipPath: 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)' }}>
          <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={16} /> 
            <span>ATENÇÃO: {error}</span>
          </p>
          <button className="cyber-btn cyber-btn-danger" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }} onClick={() => setError(null)}>IGNORAR</button>
        </div>
      )}

      {activeTab !== 'logs' && activeTab !== 'calendario' && !loading && (
        <div className="controls-bar">
          <div className="search-input-container">
            <span className="search-icon-inside">
              <Search size={16} />
            </span>
            <input 
              type="text" 
              className="search-input" 
              placeholder={activeTab === 'eventos' ? "Filtrar por diretriz ou título..." : "Rastrear local por nome..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          {activeTab === 'eventos' ? (
            <select className="filter-select" value={filterOption} onChange={(e) => setFilterOption(e.target.value)}>
              <option value="todos">Filtro: Todos os Eventos</option>
              <option value="recomendados">⭐ Recomendados (IA &gt;= 7)</option>
              <option value="alerta">⚠️ Risco de Cilada (IA &lt; 5)</option>
              <option value="kids">👶 Livre para Crianças</option>
            </select>
          ) : (
            <select className="filter-select" value={filterOption} onChange={(e) => setFilterOption(e.target.value)}>
              <option value="todos">Filtro: Todos os Lugares</option>
              <option value="vegan">🌱 Opções Plant-based / Vegan</option>
              <option value="lactose">🥛 Opções Sem Lactose</option>
            </select>
          )}
        </div>
      )}

      {loading && eventos.length === 0 && locais.length === 0 && (
        <div className="empty-state">
          <span className="empty-icon" style={{ animation: 'spin 2s linear infinite' }}>
            <RefreshCw size={44} />
          </span>
          <h2 className="empty-title">Consultando Rede Supabase...</h2>
          <p className="empty-desc">Coletando novos pacotes de dados do radar geek de São Paulo.</p>
        </div>
      )}

      {(eventos.length > 0 || locais.length > 0 || !loading) && (
        <div className="cyber-skew-section">
          {activeTab === 'eventos' ? (
            filteredEventos.length > 0 ? (
              <div className="cards-grid">
                {filteredEventos.map(evento => {
                  const cardClick = () => {
                    if (evento.fonte_url) {
                      window.open(evento.fonte_url, '_blank', 'noopener,noreferrer');
                    }
                  };
                  return (
                    <div 
                      key={evento.id} 
                      className="cyber-card" 
                      style={evento.fonte_url ? { cursor: 'pointer' } : {}}
                      onClick={evento.fonte_url ? cardClick : undefined}
                    >
                      <div className="card-media">
                        <img src={evento.imagem_flyer_path || 'https://placehold.co/600x400/12121a/00ff88?text=Sem+Flyer'} alt={evento.titulo} className="card-img" onError={(e) => { e.target.src = 'https://placehold.co/600x400/12121a/00ff88?text=Radar+Geek' }} />
                        <span className={`score-badge ${getScoreClass(evento.ia_score_cilada)}`}>
                          {getScoreIcon(evento.ia_score_cilada)}
                          IA: {evento.ia_score_cilada}/10
                        </span>
                        {evento.kid_friendly && <span className="card-badge-top">👶 LIVRE</span>}
                      </div>
                      <div className="card-content" onClick={(e) => { if (evento.fonte_url) e.stopPropagation(); }}>
                        <h3 className="card-title">{evento.titulo}</h3>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: '1.4', height: '2.3rem' }}>
                          {evento.descricao || 'Sem descrição classificada para este evento.'}
                        </p>
                        
                        {evento.endereco && (
                          <div className="card-meta-row" style={{ marginBottom: '0.25rem' }}>
                            <MapPin size={12} style={{ color: 'var(--accent)' }} />
                            <span>{evento.endereco}</span>
                          </div>
                        )}
                        
                        {evento.preco_entrada && (
                          <div className="card-meta-row" style={{ marginBottom: '0.25rem' }}>
                            <span>💵 Preço: {evento.preco_entrada}</span>
                          </div>
                        )}

                        <div className="card-meta-row" style={{ marginBottom: '0.5rem' }}>
                          <Clock size={12} style={{ color: 'var(--accent)' }} /> 
                          <span>{formatarData(evento.data_hora)}</span>
                        </div>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                          <span style={{ 
                            fontSize: '0.65rem', 
                            padding: '0.1rem 0.4rem', 
                            border: '1px solid',
                            borderColor: evento.ia_inferido ? 'var(--color-danger)' : 'var(--color-safe)',
                            color: evento.ia_inferido ? 'var(--color-danger)' : 'var(--color-safe)',
                            textTransform: 'uppercase',
                            fontFamily: 'var(--font-label)',
                            borderRadius: '3px'
                          }}>
                            {evento.ia_inferido ? '🤖 IA (Inferido)' : '🌐 Real (Extraído)'}
                          </span>
                          
                          {(evento.bairro || (evento.locais_fixos && evento.locais_fixos.bairro)) && (
                            <span style={{ 
                              fontSize: '0.65rem', 
                              padding: '0.1rem 0.4rem', 
                              border: '1px solid var(--accent-tertiary)',
                              color: 'var(--accent-tertiary)',
                              textTransform: 'uppercase',
                              fontFamily: 'var(--font-label)',
                              borderRadius: '3px'
                            }}>
                              📍 {evento.bairro || evento.locais_fixos.bairro}
                            </span>
                          )}
                          
                          {evento.fonte_url && (
                            <a 
                              href={evento.fonte_url} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="card-venue-link"
                              style={{ margin: 0 }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink size={10} /> Fonte
                            </a>
                          )}
                        </div>

                        {evento.locais_fixos && (
                          <a href="#" className="card-venue-link" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedLocal(evento.locais_fixos) }}>
                            <MapPin size={12} /> {evento.locais_fixos.nome}
                          </a>
                        )}

                        {evento.atualizado_em && (
                          <div style={{ marginTop: '0.8rem', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                            <RefreshCw size={10} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                            Atualizado em: {new Date(evento.atualizado_em).toLocaleDateString('pt-BR')}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">
                <span className="empty-icon"><AlertTriangle size={32} /></span>
                <h2 className="empty-title">Zero transmissões no feed</h2>
                <p className="empty-desc">Nenhum evento corresponde aos filtros ou termos buscados.</p>
              </div>
            )
          ) : activeTab === 'locais' ? (
            filteredLocais.length > 0 ? (
              <div className="cards-grid">
                {filteredLocais.map(local => (
                  <div key={local.id} className="cyber-card" style={{ cursor: 'pointer' }} onClick={() => setSelectedLocal(local)}>
                    <div className="card-media">
                      <img src={local.imagem_hero_path || 'https://placehold.co/600x400/12121a/ff00ff?text=Base+Geek'} alt={local.nome} className="card-img" onError={(e) => { e.target.src = 'https://placehold.co/600x400/12121a/ff00ff?text=Base+Geek' }} />
                      <span className="card-badge-top" style={{ borderColor: 'var(--accent-tertiary)', color: 'var(--accent-tertiary)', boxShadow: '0 0 5px rgba(0, 212, 255, 0.2)' }}>
                        📍 {local.bairro || 'São Paulo'}
                      </span>
                    </div>
                    <div className="card-content">
                      <h3 className="card-title">{local.nome}</h3>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: '1.4', height: '2.3rem' }}>
                        {local.descricao || 'Nenhuma análise estruturada deste sector.'}
                      </p>

                      {local.endereco && (
                        <div className="card-meta-row" style={{ marginBottom: '0.25rem' }}>
                          <MapPin size={12} style={{ color: 'var(--accent)' }} />
                          <span>{local.endereco}</span>
                        </div>
                      )}
                      
                      {local.preco_medio && (
                        <div className="card-meta-row" style={{ marginBottom: '0.25rem' }}>
                          <span>💵 Média: {local.preco_medio}</span>
                        </div>
                      )}
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem', marginTop: '0.25rem' }}>
                        <span style={{ 
                          fontSize: '0.65rem', 
                          padding: '0.1rem 0.4rem', 
                          border: '1px solid',
                          borderColor: local.ia_inferido ? 'var(--color-danger)' : 'var(--color-safe)',
                          color: local.ia_inferido ? 'var(--color-danger)' : 'var(--color-safe)',
                          textTransform: 'uppercase',
                          fontFamily: 'var(--font-label)',
                          borderRadius: '3px'
                        }}>
                          {local.ia_inferido ? '🤖 IA' : '🌐 Real'}
                        </span>
                        
                        {local.fonte_url && (
                          <a 
                            href={local.fonte_url} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="card-venue-link"
                            style={{ margin: 0 }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink size={10} /> Site
                          </a>
                        )}
                      </div>

                      <div className="card-tags">
                        {local.tags_consumo?.map((tag, idx) => (
                          <span key={idx} className={`tag-badge ${tag.toLowerCase().includes('vegan') || tag.toLowerCase().includes('lactose') ? 'tag-badge-accent' : ''}`}>{tag}</span>
                        ))}
                      </div>
                      {local.atualizado_em && (
                        <div style={{ marginTop: '0.8rem', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                          <RefreshCw size={10} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                          Atualizado em: {new Date(local.atualizado_em).toLocaleDateString('pt-BR')}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <span className="empty-icon"><MapPin size={32} /></span>
                <h2 className="empty-title">Nenhum refúgio mapeado</h2>
                <p className="empty-desc">Tente alterar o filtro ou reconfigurar as credenciais do banco.</p>
              </div>
            )
          ) : activeTab === 'calendario' ? (() => {
            const agora = new Date();
            
            let filteredForCalendar = eventos;
            if (calendarView === 'semana') {
              const nextWeek = new Date();
              nextWeek.setDate(nextWeek.getDate() + 7);
              filteredForCalendar = eventos.filter(ev => {
                const d = new Date(ev.data_hora);
                return d >= agora && d <= nextWeek;
              });
            } else if (calendarView === 'mes') {
              filteredForCalendar = eventos.filter(ev => {
                const d = new Date(ev.data_hora);
                return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear();
              });
            } else if (calendarView === 'ano') {
              filteredForCalendar = eventos.filter(ev => {
                const d = new Date(ev.data_hora);
                return d.getFullYear() === agora.getFullYear();
              });
            }

            // agrupar
            const groupedEvents = filteredForCalendar.reduce((acc, ev) => {
              const d = new Date(ev.data_hora);
              let keyStr = '';
              let displayStr = '';
              
              if (calendarView === 'ano') {
                keyStr = `${d.getFullYear()}-${d.getMonth()}`;
                displayStr = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();
              } else {
                keyStr = d.toLocaleDateString('pt-BR');
                displayStr = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
              }
              
              if (!acc[keyStr]) acc[keyStr] = { date: d, display: displayStr, events: [] };
              acc[keyStr].events.push(ev);
              return acc;
            }, {});

            const sortedDates = Object.values(groupedEvents).sort((a, b) => a.date - b.date);

            return (
              <div style={{ animation: 'fade-in 0.3s ease-out' }}>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                  <button className={`cyber-btn ${calendarView === 'semana' ? '' : 'cyber-btn-secondary'}`} onClick={() => setCalendarView('semana')} style={{ padding: '0.4rem 1rem' }}>Próximos 7 Dias</button>
                  <button className={`cyber-btn ${calendarView === 'mes' ? '' : 'cyber-btn-secondary'}`} onClick={() => setCalendarView('mes')} style={{ padding: '0.4rem 1rem' }}>Este Mês</button>
                  <button className={`cyber-btn ${calendarView === 'ano' ? '' : 'cyber-btn-secondary'}`} onClick={() => setCalendarView('ano')} style={{ padding: '0.4rem 1rem' }}>Este Ano</button>
                </div>
                
                {sortedDates.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                    {sortedDates.map(({date, display, events}, idx) => (
                      <div key={idx} style={{ borderLeft: '2px solid var(--accent-secondary)', paddingLeft: '1.5rem', position: 'relative' }}>
                        <div style={{ position: 'absolute', left: '-6px', top: '0', width: '10px', height: '10px', background: 'var(--accent-secondary)', borderRadius: '50%', boxShadow: '0 0 10px var(--accent-secondary)' }}></div>
                        <h3 style={{ marginTop: '-4px', marginBottom: '1.5rem', color: '#fff', fontSize: '1.2rem', display: 'inline-block', background: 'rgba(5,5,8,0.8)', padding: '0.2rem 0.8rem', border: '1px solid var(--border)', fontFamily: 'var(--font-display)' }}>
                          {display}
                        </h3>
                        <div className="cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                          {events.map(ev => (
                            <div key={ev.id} className="cyber-card" style={{ cursor: 'pointer', margin: 0, padding: 0 }} onClick={() => { if(ev.fonte_url) window.open(ev.fonte_url, '_blank'); }}>
                              <div className="card-media" style={{ height: '120px' }}>
                                <img src={ev.imagem_flyer_path || 'https://placehold.co/600x400/12121a/00ff88?text=Sem+Flyer'} alt={ev.titulo} className="card-img" />
                                <span className={`score-badge ${getScoreClass(ev.ia_score_cilada)}`} style={{ fontSize: '0.65rem', padding: '0.2rem 0.4rem' }}>
                                  IA: {ev.ia_score_cilada}
                                </span>
                              </div>
                              <div className="card-content" style={{ padding: '1rem' }}>
                                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.titulo}</h4>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                  <Clock size={12} style={{ verticalAlign: 'middle', marginRight: '4px', color: 'var(--accent)' }} />
                                  {ev.data_hora ? new Date(ev.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'Hora indefinida'}
                                </div>
                                {ev.endereco && (
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    <MapPin size={12} style={{ verticalAlign: 'middle', marginRight: '4px', color: 'var(--accent)' }} />
                                    {ev.endereco}
                                  </div>
                                )}
                                <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.5rem' }}>
                                  {ev.bairro && <span className="tag-badge"><MapPin size={10} style={{ marginRight: '2px', display: 'inline' }} />{ev.bairro}</span>}
                                  {ev.kid_friendly && <span className="tag-badge tag-badge-accent">Kids Ok</span>}
                                </div>
                                {ev.atualizado_em && (
                                  <div style={{ marginTop: '0.8rem', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                    <RefreshCw size={10} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                                    Atualizado em: {new Date(ev.atualizado_em).toLocaleDateString('pt-BR')}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <span className="empty-icon"><Calendar size={32} /></span>
                    <h2 className="empty-title">Timeline Vazia</h2>
                    <p className="empty-desc">Nenhum evento futuro mapeado para este período.</p>
                  </div>
                )}
              </div>
            )
          })() : null}

          {session && activeTab === 'logs' && (
            <div style={{ animation: 'fade-in 0.3s ease-out' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
                
                <div className="cyber-card-holographic" style={{ padding: '1.5rem' }}>
                  <span className="cyber-corner tl"></span>
                  <span className="cyber-corner tr"></span>
                  <span className="cyber-corner bl"></span>
                  <span className="cyber-corner br"></span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <span className="info-label">Setores Monitorados</span>
                    <span style={{ fontSize: '2rem', fontWeight: '800', fontFamily: 'var(--font-display)', color: 'var(--accent-secondary)' }}>{locais.length} locais</span>
                  </div>
                </div>

                <div className="cyber-card-holographic" style={{ padding: '1.5rem' }}>
                  <span className="cyber-corner tl"></span>
                  <span className="cyber-corner tr"></span>
                  <span className="cyber-corner bl"></span>
                  <span className="cyber-corner br"></span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <span className="info-label">Varreduras Feitas</span>
                    <span style={{ fontSize: '2rem', fontWeight: '800', fontFamily: 'var(--font-display)', color: 'var(--accent)' }}>{logs.length} runs</span>
                  </div>
                </div>

                <div className="cyber-card-holographic" style={{ padding: '1.5rem' }}>
                  <span className="cyber-corner tl"></span>
                  <span className="cyber-corner tr"></span>
                  <span className="cyber-corner bl"></span>
                  <span className="cyber-corner br"></span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <span className="info-label">Fila de Integração</span>
                    <span style={{ fontSize: '2rem', fontWeight: '800', fontFamily: 'var(--font-display)', color: 'var(--color-danger)', filter: 'drop-shadow(0 0 5px var(--color-danger))' }}>
                      {filaPendentes.length} links
                    </span>
                  </div>
                </div>

                <div className="cyber-card-holographic" style={{ padding: '1.5rem' }}>
                  <span className="cyber-corner tl"></span>
                  <span className="cyber-corner tr"></span>
                  <span className="cyber-corner bl"></span>
                  <span className="cyber-corner br"></span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <span className="info-label">Feed Ingestão</span>
                    <span style={{ fontSize: '2rem', fontWeight: '800', fontFamily: 'var(--font-display)', color: 'var(--accent-tertiary)', filter: 'drop-shadow(0 0 5px var(--accent-tertiary))' }}>
                      {feedItems.filter(f => f.ativo).length} / {feedItems.length}
                    </span>
                  </div>
                </div>

                <div className="cyber-card-holographic" style={{ padding: '1.5rem', minWidth: '220px' }}>
                  <span className="cyber-corner tl"></span>
                  <span className="cyber-corner tr"></span>
                  <span className="cyber-corner bl"></span>
                  <span className="cyber-corner br"></span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <span className="info-label" style={{ marginBottom: '0.3rem' }}>Escuta & Agendamento</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                      <Clock size={12} style={{ verticalAlign: 'middle', marginRight: '4px', color: 'var(--accent)' }} /> <strong>Último:</strong> {logs.length > 0 ? formatarData(logs[0].executado_em) : 'Nenhum'}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                      <RefreshCw size={12} style={{ verticalAlign: 'middle', marginRight: '4px', color: 'var(--color-safe)' }} /> <strong>Esteira Mestre:</strong> A cada 4 horas (GitHub)
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                      <RefreshCw size={12} style={{ verticalAlign: 'middle', marginRight: '4px', color: '#fff' }} /> <strong>Limpeza/Enriquecimento:</strong> 03:00 (GitHub)
                    </span>
                  </div>
                </div>
              </div>

              {/* Fluxo Visual do Pipeline */}
              <div className="cyber-card-terminal" style={{ padding: '1.5rem', marginBottom: '2rem', border: '1px solid rgba(0, 212, 255, 0.2)' }}>
                <h3 style={{ margin: 0, marginBottom: '1.25rem', fontFamily: 'var(--font-display)', fontSize: '0.95rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Cpu size={16} style={{ color: 'var(--accent-tertiary)' }} />
                  FLUXO DO SCANNER E STATUS ATUAL // ÚLTIMA VARREDURA
                </h3>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                  
                  {/* Passo 1 */}
                  <div style={{ padding: '1rem', background: 'rgba(5, 5, 8, 0.6)', borderLeft: '3px solid var(--accent)', borderRadius: '4px' }}>
                    <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-label)', color: 'var(--accent)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Passo 1: Mineração Web</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#fff', marginBottom: '0.5rem' }}>Scraper & Organizer</div>
                    
                    {parseLatestLogMetrics ? (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        <div style={{ marginBottom: '0.3rem' }}>
                          <strong>Termos buscados:</strong> {parseLatestLogMetrics.buscas.length}
                        </div>
                        <div style={{ maxHeight: '90px', overflowY: 'auto', marginBottom: '0.5rem', background: 'rgba(0,0,0,0.3)', padding: '0.3rem', borderRadius: '3px' }}>
                          {parseLatestLogMetrics.buscas.map((b, i) => (
                            <div key={i} style={{ fontSize: '0.65rem', color: b.erro ? 'var(--color-danger)' : (b.urls === 0 ? 'var(--color-warning)' : '#ccc'), marginBottom: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              • "{b.query}" → <strong>{b.erro ? 'Falhou' : `${b.urls} URLs`}</strong>
                            </div>
                          ))}
                          {parseLatestLogMetrics.buscas.length === 0 && <div style={{ fontSize: '0.65rem' }}>Nenhuma busca registrada</div>}
                        </div>
                        <div style={{ marginTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.5rem' }}>
                          <strong>Páginas inéditas filtradas:</strong> <span style={{ color: 'var(--accent)', fontWeight: 'bold', marginLeft: '0.3rem' }}>+{parseLatestLogMetrics.linksNovos} links</span>
                        </div>
                      </div>
                    ) : (
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0 }}>Sem dados da última varredura.</p>
                    )}
                  </div>

                  {/* Passo 2 */}
                  <div style={{ padding: '1rem', background: 'rgba(5, 5, 8, 0.6)', borderLeft: '3px solid var(--accent-secondary)', borderRadius: '4px' }}>
                    <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-label)', color: 'var(--accent-secondary)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Passo 2: Staging</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#fff', marginBottom: '0.5rem' }}>Fila Supabase (Aguardando IA)</div>
                    
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ flex: 1 }}>
                        <strong>Links extraídos e na fila agora:</strong>
                        <div style={{ fontSize: '1.75rem', color: filaPendentes.length > 0 ? 'var(--color-danger)' : 'var(--accent-secondary)', fontWeight: 'bold', marginTop: '0.5rem', fontFamily: 'var(--font-display)' }}>
                          {filaPendentes.length} links pendentes
                        </div>
                      </div>
                      <p style={{ fontSize: '0.65rem', margin: 0, lineHeight: '1.4', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.5rem' }}>
                        Todo link novo entra nessa fila de espera até que o modelo do Gemini tenha cota disponível para extrair os dados.
                      </p>
                    </div>
                  </div>

                  {/* Passo 3 */}
                  <div style={{ padding: '1rem', background: 'rgba(5, 5, 8, 0.6)', borderLeft: '3px solid var(--accent-tertiary)', borderRadius: '4px' }}>
                    <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-label)', color: 'var(--accent-tertiary)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Passo 3: Integração</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#fff', marginBottom: '0.5rem' }}>Processamento Gemini</div>
                    
                    {parseLatestLogMetrics ? (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <div style={{ marginBottom: '0.5rem' }}>
                          <strong>Status do Robô (Gemini):</strong><br/>
                          <span style={{ color: parseLatestLogMetrics.geminiColor, fontWeight: 'bold', display: 'inline-block', marginTop: '0.2rem' }}>{parseLatestLogMetrics.geminiStatus}</span>
                        </div>
                        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.6rem', borderRadius: '3px', marginTop: 'auto' }}>
                          <strong style={{ fontSize: '0.65rem', display: 'block', marginBottom: '0.4rem', color: '#fff' }}>Integrados no último ciclo:</strong>
                          <span style={{ display: 'block', color: 'var(--color-safe)', fontWeight: 'bold', marginBottom: '0.2rem' }}>• {parseLatestLogMetrics.eventosSalvos} Eventos salvos</span>
                          <span style={{ display: 'block', color: 'var(--accent-secondary)', fontWeight: 'bold' }}>• {parseLatestLogMetrics.locaisSalvos} Locais salvos</span>
                        </div>
                      </div>
                    ) : (
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0 }}>Sem dados de integração.</p>
                    )}
                  </div>

                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem', marginBottom: '3rem' }}>
                
                {/* Console Terminal */}
                <div className="cyber-card-terminal" style={{ margin: 0 }}>
                  <div className="terminal-header">
                    <div className="terminal-dot red"></div>
                    <div className="terminal-dot yellow"></div>
                    <div className="terminal-dot green"></div>
                    <div className="terminal-title">OUTPUT STREAM // SCRAPER TERMINAL</div>
                  </div>
                  <div style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                      <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '0.95rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Terminal size={14} style={{ color: 'var(--accent)' }} /> 
                        CONSOLE GITHUB / VERCEL
                      </h3>
                      <button className="cyber-btn" onClick={triggerScrapeNuvem} disabled={scrapeLoading} style={{ padding: '0.5rem 1rem', fontSize: '0.75rem' }}>
                        <RefreshCw size={12} style={{ animation: scrapeLoading ? 'spin 1.5s linear infinite' : 'none' }} />
                        {scrapeLoading ? 'Escaneando...' : 'Gatilho Rápido (1 Item Vercel)'}
                      </button>
                    </div>
                    <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                      Mostra os logs gerados na nuvem durante a última varredura do robô (Varre buscas + processa 1 link da fila).
                    </p>
                    <div className="terminal-console" style={{ height: '280px', overflowY: 'auto' }}>
                      {logs.length > 0 ? logs[0].logs : 'Terminal pronto para escuta. Aguardando disparo de varredura...'}
                    </div>
                  </div>
                </div>

                {/* Fila de Processamento */}
                <div className="cyber-card-terminal" style={{ margin: 0 }}>
                  <div className="terminal-header" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--accent-secondary)' }}>
                    <div className="terminal-dot red"></div>
                    <div className="terminal-dot yellow"></div>
                    <div className="terminal-dot green"></div>
                    <div className="terminal-title" style={{ color: 'var(--accent-secondary)' }}>QUEUE STREAM // GEMINI STAGING QUEUE</div>
                  </div>
                  <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{ margin: 0, marginBottom: '0.5rem', fontFamily: 'var(--font-display)', fontSize: '0.95rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Terminal size={14} style={{ color: 'var(--accent-secondary)' }} />
                      PÁGINAS PENDENTES NA FILA ({filaPendentes.length})
                    </h3>
                    <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                      Links inéditos detectados que estão aguardando liberação de cota do Gemini para serem integrados.
                    </p>
                    <div style={{ height: '280px', overflowY: 'auto', paddingRight: '0.5rem' }} className="terminal-console">
                      {filaPendentes.length > 0 ? (
                        filaPendentes.map((item, index) => (
                          <div key={item.id} style={{ marginBottom: '0.8rem', paddingBottom: '0.8rem', borderBottom: '1px solid rgba(255,0,255,0.1)', fontSize: '0.75rem', fontFamily: 'var(--font-body)', color: 'var(--text-muted)' }}>
                            <div style={{ color: 'var(--accent-secondary)', fontWeight: 'bold' }}>[{index + 1}] {item.titulo || 'Página Sem Título'}</div>
                            <div style={{ wordBreak: 'break-all', fontSize: '0.65rem', marginTop: '0.2rem' }}>
                              <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-tertiary)', textDecoration: 'underline' }}>{item.url}</a>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div style={{ color: 'var(--accent)', opacity: 0.6, fontSize: '0.75rem', fontStyle: 'italic', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          Fila limpa. Todas as páginas mapeadas foram processadas pelo Gemini!
                        </div>
                      )}
                    </div>
                  </div>
                </div>

              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem', marginBottom: '3rem' }}>
                {/* Coluna Esquerda: Histórico e Execução Local */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                  <div>
                    <h3 className="modal-section-title" style={{ borderLeftColor: 'var(--accent-tertiary)', margin: '0 0 1rem 0' }}>
                      <Clock size={16} /> Histórico de Varredura
                    </h3>
                    <div className="technical-table-container">
                      <table className="technical-table">
                        <thead>
                          <tr>
                            <th>Data</th>
                            <th>Status</th>
                            <th>Eventos Captados</th>
                          </tr>
                        </thead>
                        <tbody>
                          {logs.slice(0, 5).map((log, index) => (
                            <tr key={log.id || index}>
                              <td style={{ fontWeight: 'bold' }}>{new Date(log.executado_em).toLocaleDateString('pt-BR')}</td>
                              <td>
                                <span style={{ color: log.sucesso ? 'var(--color-safe)' : 'var(--color-danger)', fontWeight: 'bold' }}>
                                  {log.sucesso ? 'ONLINE' : 'FALHA'}
                                </span>
                              </td>
                              <td style={{ color: 'var(--accent-secondary)', fontWeight: 'bold' }}>+{log.eventos_novos}</td>
                            </tr>
                          ))}
                          {logs.length === 0 && (
                            <tr>
                              <td colSpan="3" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                Nenhum histórico disponível.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="cyber-card-holographic" style={{ padding: '1.5rem' }}>
                    <span className="cyber-corner tl"></span>
                    <span className="cyber-corner tr"></span>
                    <span className="cyber-corner bl"></span>
                    <span className="cyber-corner br"></span>
                    <h3 style={{ fontSize: '1rem', fontFamily: 'var(--font-display)', marginBottom: '0.8rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Cpu size={16} style={{ color: 'var(--accent-tertiary)' }} />
                      EXECUTAR NODE LOCALMENTE
                    </h3>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '1rem' }}>
                      Caso queira executar a varredura local usando sua API do Gemini e credenciais locais do Supabase, rode o comando no root:
                    </p>
                    <div style={{ background: '#050508', border: '1px solid var(--border)', padding: '0.6rem 0.8rem', fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--accent-secondary)', marginBottom: '1rem', overflowX: 'auto', clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)' }}>
                      node backend/scraper.js
                    </div>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      Assegure que as variáveis <code style={{ color: '#fff' }}>GEMINI_API_KEY</code> e chaves de banco estejam setadas no <code style={{ color: '#fff' }}>.env</code>.
                    </p>
                  </div>
                </div>

                {/* Coluna Direita: Gerenciador do Feed Manual */}
                <div className="cyber-card-terminal" style={{ margin: 0 }}>
                  <div className="terminal-header" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--accent-tertiary)' }}>
                    <div className="terminal-dot red"></div>
                    <div className="terminal-dot yellow"></div>
                    <div className="terminal-dot green"></div>
                    <div className="terminal-title" style={{ color: 'var(--accent-tertiary)' }}>FEED STREAM // FONTES DE DADOS</div>
                  </div>
                  <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{ margin: 0, marginBottom: '0.5rem', fontFamily: 'var(--font-display)', fontSize: '0.95rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Globe size={14} style={{ color: 'var(--accent-tertiary)' }} />
                      FEED DE RASPAGEM ({feedItems.length} links)
                    </h3>
                    <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                      Insira links de portais, eventos ou feeds RSS. O robô vai enfileirar e analisar todas as novidades no próximo ciclo.
                    </p>

                    <form onSubmit={handleAddFeedItem} style={{ marginBottom: '1.25rem', padding: '1rem', background: 'rgba(5, 5, 8, 0.4)', border: '1px solid rgba(0, 212, 255, 0.1)', borderRadius: '4px' }}>
                      <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                        <label className="form-label" style={{ fontSize: '0.65rem', marginBottom: '0.25rem' }}>URL de Destino</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          placeholder="Ex: https://spetaculo.com.br/agenda" 
                          value={feedUrlInput} 
                          onChange={e => setFeedUrlInput(e.target.value)} 
                          style={{ width: '100%', fontSize: '0.75rem', padding: '0.4rem 0.6rem', background: 'rgba(0,0,0,0.5)', borderColor: 'var(--border)' }} 
                          required 
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: '1rem' }}>
                        <label className="form-label" style={{ fontSize: '0.65rem', marginBottom: '0.25rem' }}>Marcador / Nome amigável (Opcional)</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          placeholder="Ex: Agenda Cultural SP" 
                          value={feedTitleInput} 
                          onChange={e => setFeedTitleInput(e.target.value)} 
                          style={{ width: '100%', fontSize: '0.75rem', padding: '0.4rem 0.6rem', background: 'rgba(0,0,0,0.5)', borderColor: 'var(--border)' }} 
                        />
                      </div>
                      <button type="submit" className="cyber-btn" disabled={addingFeed} style={{ width: '100%', padding: '0.5rem', fontSize: '0.75rem', justifyContent: 'center' }}>
                        <Plus size={12} /> {addingFeed ? 'CADASTRANDO...' : 'INCORPORAR AO FEED'}
                      </button>
                    </form>

                    <div style={{ height: '180px', overflowY: 'auto', paddingRight: '0.25rem' }} className="terminal-console">
                      {feedItems.length > 0 ? (
                        feedItems.map((item) => {
                          let evCount = 0;
                          let locCount = 0;
                          if (item.url) {
                            try {
                              const domain = new URL(item.url).hostname.replace('www.', '');
                              evCount = eventos.filter(e => e.fonte_url && e.fonte_url.includes(domain)).length;
                              locCount = locais.filter(l => l.fonte_url && l.fonte_url.includes(domain)).length;
                            } catch(e) {
                              evCount = eventos.filter(e => e.fonte_url && e.fonte_url.includes(item.url)).length;
                              locCount = locais.filter(l => l.fonte_url && l.fonte_url.includes(item.url)).length;
                            }
                          }

                          return (
                          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', paddingBottom: '0.6rem', borderBottom: '1px solid rgba(0, 212, 255, 0.08)', fontSize: '0.75rem' }}>
                            <div style={{ overflow: 'hidden', paddingRight: '0.5rem', flex: 1 }}>
                              <div style={{ color: item.ativo ? '#fff' : 'var(--text-muted)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: item.ativo ? 'var(--color-safe)' : 'var(--color-danger)', display: 'inline-block' }}></span>
                                {item.titulo || 'Sem marcador'}
                              </div>
                              <div style={{ wordBreak: 'break-all', fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '0.1rem', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-secondary)' }}>{item.url}</a>
                              </div>
                              <div style={{ fontSize: '0.6rem', color: 'var(--accent-tertiary)', marginTop: '0.25rem', fontFamily: 'var(--font-label)', display: 'flex', gap: '0.5rem' }}>
                                <span>{evCount} EVENTOS</span>
                                <span>{locCount} LOCAIS</span>
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <button 
                                type="button"
                                className="cyber-btn" 
                                onClick={() => handleToggleFeedItem(item.id, item.ativo)}
                                style={{ padding: '0.2rem 0.4rem', fontSize: '0.6rem', minWidth: '55px', background: item.ativo ? 'rgba(0, 255, 136, 0.08)' : 'rgba(255, 51, 102, 0.08)', borderColor: item.ativo ? 'rgba(0, 255, 136, 0.2)' : 'rgba(255, 51, 102, 0.2)', color: item.ativo ? 'var(--color-safe)' : 'var(--color-danger)' }}
                              >
                                {item.ativo ? 'ATIVO' : 'PAUSADO'}
                              </button>
                              <button 
                                type="button"
                                className="cyber-btn cyber-btn-danger" 
                                onClick={() => handleDeleteFeedItem(item.id)}
                                style={{ padding: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        );
                        })
                      ) : (
                        <div style={{ color: 'var(--accent)', opacity: 0.6, fontSize: '0.7rem', fontStyle: 'italic', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          Feed manual limpo. Adicione uma URL acima!
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Formulário de Configuração do Robô */}
              <div className="cyber-card-terminal">
                <div className="terminal-header">
                  <div className="terminal-dot red"></div>
                  <div className="terminal-dot yellow"></div>
                  <div className="terminal-dot green"></div>
                  <div className="terminal-title">CONFIGURAÇÃO DE DIRETRIZES DA INTELIGÊNCIA ARTIFICIAL</div>
                </div>
                <form onSubmit={handleSaveScraperConfig} style={{ padding: '2rem' }}>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: '1.6' }}>
                    Altere os gatilhos de palavras-chave que o motor de busca consulta na web, bem como a persona e limites da IA (Gemini) na extração e classificação de ciladas.
                  </p>
                  
                  <div className="form-group">
                    <label className="form-label">
                      Palavras-chave de Busca na Web (Formato JSON Array)
                    </label>
                    <div style={{ position: 'relative' }}>
                      <textarea 
                        className="form-input" 
                        style={{ width: '100%', minHeight: '100px', resize: 'vertical', fontFamily: 'var(--font-body)', fontSize: '0.8rem', lineHeight: '1.4' }} 
                        value={searchQueries} 
                        onChange={e => setSearchQueries(e.target.value)} 
                        required 
                      />
                    </div>
                    <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'block', marginTop: '0.2rem' }}>
                      Deve ser uma estrutura válida. Exemplo: <code style={{ color: 'var(--accent)' }}>["anime sp", "rpg sao paulo"]</code>
                    </small>
                  </div>

                  <div className="form-group" style={{ marginTop: '1.5rem' }}>
                    <label className="form-label">
                      Comando de Inteligência Artificial (Prompt do Gemini)
                    </label>
                    <textarea 
                      className="form-input" 
                      style={{ width: '100%', minHeight: '180px', resize: 'vertical', fontSize: '0.8rem', lineHeight: '1.4' }} 
                      value={geminiPrompt} 
                      onChange={e => setGeminiPrompt(e.target.value)} 
                      required 
                    />
                    <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'block', marginTop: '0.2rem' }}>
                      Garante a formatação necessária e os critérios para avaliar de 0 a 10 se o evento é uma "cilada".
                    </small>
                  </div>

                  <button type="submit" className="cyber-btn cyber-btn-secondary" style={{ marginTop: '1.5rem', width: '100%', justifyContent: 'center' }} disabled={savingConfig}>
                    <Save size={14} />
                    {savingConfig ? 'GRAVANDO DIRETRIZES...' : 'SALVAR DIRETRIZES NO BANCO DE DADOS'}
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {!config.isConfigured && !showSettings && (
        <div className="empty-state" style={{ padding: '6rem 2rem' }}>
          <span className="empty-icon"><Database size={40} /></span>
          <h2 className="empty-title">Sem credenciais Supabase</h2>
          <p className="empty-desc" style={{ marginBottom: '2rem' }}>É necessário estabelecer uma ponte com o banco de dados antes de iniciar o scanner do Sprawl.</p>
          <button className="cyber-btn" onClick={() => setShowSettings(true)}>
            CONECTAR SUPABASE
          </button>
        </div>
      )}

      {selectedLocal && (
        <div className="modal-overlay" onClick={() => setSelectedLocal(null)}>
          <div className="modal-container cyber-card-holographic" onClick={(e) => e.stopPropagation()}>
            <span className="cyber-corner tl"></span>
            <span className="cyber-corner tr"></span>
            <span className="cyber-corner bl"></span>
            <span className="cyber-corner br"></span>
            <button className="modal-close-btn" onClick={() => setSelectedLocal(null)}>
              <X size={16} />
            </button>
            <div className="modal-hero">
              <img src={selectedLocal.imagem_hero_path || 'https://placehold.co/600x400/12121a/ff00ff?text=Base+Geek'} alt={selectedLocal.nome} className="modal-hero-img" />
              <div className="modal-hero-overlay"><h2 className="modal-title">{selectedLocal.nome}</h2></div>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.85rem', color: '#fff', lineHeight: '1.5', marginBottom: '1.5rem', background: 'rgba(5, 5, 8, 0.6)', padding: '1rem', border: '1px solid var(--border)', clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)' }}>
                {selectedLocal.descricao || 'Sem descrição cadastrada.'}
              </p>
              
              <div className="modal-info-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                <div className="modal-info-item">
                  <span className="info-label">Bairro</span>
                  <span className="info-val">📍 {selectedLocal.bairro || 'São Paulo'}</span>
                </div>
                {selectedLocal.endereco && (
                  <div className="modal-info-item">
                    <span className="info-label">Endereço</span>
                    <span className="info-val">📍 {selectedLocal.endereco}</span>
                  </div>
                )}
                {selectedLocal.preco_medio && (
                  <div className="modal-info-item">
                    <span className="info-label">Preço Médio</span>
                    <span className="info-val">💵 {selectedLocal.preco_medio}</span>
                  </div>
                )}
                <div className="modal-info-item">
                  <span className="info-label">Procedência</span>
                  <span className="info-val" style={{ color: selectedLocal.ia_inferido ? 'var(--color-danger)' : 'var(--color-safe)', fontWeight: 'bold' }}>
                    {selectedLocal.ia_inferido ? '🤖 IA (Inferido)' : '🌐 Real (Extraído)'}
                  </span>
                </div>
                {selectedLocal.fonte_url && (
                  <div className="modal-info-item">
                    <span className="info-label">Website Oficial</span>
                    <a 
                      href={selectedLocal.fonte_url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="info-val" 
                      style={{ color: 'var(--accent)', textDecoration: 'underline', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                    >
                      <ExternalLink size={12} /> Visitar Site
                    </a>
                  </div>
                )}
                <div className="modal-info-item" style={{ gridColumn: '1 / -1' }}>
                  <span className="info-label">Restrições Alimentares</span>
                  <span className="info-val" style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                    {selectedLocal.tags_consumo?.map((tag, idx) => (
                      <span key={idx} className="tag-badge tag-badge-accent" style={{ background: 'rgba(0, 255, 136, 0.08)', color: 'var(--accent)', borderColor: 'rgba(0, 255, 136, 0.2)' }}>{tag}</span>
                    )) || 'Não especificado'}
                  </span>
                </div>
              </div>
              
              <h3 className="modal-section-title">
                <Calendar size={16} /> Eventos Agendados Neste Setor
              </h3>
              {eventosDoLocalSelecionado.length > 0 ? (
                <div className="modal-events-list">
                  {eventosDoLocalSelecionado.map(ev => (
                    <div key={ev.id} className="modal-event-item">
                      <div>
                        <div className="modal-event-title">{ev.titulo}</div>
                        <div className="modal-event-date">
                          <Clock size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                          {formatarData(ev.data_hora)}
                        </div>
                      </div>
                      <span className={`score-badge ${getScoreClass(ev.ia_score_cilada)}`} style={{ position: 'static' }}>
                        {getScoreIcon(ev.ia_score_cilada)}
                        IA: {ev.ia_score_cilada}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontStyle: 'italic', textAlign: 'center', padding: '2rem 0' }}>
                  Nenhum evento registrado nos canais deste local.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="settings-overlay">
          <form className="settings-box" onSubmit={handleSaveSettings}>
            <span className="cyber-corner tl"></span>
            <span className="cyber-corner tr"></span>
            <span className="cyber-corner bl"></span>
            <span className="cyber-corner br"></span>
            {config.isConfigured && (
              <button type="button" className="modal-close-btn" onClick={() => setShowSettings(false)}>
                <X size={16} />
              </button>
            )}
            <h2 className="settings-title">Link Supabase</h2>
            <p className="settings-desc">Entre com os pontos de acesso à sua base do Supabase no Sprawl.</p>
            
            <div className="form-group">
              <label className="form-label">Supabase URL</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--accent-secondary)', fontSize: '0.9rem', fontFamily: 'var(--font-label)' }}>&gt;</span>
                <input 
                  type="url" 
                  className="form-input" 
                  style={{ width: '100%', paddingLeft: '1.8rem' }}
                  value={inputUrl} 
                  onChange={(e) => setInputUrl(e.target.value)} 
                  required 
                />
              </div>
            </div>
            
            <div className="form-group" style={{ marginBottom: '2rem' }}>
              <label className="form-label">Supabase Anon Key</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--accent-secondary)', fontSize: '0.9rem', fontFamily: 'var(--font-label)' }}>&gt;</span>
                <input 
                  type="password" 
                  className="form-input" 
                  style={{ width: '100%', paddingLeft: '1.8rem' }}
                  value={inputAnonKey} 
                  onChange={(e) => setInputAnonKey(e.target.value)} 
                  required 
                />
              </div>
            </div>
            
            <div className="settings-footer">
              <button type="submit" className="cyber-btn" style={{ width: '100%', justifyContent: 'center' }}>
                <Save size={14} /> ESTABELECER PONTE
              </button>
              {config.isConfigured && (
                <button type="button" className="cyber-btn cyber-btn-danger" onClick={handleClearSettings} style={{ width: '100%', justifyContent: 'center' }}>
                  <Trash2 size={14} /> LIMPAR CONEXÃO
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
