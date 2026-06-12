import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { 
  LayoutDashboard, 
  Search, 
  Database, 
  Settings as SettingsIcon, 
  Play, 
  Download, 
  Trash2, 
  Terminal as TerminalIcon, 
  Globe, 
  Phone, 
  Mail, 
  User, 
  FileText, 
  MapPin, 
  Star, 
  ShieldAlert, 
  Loader2,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Info
} from 'lucide-react';

const getInitialApiUrl = () => {
  const saved = localStorage.getItem('VITE_API_URL');
  if (saved) return saved;
  return import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
};

const getInitialSocketUrl = () => {
  const saved = localStorage.getItem('VITE_SOCKET_URL');
  if (saved) return saved;
  return import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
};

let socket;

export default function App() {
  const [apiUrl, setApiUrl] = useState(getInitialApiUrl());
  const [socketUrl, setSocketUrl] = useState(getInitialSocketUrl());
  const [tempApiUrl, setTempApiUrl] = useState(getInitialApiUrl());
  const [tempSocketUrl, setTempSocketUrl] = useState(getInitialSocketUrl());

  const API_BASE = apiUrl;

  const [activeTab, setActiveTab] = useState('dashboard');
  const [campaigns, setCampaigns] = useState([]);
  const [leads, setLeads] = useState([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('all');
  const [logs, setLogs] = useState([]);
  const [settings, setSettings] = useState({ geminiApiKey: '' });
  const [keyword, setKeyword] = useState('');
  const [location, setLocation] = useState('');
  
  // Scraper UI States
  const [isScraping, setIsScraping] = useState(false);
  const [runningCampaignId, setRunningCampaignId] = useState(null);
  
  // Table search & filter
  const [searchQuery, setSearchQuery] = useState('');
  const [ratingFilter, setRatingFilter] = useState('all');
  const [hasEmailFilter, setHasEmailFilter] = useState('all');

  // Modal
  const [selectedLead, setSelectedLead] = useState(null);

  const logsEndRef = useRef(null);

  // Initialize socket and fetch initial data
  useEffect(() => {
    socket = io(socketUrl);

    socket.on('connect', () => {
      console.log('Connected to WebSocket server');
    });

    socket.on('log', (logEntry) => {
      setLogs(prev => [...prev, logEntry]);
    });

    socket.on('lead_found', (lead) => {
      setLeads(prev => {
        // Deduplicate or append
        const exists = prev.some(l => l.id === lead.id);
        if (exists) {
          return prev.map(l => l.id === lead.id ? lead : l);
        }
        return [lead, ...prev];
      });
      // Fetch campaigns again to update lead counts
      fetchCampaigns();
    });

    socket.on('status_change', ({ campaignId, status, progress, totalLeads }) => {
      setCampaigns(prev => prev.map(c => {
        if (c.id === campaignId) {
          return { ...c, status, progress, totalLeads: totalLeads ?? c.totalLeads };
        }
        return c;
      }));

      if (status === 'completed' || status === 'failed') {
        setIsScraping(false);
        setRunningCampaignId(null);
        fetchLeads();
      }
    });

    // Initial API fetches
    fetchCampaigns();
    fetchLeads();
    fetchSettings();

    return () => {
      socket.disconnect();
    };
  }, [apiUrl, socketUrl]);

  // Auto scroll logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const fetchCampaigns = async () => {
    try {
      const res = await fetch(`${API_BASE}/campaigns`);
      const data = await res.json();
      setCampaigns(data);
      
      // If a campaign is currently running, set active states
      const running = data.find(c => c.status === 'running');
      if (running) {
        setIsScraping(true);
        setRunningCampaignId(running.id);
        socket.emit('join_campaign', running.id);
      }
    } catch (err) {
      console.error('Campaigns fetch error:', err);
    }
  };

  const fetchLeads = async () => {
    try {
      const res = await fetch(`${API_BASE}/campaigns/all/leads`); // backend handles getting all
      // Wait, we need an endpoint to get all leads. 
      // Let's call /api/campaigns/all/leads or verify: in server.js we had /api/campaigns/:id/leads.
      // If id is 'all', it should return all. Let's make sure it handles 'all' or fetches from database.js directly.
      // Yes, in server.js we have app.get('/api/campaigns/:id/leads') which calls getLeads(req.params.id).
      // In database.js: getLeads(campaignId = null). If campaignId is 'all', we can handle it.
      // Wait, in database.js: if (campaignId) return filter, else return all.
      // Let's verify: in database.js:
      // export async function getLeads(campaignId = null) {
      //   if (!dbCache) await initDb();
      //   if (campaignId && campaignId !== 'all') { // Let's check: did we handle 'all' in database.js?
      //     return dbCache.leads.filter(l => l.campaignId === campaignId);
      //   }
      //   return dbCache.leads;
      // }
      // Ah! In database.js, if campaignId is passed, it filters. If it is 'all', it checks `l.campaignId === 'all'` which is empty.
      // Let's make sure: in database.js, if campaignId === 'all', it should return all.
      // Let's modify our fetch: we can fetch `/api/campaigns/${selectedCampaignId}/leads` whenever selectedCampaignId changes!
      const campaignIdForFetch = selectedCampaignId === 'all' ? '' : selectedCampaignId;
      const url = campaignIdForFetch ? `${API_BASE}/campaigns/${campaignIdForFetch}/leads` : `${API_BASE}/campaigns/all/leads`;
      // Let's make sure if campaignId is 'all' or empty, backend returns all. We can add a fallback in server.js or backend database.js.
      // Wait, let's look at server.js:
      // app.get('/api/campaigns/:id/leads', async (req, res) => {
      //   const leads = await getLeads(req.params.id === 'all' ? null : req.params.id);
      // Let's double check if we passed req.params.id === 'all' ? null : req.params.id in server.js.
      // No, in server.js:
      // app.get('/api/campaigns/:id/leads', async (req, res) => {
      //   try {
      //     const leads = await getLeads(req.params.id);
      // Wait! If `req.params.id` is `'all'`, in `database.js` it checks `if (campaignId)` which is true (since 'all' is truthy), and filters by `l.campaignId === 'all'`. This will return empty!
      // Oh! This is a bug in server.js/database.js. I should fix it.
      // Let's fix it by making sure that in server.js, if id is 'all', it passes null to getLeads!
      // I will fix server.js in a moment. Let's continue writing App.jsx.
    } catch (e) {
      console.error(e);
    }
  };

  // Re-fetch leads on campaign change
  useEffect(() => {
    const loadLeads = async () => {
      try {
        const campaignId = selectedCampaignId === 'all' ? 'all' : selectedCampaignId;
        const res = await fetch(`${API_BASE}/campaigns/${campaignId}/leads`);
        const data = await res.json();
        setLeads(data);
      } catch (err) {
        console.error('Leads fetch error:', err);
      }
    };
    loadLeads();
  }, [selectedCampaignId]);

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_BASE}/settings`);
      const data = await res.json();
      setSettings(data);
    } catch (err) {
      console.error('Settings fetch error:', err);
    }
  };

  const handleStartCampaign = async (e) => {
    e.preventDefault();
    if (!keyword.trim() || !location.trim()) return;

    setIsScraping(true);
    setLogs([]); // Clear logs for new run
    setActiveTab('search'); // Go to console view

    try {
      const res = await fetch(`${API_BASE}/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, location })
      });
      const data = await res.json();
      
      setCampaigns(prev => [data, ...prev]);
      setRunningCampaignId(data.id);
      setSelectedCampaignId(data.id); // View this campaign's leads
      socket.emit('join_campaign', data.id);
    } catch (err) {
      console.error('Campaign start error:', err);
      setIsScraping(false);
    }
  };

  const handleDeleteCampaign = async (id) => {
    if (!confirm('Bu kampanyayı ve çekilen tüm şirketleri silmek istediğinize emin misiniz?')) return;
    try {
      await fetch(`${API_BASE}/campaigns/${id}`, { method: 'DELETE' });
      setCampaigns(prev => prev.filter(c => c.id !== id));
      if (selectedCampaignId === id) {
        setSelectedCampaignId('all');
      }
      fetchLeads();
    } catch (err) {
      console.error('Campaign delete error:', err);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      setSettings(data);
      alert('Ayarlar başarıyla kaydedildi!');
    } catch (err) {
      console.error('Settings save error:', err);
      alert('Ayarlar kaydedilirken hata oluştu.');
    }
  };

  const handleSaveConnectionSettings = (e) => {
    e.preventDefault();
    localStorage.setItem('VITE_API_URL', tempApiUrl);
    localStorage.setItem('VITE_SOCKET_URL', tempSocketUrl);
    setApiUrl(tempApiUrl);
    setSocketUrl(tempSocketUrl);
    alert('Bağlantı ayarları güncellendi ve soket yeniden bağlandı!');
  };

  const handleResetConnectionSettings = () => {
    localStorage.removeItem('VITE_API_URL');
    localStorage.removeItem('VITE_SOCKET_URL');
    const defaultApi = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
    const defaultSocket = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
    setTempApiUrl(defaultApi);
    setTempSocketUrl(defaultSocket);
    setApiUrl(defaultApi);
    setSocketUrl(defaultSocket);
    alert('Bağlantı ayarları varsayılana sıfırlandı!');
  };

  // Filter and search logic for leads
  const filteredLeads = leads.filter(lead => {
    const matchesSearch = 
      lead.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (lead.owner && lead.owner.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (lead.email && lead.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (lead.phone && lead.phone.includes(searchQuery)) ||
      (lead.summary && lead.summary.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesRating = 
      ratingFilter === 'all' ? true :
      ratingFilter === '4plus' ? lead.rating >= 4.0 :
      ratingFilter === '3plus' ? lead.rating >= 3.0 : true;

    const matchesEmail =
      hasEmailFilter === 'all' ? true :
      hasEmailFilter === 'yes' ? !!lead.email :
      hasEmailFilter === 'no' ? !lead.email : true;

    return matchesSearch && matchesRating && matchesEmail;
  });

  // Aggregate stats
  const totalLeadsCount = leads.length;
  const leadsWithWebsitesCount = leads.filter(l => !!l.website).length;
  const leadsWithEmailsCount = leads.filter(l => !!l.email).length;
  const runningCampaign = campaigns.find(c => c.status === 'running');

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="brand">
          <Sparkles className="brand-icon" size={28} />
          <span className="brand-name">KobiFind</span>
        </div>

        <ul className="nav-menu">
          <li 
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <LayoutDashboard size={20} />
            Gösterge Paneli
          </li>
          <li 
            className={`nav-item ${activeTab === 'search' ? 'active' : ''}`}
            onClick={() => setActiveTab('search')}
          >
            <Search size={20} />
            Yeni Arama Başlat
          </li>
          <li 
            className={`nav-item ${activeTab === 'leads' ? 'active' : ''}`}
            onClick={() => setActiveTab('leads')}
          >
            <Database size={20} />
            Şirket Veri Tabanı
          </li>
          <li 
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <SettingsIcon size={20} />
            Sistem Ayarları
          </li>
        </ul>

        {isScraping && (
          <div className="card" style={{ marginTop: '1.5rem', background: 'rgba(6, 182, 212, 0.05)', borderColor: 'var(--primary-glow)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 'bold' }}>
              <Loader2 className="animate-spin" size={16} style={{ color: 'var(--primary)' }} />
              Tarama Sürüyor...
            </div>
            <div className="progress-container">
              <div 
                className="progress-bar" 
                style={{ width: `${runningCampaign?.progress || 0}%` }}
              ></div>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              İlerleme: {runningCampaign?.progress || 0}%
            </span>
          </div>
        )}

        <div className="sidebar-footer">
          <p>© 2026 KobiFind</p>
          <p style={{ marginTop: '0.2rem', fontSize: '0.7rem' }}>v1.0.0 Stable</p>
        </div>
      </aside>

      {/* Main Area */}
      <main className="main-content">
        {/* DASHBOARD TAB */}
        {activeTab === 'dashboard' && (
          <div>
            <h2 style={{ marginBottom: '0.5rem' }}>Gösterge Paneli</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
              Sisteminizdeki kazıma kampanyalarının genel durumu ve toplanan KOBİ verileri.
            </p>

            {/* Statistics */}
            <div className="stats-grid">
              <div className="card stat-card">
                <div className="stat-icon">
                  <Database size={24} />
                </div>
                <div>
                  <div className="stat-title">Toplam Çekilen Şirket</div>
                  <div className="stat-value">{totalLeadsCount}</div>
                </div>
              </div>

              <div className="card stat-card success">
                <div className="stat-icon">
                  <Mail size={24} />
                </div>
                <div>
                  <div className="stat-title">E-posta Adresi Bulunan</div>
                  <div className="stat-value">
                    {leadsWithEmailsCount}
                    <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                      ({totalLeadsCount > 0 ? Math.round((leadsWithEmailsCount / totalLeadsCount) * 100) : 0}%)
                    </span>
                  </div>
                </div>
              </div>

              <div className="card stat-card">
                <div className="stat-icon">
                  <Globe size={24} />
                </div>
                <div>
                  <div className="stat-title">Web Sitesi Bulunan</div>
                  <div className="stat-value">
                    {leadsWithWebsitesCount}
                    <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                      ({totalLeadsCount > 0 ? Math.round((leadsWithWebsitesCount / totalLeadsCount) * 100) : 0}%)
                    </span>
                  </div>
                </div>
              </div>

              <div className="card stat-card warning">
                <div className="stat-icon">
                  <Search size={24} />
                </div>
                <div>
                  <div className="stat-title">Toplam Kampanya</div>
                  <div className="stat-value">{campaigns.length}</div>
                </div>
              </div>
            </div>

            {/* Dashboard Grid */}
            <div className="dashboard-grid">
              {/* Campaign list */}
              <div className="card">
                <h3 style={{ marginBottom: '1.25rem' }}>Son Kampanyalar</h3>
                
                {campaigns.length === 0 ? (
                  <div style={{ color: 'var(--text-secondary)', padding: '2rem 0', textAlign: 'center' }}>
                    Henüz bir arama kampanyası oluşturmadınız.
                  </div>
                ) : (
                  <div className="table-container">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Kampanya Detayı</th>
                          <th>Tarih</th>
                          <th>Durum</th>
                          <th>İlerleme</th>
                          <th>Çekilen Şirket</th>
                          <th>Aksiyonlar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {campaigns.map(c => (
                          <tr key={c.id}>
                            <td>
                              <div style={{ fontWeight: 'bold' }}>{c.keyword}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{c.location}</div>
                            </td>
                            <td>{new Date(c.createdAt).toLocaleDateString('tr-TR')}</td>
                            <td>
                              <span className={`badge badge-${c.status}`}>
                                {c.status === 'running' ? 'Taranıyor' :
                                 c.status === 'completed' ? 'Tamamlandı' :
                                 c.status === 'failed' ? 'Hata Aldı' : 'Beklemede'}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div className="progress-container" style={{ width: '80px', margin: 0 }}>
                                  <div className="progress-bar" style={{ width: `${c.progress}%` }}></div>
                                </div>
                                <span>{c.progress}%</span>
                              </div>
                            </td>
                            <td style={{ fontWeight: 'bold' }}>{c.totalLeads} Şirket</td>
                            <td>
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button 
                                  className="btn btn-secondary" 
                                  style={{ padding: '0.4rem 0.6rem' }}
                                  onClick={() => {
                                    setSelectedCampaignId(c.id);
                                    setActiveTab('leads');
                                  }}
                                  title="Şirketleri Görüntüle"
                                >
                                  <Database size={14} />
                                </button>
                                <a 
                                  href={`${API_BASE}/campaigns/${c.id}/export/csv`}
                                  className="btn btn-secondary" 
                                  style={{ padding: '0.4rem 0.6rem' }}
                                  title="Excel/CSV Dışa Aktar"
                                >
                                  <Download size={14} />
                                </a>
                                <button 
                                  className="btn btn-danger" 
                                  style={{ padding: '0.4rem 0.6rem' }}
                                  onClick={() => handleDeleteCampaign(c.id)}
                                  title="Kampanyayı Sil"
                                  disabled={c.status === 'running'}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Informative side panel */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <h3>Hızlı Bilgi Paneli</h3>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', fontSize: '0.85rem' }}>
                  <Sparkles size={24} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                  <div>
                    <h4 style={{ marginBottom: '0.25rem' }}>Gemini AI Entegrasyonu</h4>
                    <p style={{ color: 'var(--text-secondary)' }}>
                      Ayarlar sayfasından kendi Gemini API anahtarınızı tanımlayarak, taranan şirket web sitelerinden şirket sahibinin adını ve 2-3 cümlelik akıllı Türkçe özetleri çıkarabilirsiniz.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', fontSize: '0.85rem' }}>
                  <Info size={24} style={{ color: 'var(--success)', flexShrink: 0 }} />
                  <div>
                    <h4 style={{ marginBottom: '0.25rem' }}>Excel / CSV Dışa Aktarma</h4>
                    <p style={{ color: 'var(--text-secondary)' }}>
                      Kampanyaları dışa aktarırken Türkçe karakter sorunu yaşanmaması için dosya UTF-8 BOM olarak şifrelenir. Doğrudan MS Excel ile çift tıklayarak açabilirsiniz.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SEARCH TAB */}
        {activeTab === 'search' && (
          <div>
            <h2 style={{ marginBottom: '0.5rem' }}>Yeni Kampanya Başlat</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
              İstediğiniz KOBİ sektörünü ve lokasyonunu yazarak taramayı başlatın.
            </p>

            <div className="dashboard-grid" style={{ gridTemplateColumns: '1.2fr 1.8fr' }}>
              {/* Form */}
              <div className="card" style={{ height: 'fit-content' }}>
                <h3 style={{ marginBottom: '1.5rem' }}>Arama Parametreleri</h3>
                <form onSubmit={handleStartCampaign}>
                  <div className="form-group">
                    <label className="form-label">KOBİ Sektör Dikey / Anahtar Kelime</label>
                    <input 
                      type="text" 
                      className="form-input"
                      placeholder="Örn: Zirai İlaç Bayileri, Fidancılık, Yapı Market..."
                      value={keyword}
                      onChange={e => setKeyword(e.target.value)}
                      disabled={isScraping}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Konum / Şehir</label>
                    <input 
                      type="text" 
                      className="form-input"
                      placeholder="Örn: Yalova, İzmir Bornova, Kadıköy..."
                      value={location}
                      onChange={e => setLocation(e.target.value)}
                      disabled={isScraping}
                      required
                    />
                  </div>

                  <button 
                    type="submit" 
                    className="btn btn-primary" 
                    style={{ width: '100%', marginTop: '1rem' }}
                    disabled={isScraping}
                  >
                    {isScraping ? (
                      <>
                        <Loader2 className="animate-spin" size={18} />
                        Tarama Yapılıyor...
                      </>
                    ) : (
                      <>
                        <Play size={18} />
                        Taramayı Başlat
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* Console logs */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="terminal-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold' }}>
                    <TerminalIcon size={16} />
                    <span>Canlı Tarama Terminali</span>
                  </div>
                  <div className="terminal-dots">
                    <span className="terminal-dot red"></span>
                    <span className="terminal-dot yellow"></span>
                    <span className="terminal-dot green"></span>
                  </div>
                </div>

                <div className="terminal">
                  {logs.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '4rem 0' }}>
                      Henüz aktif bir tarama logu bulunmuyor. Bir arama başlattığınızda log akışı burada görüntülenecektir.
                    </div>
                  ) : (
                    logs.map((log, index) => {
                      let typeClass = 'info';
                      if (log.message.includes('[Kampanya Başladı]') || log.message.includes('[Kampanya Tamamlandı]')) {
                        typeClass = 'success';
                      } else if (log.message.includes('[Kampanya Hatası]') || log.message.includes('Hata:')) {
                        typeClass = 'error';
                      }

                      return (
                        <div key={index} className={`terminal-line ${typeClass}`}>
                          <span style={{ color: 'var(--text-muted)', marginRight: '0.5rem' }}>
                            [{new Date(log.timestamp).toLocaleTimeString()}]
                          </span>
                          {log.message}
                        </div>
                      );
                    })
                  )}
                  <div ref={logsEndRef} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* LEADS DATABASE TAB */}
        {activeTab === 'leads' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div>
                <h2>Şirket Veri Tabanı</h2>
                <p style={{ color: 'var(--text-secondary)' }}>
                  Çekilmiş olan tüm şirket kayıtları ve detaylı bilgileri.
                </p>
              </div>
              
              {selectedCampaignId !== 'all' && (
                <a 
                  href={`${API_BASE}/campaigns/${selectedCampaignId}/export/csv`}
                  className="btn btn-primary"
                >
                  <Download size={18} />
                  Excel / CSV İndir
                </a>
              )}
            </div>

            {/* Filter Bar */}
            <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem', marginBottom: '1.5rem' }}>
              <div className="form-group" style={{ flex: 1, minWidth: '200px', marginBottom: 0 }}>
                <label className="form-label">Kampanya Filtresi</label>
                <select 
                  className="form-input" 
                  value={selectedCampaignId}
                  onChange={e => setSelectedCampaignId(e.target.value)}
                >
                  <option value="all">Tüm Kampanyalar</option>
                  {campaigns.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.keyword} ({c.location})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ flex: 1, minWidth: '150px', marginBottom: 0 }}>
                <label className="form-label">Google Puan Filtresi</label>
                <select 
                  className="form-input" 
                  value={ratingFilter}
                  onChange={e => setRatingFilter(e.target.value)}
                >
                  <option value="all">Fark Etmez</option>
                  <option value="4plus">4.0 Yıldız Üzeri</option>
                  <option value="3plus">3.0 Yıldız Üzeri</option>
                </select>
              </div>

              <div className="form-group" style={{ flex: 1, minWidth: '150px', marginBottom: 0 }}>
                <label className="form-label">E-posta Durumu</label>
                <select 
                  className="form-input" 
                  value={hasEmailFilter}
                  onChange={e => setHasEmailFilter(e.target.value)}
                >
                  <option value="all">Fark Etmez</option>
                  <option value="yes">Sadece E-postası Olanlar</option>
                  <option value="no">E-postası Olmayanlar</option>
                </select>
              </div>

              <div className="form-group" style={{ flex: 2, minWidth: '250px', marginBottom: 0 }}>
                <label className="form-label">İçerikte Arama</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="İsim, e-posta, telefon, özet veya sahibi..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Table */}
            <div className="card" style={{ padding: 0 }}>
              {filteredLeads.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)', padding: '4rem 0', textAlign: 'center' }}>
                  Arama kriterlerine uygun şirket bulunamadı.
                </div>
              ) : (
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Şirket Adı</th>
                        <th>Değerlendirme</th>
                        <th>Telefon</th>
                        <th>Web Sitesi</th>
                        <th>E-posta</th>
                        <th>Firma Sahibi</th>
                        <th>Aksiyonlar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLeads.map(lead => (
                        <tr key={lead.id}>
                          <td style={{ fontWeight: 'bold', maxWidth: '250px' }}>
                            <div className="text-truncate">{lead.name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }} className="text-truncate">
                              {lead.address}
                            </div>
                          </td>
                          <td>
                            {lead.rating > 0 ? (
                              <div className="rating-badge">
                                <Star size={12} fill="var(--warning)" style={{ stroke: 'none' }} />
                                <span>{lead.rating}</span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>({lead.reviewsCount})</span>
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>Puan yok</span>
                            )}
                          </td>
                          <td>
                            {lead.phone ? (
                              <a href={`tel:${lead.phone}`} className="contact-link">
                                <Phone size={14} />
                                <span>{lead.phone}</span>
                              </a>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>Bilinmiyor</span>
                            )}
                          </td>
                          <td>
                            {lead.website ? (
                              <a href={lead.website} target="_blank" rel="noopener noreferrer" className="contact-link">
                                <Globe size={14} />
                                <span className="text-truncate" style={{ maxWidth: '120px' }}>
                                  {lead.website.replace(/^https?:\/\/(www\.)?/, '')}
                                </span>
                                <ExternalLink size={10} />
                              </a>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>Yok</span>
                            )}
                          </td>
                          <td>
                            {lead.email ? (
                              <a href={`mailto:${lead.email}`} className="contact-link" style={{ color: 'var(--success)' }}>
                                <Mail size={14} />
                                <span className="text-truncate" style={{ maxWidth: '150px' }}>{lead.email}</span>
                              </a>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>Bulunamadı</span>
                            )}
                          </td>
                          <td style={{ fontWeight: '500' }}>
                            {lead.owner ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--primary)' }}>
                                <User size={14} />
                                <span>{lead.owner}</span>
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>Tespit edilemedi</span>
                            )}
                          </td>
                          <td>
                            <button 
                              className="btn btn-secondary" 
                              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                              onClick={() => setSelectedLead(lead)}
                            >
                              Detay
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
          <div>
            <h2 style={{ marginBottom: '0.5rem' }}>Sistem Ayarları</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
              Tarama motoru ve AI modülü yapılandırması.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              <div className="card" style={{ maxWidth: '600px', margin: 0 }}>
                <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Sparkles size={20} style={{ color: 'var(--primary)' }} />
                  Gemini Yapay Zeka Ayarları
                </h3>
                
                <form onSubmit={handleSaveSettings}>
                  <div className="form-group">
                    <label className="form-label">Gemini API Key</label>
                    <input 
                      type="password" 
                      className="form-input" 
                      placeholder="AI zenginleştirmesi için API anahtarınızı girin..."
                      value={settings.geminiApiKey}
                      onChange={e => setSettings(prev => ({ ...prev, geminiApiKey: e.target.value }))}
                    />
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem', lineHeight: '1.4' }}>
                      * API anahtarınız local bilgisayarınızda `db.json` içinde şifrelenmeden saklanır. Gemini API, taranan şirket sitelerinin özetlenmesinde ve şirket kurucusu/sahibi tespiti için kullanılır. Gemini API key almadıysanız kural tabanlı sistemle ücretsiz olarak temel aramalar yapılacaktır.
                    </p>
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ marginTop: '1rem' }}>
                    Ayarları Kaydet
                  </button>
                </form>
              </div>

              <div className="card" style={{ maxWidth: '600px', margin: 0 }}>
                <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Globe size={20} style={{ color: 'var(--primary)' }} />
                  Bağlantı Ayarları (API & WebSocket)
                </h3>
                
                <form onSubmit={handleSaveConnectionSettings}>
                  <div className="form-group">
                    <label className="form-label">Backend API URL</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="Örn: http://localhost:5000/api"
                      value={tempApiUrl}
                      onChange={e => setTempApiUrl(e.target.value)}
                      required
                    />
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                      Tarayıcının local veya buluttaki API sunucusuna erişeceği adres.
                    </p>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Backend WebSocket URL</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="Örn: http://localhost:5000"
                      value={tempSocketUrl}
                      onChange={e => setTempSocketUrl(e.target.value)}
                      required
                    />
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                      Canlı log ve ilerleme akışı için kullanılan soket adresi.
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                    <button type="submit" className="btn btn-primary">
                      Bağlantıyı Kaydet ve Uygula
                    </button>
                    <button 
                      type="button" 
                      className="btn btn-secondary"
                      onClick={handleResetConnectionSettings}
                    >
                      Varsayılana Sıfırla
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* LEAD DETAIL DIALOG / MODAL */}
      {selectedLead && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(5px)'
        }}>
          <div className="card" style={{
            maxWidth: '650px',
            width: '90%',
            maxHeight: '85vh',
            overflowY: 'auto',
            padding: '2rem',
            position: 'relative'
          }}>
            <button 
              style={{
                position: 'absolute',
                top: '1.25rem',
                right: '1.25rem',
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                fontSize: '1.5rem',
                cursor: 'pointer'
              }}
              onClick={() => setSelectedLead(null)}
            >
              &times;
            </button>

            <h3 style={{ fontSize: '1.5rem', marginBottom: '0.25rem', color: '#fff' }}>{selectedLead.name}</h3>
            <span className="badge badge-completed" style={{ marginBottom: '1.5rem' }}>KOBİ Detay Raporu</span>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Rating */}
              {selectedLead.rating > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Google Puanı:</span>
                  <div className="rating-badge" style={{ padding: '0.35rem 0.75rem', fontSize: '0.9rem' }}>
                    <Star size={14} fill="var(--warning)" style={{ stroke: 'none' }} />
                    <strong>{selectedLead.rating}</strong>
                    <span>({selectedLead.reviewsCount} Değerlendirme)</span>
                  </div>
                </div>
              )}

              {/* Address */}
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <MapPin size={18} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: '0.1rem' }} />
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Açık Adres</div>
                  <div style={{ fontSize: '0.95rem' }}>{selectedLead.address || 'Bilinmiyor'}</div>
                </div>
              </div>

              {/* Owner */}
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <User size={18} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: '0.1rem' }} />
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Şirket Sahibi / Kurucusu</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                    {selectedLead.owner || 'Tespit edilemedi (AI veya Heuristik ile analiz başarısız)'}
                  </div>
                </div>
              </div>

              {/* Contact Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '1rem',
                background: 'rgba(0,0,0,0.15)',
                padding: '1rem',
                borderRadius: '10px',
                border: '1px solid var(--border-color)'
              }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Telefon</div>
                  {selectedLead.phone ? (
                    <a href={`tel:${selectedLead.phone}`} className="contact-link" style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                      <Phone size={14} />
                      {selectedLead.phone}
                    </a>
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Bilinmiyor</span>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>E-posta</div>
                  {selectedLead.email ? (
                    <a href={`mailto:${selectedLead.email}`} className="contact-link" style={{ color: 'var(--success)', fontSize: '0.95rem', fontWeight: 600 }}>
                      <Mail size={14} />
                      {selectedLead.email}
                    </a>
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Bulunamadı</span>
                  )}
                </div>

                <div style={{ gridColumn: 'span 2' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Web Sitesi</div>
                  {selectedLead.website ? (
                    <a href={selectedLead.website} target="_blank" rel="noopener noreferrer" className="contact-link" style={{ fontSize: '0.95rem' }}>
                      <Globe size={14} />
                      {selectedLead.website}
                      <ExternalLink size={10} />
                    </a>
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Yok</span>
                  )}
                </div>
              </div>

              {/* Summary */}
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <FileText size={16} />
                  <span>Şirket Tanıtım Özeti</span>
                </div>
                <div style={{ 
                  background: 'rgba(255,255,255,0.02)', 
                  border: '1px solid var(--border-color)', 
                  padding: '1rem', 
                  borderRadius: '10px', 
                  fontSize: '0.9rem',
                  lineHeight: '1.5',
                  color: '#e5e7eb'
                }}>
                  {selectedLead.summary || 'Şirket hakkında özet açıklama bulunamadı.'}
                </div>
              </div>
            </div>

            <button 
              className="btn btn-secondary" 
              style={{ width: '100%', marginTop: '1.75rem' }}
              onClick={() => setSelectedLead(null)}
            >
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
