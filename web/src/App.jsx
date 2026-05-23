import React, { useState, useEffect, useMemo } from 'react'
import { supabase, getSupabaseConfig, saveSupabaseConfig, clearSupabaseConfig } from './supabase'

export default function App() {
  const [config, setConfig] = useState(getSupabaseConfig())
  const [showSettings, setShowSettings] = useState(!config.isConfigured)
  
  // Inputs de configuração temporários
  const [inputUrl, setInputUrl] = useState(config.url)
  const [inputAnonKey, setInputAnonKey] = useState(config.anonKey)

  // Dados do Supabase
  const [eventos, setEventos] = useState([])
  const [locais, setLocais] = useState([])
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Estados de navegação e filtros
  const [activeTab, setActiveTab] = useState('eventos') // 'eventos' | 'locais' | 'logs'
  const [searchQuery, setSearchQuery] = useState('')
  const [filterOption, setFilterOption] = useState('todos')
  const [selectedLocal, setSelectedLocal] = useState(null)

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

        // 2. Buscar eventos com a relação do local
        const { data: eventosData, error: eventosErr } = await supabase
          .from('eventos')
          .select('*, locais_fixos(*)')

        if (eventosErr) throw eventosErr

        // 3. Buscar logs de scraping (tabela opcional historico_scraping)
        let logsData = []
        try {
          const { data, error: logsErr } = await supabase
            .from('historico_scraping')
            .select('*')
            .order('executado_em', { ascending: false })
          if (!logsErr) {
            logsData = data
          } else {
            console.warn("historico_scraping erro:", logsErr)
          }
        } catch (e) {
          console.warn("Erro ao ler tabela historico_scraping:", e)
        }

        setLocais(locaisData || [])
        setEventos(eventosData || [])
        setLogs(logsData || [])
      } else {
        // Fallback offline: buscar do arquivo data.json gerado localmente
        const res = await fetch('/data.json')
        if (res.ok) {
          const localData = await res.json()
          setLocais(localData.locais || [])
          setEventos(localData.eventos || [])
          setLogs(localData.logs || [])
        } else {
          // Sem configuração e sem arquivo local
          setLocais([])
          setEventos([])
          setLogs([])
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
  }, [config])

  // Salvar configurações
  const handleSaveSettings = (e) => {
    e.preventDefault()
    if (!inputUrl || !inputAnonKey) {
      alert('Por favor, preencha todos os campos.')
      return
    }
    saveSupabaseConfig(inputUrl, inputAnonKey)
    setConfig(getSupabaseConfig())
    setShowSettings(false)
    // Forçar recarga da página para reinicializar o cliente supabase
    window.location.reload()
  }

  // Limpar configurações
  const handleClearSettings = () => {
    if (confirm('Deseja realmente limpar as credenciais de teste?')) {
      clearSupabaseConfig()
      setConfig(getSupabaseConfig())
      setEventos([])
      setLocais([])
      setInputUrl('')
      setInputAnonKey('')
      setShowSettings(true)
    }
  }

  // Filtragem dinâmica de Eventos
  const filteredEventos = useMemo(() => {
    return eventos.filter(evento => {
      const matchesSearch = evento.titulo.toLowerCase().includes(searchQuery.toLowerCase())
      
      if (!matchesSearch) return false

      if (filterOption === 'recomendados') {
        return evento.ia_score_cilada >= 7
      }
      if (filterOption === 'alerta') {
        return evento.ia_score_cilada < 5
      }
      if (filterOption === 'kids') {
        return evento.kid_friendly === true
      }
      
      return true
    })
  }, [eventos, searchQuery, filterOption])

  // Filtragem dinâmica de Locais
  const filteredLocais = useMemo(() => {
    return locais.filter(local => {
      const matchesSearch = local.nome.toLowerCase().includes(searchQuery.toLowerCase())
      
      if (!matchesSearch) return false

      if (filterOption === 'vegan') {
        return local.tags_consumo?.some(tag => tag.toLowerCase().includes('vegan') || tag.toLowerCase().includes('plant-based'))
      }
      if (filterOption === 'lactose') {
        return local.tags_consumo?.some(tag => tag.toLowerCase().includes('lactose') || tag.toLowerCase().includes('zero-lactose'))
      }

      return true
    })
  }, [locais, searchQuery, filterOption])

  // Retorna eventos acontecendo em um local específico
  const eventosDoLocalSelecionado = useMemo(() => {
    if (!selectedLocal) return []
    return eventos.filter(ev => ev.local_id === selectedLocal.id)
  }, [eventos, selectedLocal])

  // Formatar data amigável
  const formatarData = (dataStr) => {
    try {
      const d = new Date(dataStr)
      return d.toLocaleDateString('pt-BR', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return dataStr
    }
  }

  // Obter classe CSS de cor baseada no Score da IA
  const getScoreClass = (score) => {
    if (score >= 7) return 'score-safe'
    if (score >= 5) return 'score-warning'
    return 'score-danger'
  }

  return (
    <div className="app-container">
      {/* CABEÇALHO */}
      <header className="header">
        <div className="logo-container">
          <span className="logo-icon">📡</span>
          <div>
            <h1 className="logo-title">Radar Geek SP</h1>
            <p className="logo-subtitle">Motor de Recomendação Cético</p>
          </div>
        </div>
        <div className="header-actions">
          {config.isConfigured && (
            <button className="btn btn-primary" onClick={fetchDados} disabled={loading}>
              {loading ? 'Carregando...' : '🔄 Sincronizar'}
            </button>
          )}
          <button className="btn" onClick={() => setShowSettings(true)}>
            ⚙️ Configurar Banco
          </button>
        </div>
      </header>

      {/* ABAS */}
      {(config.isConfigured || eventos.length > 0 || locais.length > 0) && (
        <div className="tabs-container">
          <button 
            className={`tab-btn ${activeTab === 'eventos' ? 'active' : ''}`}
            onClick={() => { setActiveTab('eventos'); setFilterOption('todos'); }}
          >
            🗓️ Eventos da Semana
          </button>
          <button 
            className={`tab-btn ${activeTab === 'locais' ? 'active' : ''}`}
            onClick={() => { setActiveTab('locais'); setFilterOption('todos'); }}
          >
            🏰 Lugares Fixos
          </button>
          <button 
            className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            ⚙️ Painel do Scraper
          </button>
        </div>
      )}

      {/* ERROS E CONFIGURAÇÃO */}
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--color-danger)', borderRadius: '16px', padding: '1rem', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ color: 'var(--color-danger)', fontSize: '0.9rem' }}>⚠️ {error}</p>
          <button className="btn btn-danger" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => setError(null)}>Fechar</button>
        </div>
      )}

      {/* PAINEL DE CONTROLE (BUSCA / FILTRO) */}
      {(config.isConfigured || eventos.length > 0 || locais.length > 0) && activeTab !== 'logs' && !loading && (
        <div className="controls-bar">
          <div className="search-input-container">
            <span className="search-icon-inside">🔍</span>
            <input 
              type="text" 
              className="search-input" 
              placeholder={activeTab === 'eventos' ? "Buscar eventos por título..." : "Buscar locais por nome..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          {activeTab === 'eventos' ? (
            <select 
              className="filter-select"
              value={filterOption}
              onChange={(e) => setFilterOption(e.target.value)}
            >
              <option value="todos">Filtro: Todos os Eventos</option>
              <option value="recomendados">⭐ Recomendados (IA &gt;= 7)</option>
              <option value="alerta">⚠️ Risco de Cilada (IA &lt; 5)</option>
              <option value="kids">👶 Livre para Crianças</option>
            </select>
          ) : (
            <select 
              className="filter-select"
              value={filterOption}
              onChange={(e) => setFilterOption(e.target.value)}
            >
              <option value="todos">Filtro: Todos os Lugares</option>
              <option value="vegan">🌱 Opções Plant-based / Vegan</option>
              <option value="lactose">🥛 Opções Sem Lactose</option>
            </select>
          )}
        </div>
      )}

      {/* CARREGAMENTO */}
      {loading && (
        <div className="empty-state">
          <span className="empty-icon" style={{ animation: 'spin 2s linear infinite' }}>⏳</span>
          <h2 className="empty-title">Consultando base de dados...</h2>
          <p className="empty-desc">Conectando ao Supabase para coletar o radar atualizado.</p>
        </div>
      )}

      {/* CONTEÚDO PRINCIPAL */}
      {(config.isConfigured || eventos.length > 0 || locais.length > 0) && !loading && (
        <>
          {activeTab === 'eventos' ? (
            filteredEventos.length > 0 ? (
              <div className="cards-grid">
                {filteredEventos.map(evento => (
                  <div key={evento.id} className="card">
                    <div className="card-media">
                      <img 
                        src={evento.imagem_flyer_path || 'https://placehold.co/600x400/222222/FFF?text=Sem+Flyer'} 
                        alt={evento.titulo} 
                        className="card-img"
                        onError={(e) => { e.target.src = 'https://placehold.co/600x400/222222/FFF?text=Radar+Geek' }}
                      />
                      <span className={`score-badge ${getScoreClass(evento.ia_score_cilada)}`}>
                        IA: {evento.ia_score_cilada}/10
                      </span>
                      {evento.kid_friendly && (
                        <span className="card-badge-top">👶 Livre</span>
                      )}
                    </div>
                    <div className="card-content">
                      <h3 className="card-title">{evento.titulo}</h3>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: '1.4', height: '2.8rem' }}>
                        {evento.descricao || 'Sem descrição cadastrada para este evento.'}
                      </p>
                      <div className="card-meta-row">
                        <span>📅 {formatarData(evento.data_hora)}</span>
                      </div>
                      
                      {evento.locais_fixos && (
                        <a 
                          href="#"
                          className="card-venue-link"
                          onClick={(e) => {
                            e.preventDefault()
                            setSelectedLocal(evento.locais_fixos)
                          }}
                        >
                          📍 Acontece em: {evento.locais_fixos.nome}
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <span className="empty-icon">🤷‍♂️</span>
                <h2 className="empty-title">Nenhum evento encontrado</h2>
                <p className="empty-desc">Experimente limpar a busca ou alterar a opção de filtro.</p>
              </div>
            )
          ) : (
            filteredLocais.length > 0 ? (
              <div className="cards-grid">
                {filteredLocais.map(local => (
                  <div key={local.id} className="card" style={{ cursor: 'pointer' }} onClick={() => setSelectedLocal(local)}>
                    <div className="card-media">
                      <img 
                        src={local.imagem_hero_path || 'https://placehold.co/600x400/222222/FFF?text=Base+Geek'} 
                        alt={local.nome} 
                        className="card-img"
                        onError={(e) => { e.target.src = 'https://placehold.co/600x400/222222/FFF?text=Base+Geek' }}
                      />
                      <span className="card-badge-top" style={{ color: 'var(--accent-secondary)' }}>
                        🧭 {local.distancia_mooca} min da Mooca
                      </span>
                    </div>
                    <div className="card-content">
                      <h3 className="card-title">{local.nome}</h3>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: '1.4', height: '2.8rem' }}>
                        {local.descricao || 'Sem descrição detalhada disponível.'}
                      </p>
                      <div className="card-tags">
                        {local.tags_consumo?.map((tag, idx) => (
                          <span key={idx} className={`tag-badge ${
                            tag.toLowerCase().includes('vegan') || tag.toLowerCase().includes('lactose') ? 'tag-badge-accent' : ''
                          }`}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <span className="empty-icon">🏰</span>
                <h2 className="empty-title">Nenhum local encontrado</h2>
                <p className="empty-desc">Verifique se os dados estão populados ou modifique os termos da pesquisa.</p>
              </div>
            )
          )}

          {activeTab === 'logs' && (
            <div style={{ animation: 'fade-in 0.3s ease-out' }}>
              {/* Cards de Métricas */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bases Monitoradas</span>
                  <span style={{ fontSize: '2rem', fontWeight: '800', fontFamily: 'var(--font-display)', color: 'var(--accent-secondary)' }}>
                    {locais.length} locais
                  </span>
                </div>
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Execuções Scraper</span>
                  <span style={{ fontSize: '2rem', fontWeight: '800', fontFamily: 'var(--font-display)', color: 'var(--text-main)' }}>
                    {logs.length} runs
                  </span>
                </div>
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Última Sincronização</span>
                  <span style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-main)', marginTop: '0.5rem' }}>
                    {logs.length > 0 ? formatarData(logs[0].executado_em) : 'Nenhuma execução registrada'}
                  </span>
                </div>
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status do Motor</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', fontWeight: '700', color: 'var(--color-safe)', marginTop: '0.5rem' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '5px', background: 'var(--color-safe)', display: 'inline-block', boxShadow: '0 0 10px var(--color-safe)', animation: 'pulse-glow 1.5s infinite alternate' }}></span>
                    Ativo via GitHub Actions
                  </span>
                </div>
              </div>

              {/* Console de Logs Ultima Execução */}
              <div style={{ marginBottom: '2.5rem' }}>
                <h3 className="modal-section-title">📺 Console do Último Scraping</h3>
                {logs.length > 0 ? (
                  <div style={{ 
                    background: '#0d1117', 
                    border: '1px solid #30363d', 
                    borderRadius: '12px', 
                    padding: '1.25rem', 
                    fontFamily: 'Courier New, Courier, monospace', 
                    fontSize: '0.85rem', 
                    color: '#39ff14', 
                    maxHeight: '260px', 
                    overflowY: 'auto', 
                    whiteSpace: 'pre-line',
                    boxShadow: 'inset 0 0 15px rgba(0,0,0,0.8)'
                  }}>
                    {logs[0].logs || 'Logs vazios para esta execução.'}
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic', textAlign: 'center', padding: '2rem 0' }}>
                    Nenhum console de log registrado.
                  </p>
                )}
              </div>

              {/* Histórico e Configuração Local */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
                {/* Tabela de Runs */}
                <div>
                  <h3 className="modal-section-title">🕒 Histórico de Sincronizações</h3>
                  <div style={{ overflowX: 'auto', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                          <th style={{ padding: '0.75rem 1rem' }}>Data</th>
                          <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                          <th style={{ padding: '0.75rem 1rem' }}>Novos Eventos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {logs.slice(0, 5).map((log, index) => (
                          <tr key={log.id || index} style={{ borderBottom: index < 4 ? '1px solid var(--border)' : 'none' }}>
                            <td style={{ padding: '0.75rem 1rem', fontWeight: '500' }}>{new Date(log.executado_em).toLocaleDateString('pt-BR')}</td>
                            <td style={{ padding: '0.75rem 1rem' }}>
                              <span style={{ color: log.sucesso ? 'var(--color-safe)' : 'var(--color-danger)', fontWeight: '600' }}>
                                {log.sucesso ? 'Sucesso' : 'Falha'}
                              </span>
                            </td>
                            <td style={{ padding: '0.75rem 1rem', color: 'var(--accent-secondary)', fontWeight: '700' }}>+{log.eventos_novos}</td>
                          </tr>
                        ))}
                        {logs.length === 0 && (
                          <tr>
                            <td colSpan="3" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>Sem registros de execuções.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Comandos do Scraper Local */}
                <div style={{ background: 'linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.5rem' }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '1rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    💻 Rodar Scraper Local com IA
                  </h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '1.25rem' }}>
                    Você pode acionar o scraper na sua máquina para testar a classificação por Inteligência Artificial (Gemini) e atualizar o banco do Supabase instantaneamente.
                  </p>
                  
                  <div style={{ background: '#0a0a0a', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.75rem 1rem', fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--accent-secondary)', marginBottom: '1rem', overflowX: 'auto' }}>
                    npm run scrape
                  </div>

                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                    <p style={{ fontWeight: '600', color: 'var(--text-main)', marginBottom: '0.25rem' }}>Como plugar as chaves reais:</p>
                    <p>Adicione estas variáveis no arquivo <strong style={{ color: 'var(--text-main)' }}>.env</strong> raiz ou do frontend:</p>
                    <ul style={{ paddingLeft: '1.25rem', marginTop: '0.25rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <li><code>GEMINI_API_KEY=sua_chave</code> (Google AI Studio)</li>
                      <li><code>SUPABASE_URL=seu_link</code></li>
                      <li><code>SUPABASE_KEY=sua_service_role_key</code></li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ESTADO NÃO CONFIGURADO */}
      {!config.isConfigured && !showSettings && eventos.length === 0 && locais.length === 0 && (
        <div className="empty-state" style={{ padding: '6rem 2rem' }}>
          <span className="empty-icon">📡</span>
          <h2 className="empty-title">Banco de Dados não Configurado</h2>
          <p className="empty-desc" style={{ marginBottom: '2rem' }}>
            Para que o radar funcione, você precisa vincular sua instância do Supabase.
          </p>
          <button className="btn btn-primary" onClick={() => setShowSettings(true)}>
            Configurar Supabase Agora
          </button>
        </div>
      )}

      {/* MODAL DETALHE DE LOCAL */}
      {selectedLocal && (
        <div className="modal-overlay" onClick={() => setSelectedLocal(null)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setSelectedLocal(null)}>✕</button>
            <div className="modal-hero">
              <img 
                src={selectedLocal.imagem_hero_path || 'https://placehold.co/600x400/222222/FFF?text=Base+Geek'} 
                alt={selectedLocal.nome} 
                className="modal-hero-img"
              />
              <div className="modal-hero-overlay">
                <h2 className="modal-title">{selectedLocal.nome}</h2>
              </div>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.92rem', color: 'var(--text-main)', lineHeight: '1.5', marginBottom: '1.5rem', background: 'var(--bg-tertiary)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                {selectedLocal.descricao || 'Sem descrição cadastrada.'}
              </p>
              <div className="modal-info-grid">
                <div className="modal-info-item">
                  <span className="info-label">Distância Estimada</span>
                  <span className="info-val">🧭 {selectedLocal.distancia_mooca} min (Saindo da Mooca)</span>
                </div>
                <div className="modal-info-item">
                  <span className="info-label">Restrições Alimentares</span>
                  <span className="info-val" style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                    {selectedLocal.tags_consumo?.map((tag, idx) => (
                      <span key={idx} className="tag-badge tag-badge-accent">{tag}</span>
                    )) || 'Não especificado'}
                  </span>
                </div>
              </div>

              <h3 className="modal-section-title">🗓️ Eventos Agendados Aqui</h3>
              {eventosDoLocalSelecionado.length > 0 ? (
                <div className="modal-events-list">
                  {eventosDoLocalSelecionado.map(ev => (
                    <div key={ev.id} className="modal-event-item">
                      <div>
                        <div className="modal-event-title">{ev.titulo}</div>
                        <div className="modal-event-date">📅 {formatarData(ev.data_hora)}</div>
                      </div>
                      <span className={`score-badge ${getScoreClass(ev.ia_score_cilada)}`} style={{ position: 'relative', top: '0', right: '0' }}>
                        IA: {ev.ia_score_cilada}/10
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic', textAlign: 'center', padding: '2rem 0' }}>
                  Nenhum evento agendado neste local no momento.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* OVERLAY DE CONFIGURAÇÕES */}
      {showSettings && (
        <div className="settings-overlay">
          <form className="settings-box" onSubmit={handleSaveSettings}>
            {config.isConfigured && (
              <button 
                type="button" 
                className="modal-close-btn" 
                onClick={() => setShowSettings(false)}
              >
                ✕
              </button>
            )}
            <h2 className="settings-title">Vincular Supabase</h2>
            <p className="settings-desc">
              Insira a URL e a Anon Key do seu projeto Supabase. Os dados serão salvos localmente e de forma segura no seu navegador para podermos testar.
            </p>
            
            <div className="form-group">
              <label className="form-label">Supabase Project URL</label>
              <input 
                type="url" 
                className="form-input" 
                placeholder="https://sua-id.supabase.co" 
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Supabase Anon Key</label>
              <input 
                type="password" 
                className="form-input" 
                placeholder="eyJhbGciOi..." 
                value={inputAnonKey}
                onChange={(e) => setInputAnonKey(e.target.value)}
                required
              />
            </div>

            <div className="settings-footer">
              <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                💾 Conectar e Sincronizar
              </button>
              {config.isConfigured && (
                <button 
                  type="button" 
                  className="btn btn-danger" 
                  onClick={handleClearSettings} 
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  🗑️ Desconectar Banco
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
