import { useEffect, useState, useCallback } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Bot,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock,
  Clock3,
  Copy,
  CreditCard,
  Download,
  Edit2,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  Gift,
  Globe,
  Headphones,
  HelpCircle,
  History,
  IndianRupee,
  Info,
  KeyRound,
  Layers,
  LayoutDashboard,
  LogIn,
  LogOut,
  Megaphone,
  Menu,
  MessageCircle,
  MessageSquare,
  MessageSquarePlus,
  MessagesSquare,
  Percent,
  Play,
  PlusCircle,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  Tag,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Upload,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  UserX,
  WalletCards,
  X
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// ─── Token storage helpers (memory + sessionStorage only — no localStorage) ───
const TOKEN_KEY = 'gs_shop_token';
function getToken() { return sessionStorage.getItem(TOKEN_KEY); }
function setToken(t) { if (t) sessionStorage.setItem(TOKEN_KEY, t); else sessionStorage.removeItem(TOKEN_KEY); }

// ─── Auth-aware fetch helper ──────────────────────────────────────────────────
async function request(path, options = {}, token = null) {
  const authToken = token || getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const response = await fetch(`${API}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function getDefaultScheduleValue() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const localDateTimeValue = getDefaultScheduleValue();

// Privacy protection: mask customer phone numbers in UI
function maskPhone(phone) {
  if (!phone) return '—';
  const clean = String(phone).trim();
  if (clean.length <= 4) return '••••';
  const match = clean.match(/^(\+\d{1,3})(\d+)$/);
  if (match) {
    const [, prefix, rest] = match;
    const lastDigits = rest.slice(-3);
    const maskedLen = Math.max(rest.length - 3, 3);
    return `${prefix} ${'•'.repeat(maskedLen)} ${lastDigits}`;
  }
  return clean.slice(0, 2) + '••••••' + clean.slice(-3);
}



export default function App() {
  // ── Auth State ──────────────────────────────────────────────
  const [authToken, setAuthToken] = useState(() => getToken());
  const [authOwner, setAuthOwner] = useState(null);
  const [authMode, setAuthMode] = useState('checking'); // 'checking' | 'setup' | 'login' | 'authenticated'
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [setupForm, setSetupForm] = useState({ username: '', password: '', displayName: 'Shop Owner' });

  // ── App State ────────────────────────────────────────────────
  const [customers, setCustomers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [messages, setMessages] = useState([]);
  const [autoReplies, setAutoReplies] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [tab, setTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Filter States for Customers
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerConsentFilter, setCustomerConsentFilter] = useState('all');
  const [customerSegmentFilter, setCustomerSegmentFilter] = useState('all');

  // Filter States for Campaigns
  const [campaignStatusFilter, setCampaignStatusFilter] = useState('all');

  // Filter States for Conversations
  const [conversationSearch, setConversationSearch] = useState('');
  const [handoverOnlyFilter, setHandoverOnlyFilter] = useState(false);

  // Modals States
  const [customerModal, setCustomerModal] = useState({ isOpen: false, mode: 'create', data: null });
  const [customerDetailsModal, setCustomerDetailsModal] = useState({ isOpen: false, customer: null });
  const [deleteCustomerModal, setDeleteCustomerModal] = useState({ isOpen: false, customer: null });
  const [csvImportModal, setCsvImportModal] = useState(false);
  const [campaignDetailsModal, setCampaignDetailsModal] = useState({ isOpen: false, campaign: null, logs: [] });
  const [autoReplyModal, setAutoReplyModal] = useState({ isOpen: false, mode: 'create', data: null });
  const [previewReplyModal, setPreviewReplyModal] = useState({ isOpen: false, rule: null });
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', onConfirm: null, confirmText: 'Confirm', isDanger: false });

  // Create Campaign Form State
  const [form, setForm] = useState({
    name: 'Festival Special Offers',
    description: 'Promotional broadcast for Alangulam customers with seasonal discounts',
    offerDetails: 'Up to 20% off',
    audience: 'all',
    templateName: 'gs_festival_offer',
    scheduledAt: localDateTimeValue
  });

  // ── Auth Bootstrap ────────────────────────────────────────────
  useEffect(() => {
    async function checkAuth() {
      try {
        const statusRes = await fetch(`${API}/api/auth/status`).then(r => r.json()).catch(() => ({ setupComplete: false }));
        if (!statusRes.setupComplete) {
          setAuthMode('setup');
          return;
        }
        const token = getToken();
        if (!token) {
          setAuthMode('login');
          return;
        }
        // Validate existing token
        try {
          const meRes = await request('/api/auth/me', {}, token);
          setAuthOwner(meRes.owner);
          setAuthToken(token);
          setAuthMode('authenticated');
        } catch {
          setToken(null);
          setAuthMode('login');
        }
      } catch {
        setAuthMode('login');
      }
    }
    checkAuth();
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const res = await request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: loginForm.username, password: loginForm.password })
      });
      setToken(res.token);
      setAuthToken(res.token);
      setAuthOwner(res.owner);
      setAuthMode('authenticated');
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSetup(e) {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const res = await request('/api/auth/setup', {
        method: 'POST',
        body: JSON.stringify(setupForm)
      });
      setToken(res.token);
      setAuthToken(res.token);
      setAuthOwner(res.owner);
      setAuthMode('authenticated');
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    try { await request('/api/auth/logout', { method: 'POST', body: '{}' }); } catch { /* ignore */ }
    setToken(null);
    setAuthToken(null);
    setAuthOwner(null);
    setAuthMode('login');
  }

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const [c, t, ca, mResp, ar, conv, an] = await Promise.all([
        request('/api/customers'),
        request('/api/templates'),
        request('/api/campaigns'),
        request('/api/messages').catch(() => ({ messages: [] })),
        request('/api/autoreplies').catch(() => []),
        request('/api/conversations').catch(() => []),
        request('/api/analytics').catch(() => null)
      ]);
      setCustomers(c);
      setTemplates(t);
      setCampaigns(ca);
      setMessages(Array.isArray(mResp) ? mResp : (mResp?.messages ?? []));
      setAutoReplies(ar);
      setConversations(conv);
      if (an) setAnalytics(an);
    } catch (e) {
      setError(`${e.message}. Ensure backend & MongoDB are running.`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authMode === 'authenticated') {
      refresh();
    }
  }, [authMode]);

  async function seedDemo() {
    setNotice('');
    setError('');
    try {
      const result = await request('/api/demo/seed', { method: 'POST', body: '{}' });
      setNotice(result.message);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  // --- Customer CRUD Handlers ---
  async function handleSaveCustomer(customerData, mode, id) {
    try {
      if (mode === 'create') {
        await request('/api/customers', {
          method: 'POST',
          body: JSON.stringify(customerData)
        });
        setNotice(`Customer "${customerData.name}" added successfully.`);
      } else {
        await request(`/api/customers/${id}`, {
          method: 'PUT',
          body: JSON.stringify(customerData)
        });
        setNotice(`Customer "${customerData.name}" updated successfully.`);
      }
      setCustomerModal({ isOpen: false, mode: 'create', data: null });
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDeleteCustomer(id) {
    try {
      const result = await request(`/api/customers/${id}`, { method: 'DELETE' });
      setNotice(result.message || 'Customer deleted successfully.');
      setDeleteCustomerModal({ isOpen: false, customer: null });
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleToggleConsent(customer, newStatus) {
    try {
      if (newStatus === 'opted_out') {
        await request(`/api/customers/${customer._id}/opt-out`, {
          method: 'POST',
          body: JSON.stringify({ reason: 'Manual opt-out by shop admin' })
        });
        setNotice(`Customer "${customer.name}" has been opted out.`);
      } else {
        await request(`/api/customers/${customer._id}/opt-in`, {
          method: 'POST',
          body: JSON.stringify({ source: 'Shop counter consent form' })
        });
        setNotice(`Customer "${customer.name}" consent recorded as opted-in.`);
      }
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleImportCustomers(records) {
    try {
      const result = await request('/api/customers/import', {
        method: 'POST',
        body: JSON.stringify({ customers: records })
      });
      setNotice(result.message);
      setCsvImportModal(false);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  // --- Campaign Handlers ---
  async function handleSaveCampaign(isSchedule = false) {
    setNotice('');
    setError('');
    try {
      const payload = {
        name: form.name,
        description: form.description,
        offerDetails: form.offerDetails,
        audience: form.audience,
        templateName: form.templateName,
        status: isSchedule ? 'scheduled' : 'draft',
        scheduledAt: isSchedule ? new Date(form.scheduledAt).toISOString() : null
      };

      const result = await request('/api/campaigns', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      setNotice(result.note || (isSchedule ? 'Campaign scheduled successfully.' : 'Campaign saved as draft.'));
      await refresh();
      setTab('campaigns');
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleCancelCampaign(id) {
    try {
      const result = await request(`/api/campaigns/${id}/cancel`, { method: 'POST', body: '{}' });
      setNotice(result.message || 'Campaign cancelled.');
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleRunDryRun(campaign) {
    setNotice('');
    setError('');
    try {
      const result = await request(`/api/campaigns/${campaign._id}/dry-run`, { method: 'POST', body: '{}' });
      setNotice(result.message);
      await refresh();
      setTab('messages');
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleOpenCampaignDetails(campaign) {
    try {
      const logs = await request(`/api/campaigns/${campaign._id}/messages`);
      setCampaignDetailsModal({ isOpen: true, campaign, logs });
    } catch (e) {
      setCampaignDetailsModal({ isOpen: true, campaign, logs: [] });
    }
  }

  // --- Auto-Reply Handlers ---
  async function handleSaveAutoReply(ruleData, mode, id) {
    try {
      if (mode === 'create') {
        await request('/api/autoreplies', {
          method: 'POST',
          body: JSON.stringify(ruleData)
        });
        setNotice(`Auto-reply rule for "${ruleData.keyword}" created.`);
      } else {
        await request(`/api/autoreplies/${id}`, {
          method: 'PUT',
          body: JSON.stringify(ruleData)
        });
        setNotice(`Auto-reply rule updated successfully.`);
      }
      setAutoReplyModal({ isOpen: false, mode: 'create', data: null });
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleToggleAutoReply(rule) {
    try {
      await request(`/api/autoreplies/${rule._id}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !rule.enabled })
      });
      setNotice(`Rule "${rule.keyword}" ${!rule.enabled ? 'enabled' : 'disabled'}.`);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDeleteAutoReply(id) {
    try {
      const result = await request(`/api/autoreplies/${id}`, { method: 'DELETE' });
      setNotice(result.message);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleResolveHandover(id) {
    try {
      const result = await request(`/api/conversations/${id}/resolve`, { method: 'POST', body: '{}' });
      setNotice(result.message);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  const pendingHandoversCount = conversations.filter((c) => c.handoverRequired && c.handoverStatus === 'pending').length;

  // Sidebar navigation configuration
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'customers', label: 'Customers', icon: Users, badge: customers.length },
    { id: 'campaigns', label: 'Campaigns', icon: Megaphone, badge: campaigns.length },
    { id: 'create', label: 'Create Campaign', icon: PlusCircle },
    { id: 'autoreplies', label: 'Auto Replies', icon: Bot, badge: autoReplies.length },
    { id: 'conversations', label: 'Conversations', icon: MessagesSquare, badge: pendingHandoversCount > 0 ? `${pendingHandoversCount}!` : conversations.length },
    { id: 'templates', label: 'Message Templates', icon: FileText },
    { id: 'messages', label: 'Broadcast Logs', icon: History },
    { id: 'reports', label: 'Reports & Analytics', icon: BarChart3 },
    { id: 'integration', label: 'WhatsApp API', icon: Smartphone },
    { id: 'subscription', label: 'SaaS Plan', icon: CreditCard },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  const currentNav = navItems.find((n) => n.id === tab) || navItems[0];

  // Early return: auth gates
  if (authMode === 'checking') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f8fafc' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, border: '3px solid #25D366', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: '#64748b', fontSize: 14 }}>Loading GS Shop Dashboard…</p>
        </div>
      </div>
    );
  }

  if (authMode === 'setup') {
    return <SetupView form={setupForm} setForm={setSetupForm} onSubmit={handleSetup} loading={authLoading} error={authError} />;
  }

  if (authMode === 'login') {
    return <LoginView form={loginForm} setForm={setLoginForm} onSubmit={handleLogin} loading={authLoading} error={authError} />;
  }

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="brand-wrapper">
            <div className="brand-badge">
              <Store size={22} />
            </div>
            <div className="brand-details">
              <h2>GS Shop</h2>
              <span>Alangulam Automation</span>
            </div>
            <button
              type="button"
              className="sidebar-close-btn"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
          </div>
          <div className="workspace-chip">
            <span>Branch</span>
            <b>Alangulam Main St.</b>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-category">Main Menu</div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = tab === item.id;
            return (
              <button
                key={item.id}
                className={`nav-link ${isActive ? 'active' : ''}`}
                onClick={() => {
                  setTab(item.id);
                  setSidebarOpen(false);
                }}
              >
                <Icon size={18} />
                <span>{item.label}</span>
                {item.badge !== undefined && (
                  <span className="nav-badge">{item.badge}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="safety-box">
            <ShieldCheck size={18} />
            <div>
              <b>Safe Demo Active</b>
              <small>DRY_RUN=true locked</small>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer Overlay Backdrop */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main Wrapper */}
      <div className="main-wrapper">
        {/* Topbar */}
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="menu-toggle"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              title="Toggle Menu"
            >
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div className="breadcrumbs">
              <span className="breadcrumbs-path">GS SHOP / MARKETING AUTOMATION</span>
              <h1>{currentNav.label}</h1>
            </div>
          </div>

          <div className="topbar-right">
            <div className="demo-status-pill">
              <span className="status-dot-pulse" />
              DRY RUN · NO LIVE CHARGES
            </div>

            <button
              className="action-icon-btn"
              onClick={refresh}
              title="Refresh Data"
              disabled={loading}
            >
              <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
            </button>

            <div className="user-profile">
              <div className="user-avatar">{authOwner?.displayName?.charAt(0)?.toUpperCase() || 'G'}</div>
              <div className="user-meta">
                <b>{authOwner?.displayName || 'GS Admin'}</b>
                <small>@{authOwner?.username || 'admin'}</small>
              </div>
            </div>
            <button
              className="action-icon-btn"
              onClick={handleLogout}
              title="Logout"
              style={{ color: '#ef4444' }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>

        {/* Content Page */}
        <main className="page-content">
          {notice && (
            <div className="alert-banner success">
              <CheckCircle2 size={18} />
              <span>{notice}</span>
              <button onClick={() => setNotice('')}>×</button>
            </div>
          )}

          {error && (
            <div className="alert-banner error">
              <AlertCircle size={18} />
              <span>{error}</span>
              <button onClick={() => setError('')}>×</button>
            </div>
          )}

          {tab === 'dashboard' && (
            <DashboardView
              customers={customers}
              campaigns={campaigns}
              messages={messages}
              conversations={conversations}
              autoReplies={autoReplies}
              analytics={analytics}
              onSeed={seedDemo}
              onCreate={() => setTab('create')}
              onRunDryRun={(c) => {
                setConfirmDialog({
                  isOpen: true,
                  title: 'Run Safe Dry-Run Simulation?',
                  message: `This will simulate sending the "${c.name}" campaign to eligible opted-in customers. No real WhatsApp messages will be sent and no charges will incur.`,
                  confirmText: 'Run Dry-Run',
                  isDanger: false,
                  onConfirm: () => handleRunDryRun(c)
                });
              }}
              onViewDetails={handleOpenCampaignDetails}
            />
          )}

          {tab === 'customers' && (
            <CustomersView
              customers={customers}
              search={customerSearch}
              setSearch={setCustomerSearch}
              consentFilter={customerConsentFilter}
              setConsentFilter={setCustomerConsentFilter}
              segmentFilter={customerSegmentFilter}
              setSegmentFilter={setCustomerSegmentFilter}
              onAddCustomer={() => setCustomerModal({ isOpen: true, mode: 'create', data: null })}
              onEditCustomer={(cust) => setCustomerModal({ isOpen: true, mode: 'edit', data: cust })}
              onDeleteCustomer={(cust) => setDeleteCustomerModal({ isOpen: true, customer: cust })}
              onViewDetails={(cust) => setCustomerDetailsModal({ isOpen: true, customer: cust })}
              onToggleConsent={handleToggleConsent}
              onOpenImport={() => setCsvImportModal(true)}
              onSeed={seedDemo}
            />
          )}

          {tab === 'campaigns' && (
            <CampaignsView
              campaigns={campaigns}
              statusFilter={campaignStatusFilter}
              setStatusFilter={setCampaignStatusFilter}
              onCreate={() => setTab('create')}
              onRunDryRun={(c) => {
                setConfirmDialog({
                  isOpen: true,
                  title: 'Run Safe Dry-Run Simulation?',
                  message: `This will simulate sending the "${c.name}" campaign to eligible opted-in customers. No real WhatsApp messages will be sent.`,
                  confirmText: 'Run Simulation',
                  isDanger: false,
                  onConfirm: () => handleRunDryRun(c)
                });
              }}
              onCancelCampaign={(c) => {
                setConfirmDialog({
                  isOpen: true,
                  title: 'Cancel Scheduled Campaign?',
                  message: `Are you sure you want to cancel "${c.name}"? It will not be executed.`,
                  confirmText: 'Yes, Cancel Campaign',
                  isDanger: true,
                  onConfirm: () => handleCancelCampaign(c._id)
                });
              }}
              onViewDetails={handleOpenCampaignDetails}
            />
          )}

          {tab === 'create' && (
            <CreateCampaignView
              form={form}
              setForm={setForm}
              templates={templates}
              analytics={analytics}
              loading={loading}
              onSaveDraft={() => handleSaveCampaign(false)}
              onSchedule={() => {
                setConfirmDialog({
                  isOpen: true,
                  title: 'Confirm Campaign Schedule',
                  message: `Schedule "${form.name}" for ${new Date(form.scheduledAt).toLocaleString()}? Only opted-in customers will receive the simulation.`,
                  confirmText: 'Confirm & Schedule',
                  isDanger: false,
                  onConfirm: () => handleSaveCampaign(true)
                });
              }}
            />
          )}

          {tab === 'autoreplies' && (
            <AutoRepliesView
              rules={autoReplies}
              pendingHandovers={pendingHandoversCount}
              onAddRule={() => setAutoReplyModal({ isOpen: true, mode: 'create', data: null })}
              onEditRule={(rule) => setAutoReplyModal({ isOpen: true, mode: 'edit', data: rule })}
              onToggleRule={handleToggleAutoReply}
              onDeleteRule={(rule) => {
                setConfirmDialog({
                  isOpen: true,
                  title: 'Delete Auto-Reply Rule?',
                  message: `Are you sure you want to delete the rule for "${rule.keyword}"?`,
                  confirmText: 'Delete Rule',
                  isDanger: true,
                  onConfirm: () => handleDeleteAutoReply(rule._id)
                });
              }}
              onPreviewRule={(rule) => setPreviewReplyModal({ isOpen: true, rule })}
            />
          )}

          {tab === 'conversations' && (
            <ConversationsView
              conversations={conversations}
              search={conversationSearch}
              setSearch={setConversationSearch}
              handoverOnly={handoverOnlyFilter}
              setHandoverOnly={setHandoverOnlyFilter}
              onResolveHandover={handleResolveHandover}
            />
          )}

          {tab === 'templates' && <TemplatesView templates={templates} />}

          {tab === 'messages' && <MessagesView messages={messages} />}

          {tab === 'reports' && (
            <ReportsView
              customers={customers}
              campaigns={campaigns}
              messages={messages}
              conversations={conversations}
              analytics={analytics}
            />
          )}

          {tab === 'settings' && <SettingsView authOwner={authOwner} onChangePassword={async (curr, newp) => {
              try {
                await request('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: curr, newPassword: newp }) });
                setNotice('Password changed successfully.');
              } catch (e) { setError(e.message); }
            }} />}

          {tab === 'integration' && <WhatsAppIntegrationView />}

          {tab === 'subscription' && <SubscriptionView />}
        </main>

        {/* Mobile Fixed Bottom Navigation Bar */}
        <nav className="mobile-bottom-nav" aria-label="Mobile Navigation">
          <button
            type="button"
            className={`mobile-nav-btn ${tab === 'dashboard' ? 'active' : ''}`}
            onClick={() => { setTab('dashboard'); setSidebarOpen(false); }}
          >
            <div className="mobile-nav-icon">
              <LayoutDashboard size={20} />
            </div>
            <span>Home</span>
          </button>
          <button
            type="button"
            className={`mobile-nav-btn ${tab === 'customers' ? 'active' : ''}`}
            onClick={() => { setTab('customers'); setSidebarOpen(false); }}
          >
            <div className="mobile-nav-icon">
              <Users size={20} />
              {customers.length > 0 && <span className="mobile-badge-dot">{customers.length}</span>}
            </div>
            <span>Customers</span>
          </button>
          <button
            type="button"
            className={`mobile-nav-btn ${tab === 'campaigns' || tab === 'create' ? 'active' : ''}`}
            onClick={() => { setTab('campaigns'); setSidebarOpen(false); }}
          >
            <div className="mobile-nav-icon">
              <Megaphone size={20} />
              {campaigns.length > 0 && <span className="mobile-badge-dot">{campaigns.length}</span>}
            </div>
            <span>Campaigns</span>
          </button>
          <button
            type="button"
            className={`mobile-nav-btn ${tab === 'autoreplies' || tab === 'conversations' ? 'active' : ''}`}
            onClick={() => { setTab('autoreplies'); setSidebarOpen(false); }}
          >
            <div className="mobile-nav-icon">
              <Bot size={20} />
              {pendingHandoversCount > 0 && <span className="mobile-badge-dot alert">!</span>}
            </div>
            <span>Replies</span>
          </button>
          <button
            type="button"
            className={`mobile-nav-btn ${['templates', 'messages', 'reports', 'settings'].includes(tab) || sidebarOpen ? 'active' : ''}`}
            onClick={() => setSidebarOpen(prev => !prev)}
            aria-label="Open full menu"
          >
            <div className="mobile-nav-icon">
              <Menu size={20} />
            </div>
            <span>Menu</span>
          </button>
        </nav>
      </div>

      {/* --- MODALS --- */}

      {/* 1. Add / Edit Customer Modal */}
      {customerModal.isOpen && (
        <CustomerFormModal
          mode={customerModal.mode}
          initialData={customerModal.data}
          onClose={() => setCustomerModal({ isOpen: false, mode: 'create', data: null })}
          onSave={handleSaveCustomer}
        />
      )}

      {/* 2. Customer Details Modal */}
      {customerDetailsModal.isOpen && customerDetailsModal.customer && (
        <CustomerDetailsModal
          customer={customerDetailsModal.customer}
          onClose={() => setCustomerDetailsModal({ isOpen: false, customer: null })}
          onToggleConsent={(newStatus) => {
            handleToggleConsent(customerDetailsModal.customer, newStatus);
            setCustomerDetailsModal({ isOpen: false, customer: null });
          }}
        />
      )}

      {/* 3. Delete Customer Confirmation Modal */}
      {deleteCustomerModal.isOpen && deleteCustomerModal.customer && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-dialog-header">
              <h3>Delete Customer</h3>
              <button onClick={() => setDeleteCustomerModal({ isOpen: false, customer: null })}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-dialog-body">
              <p>
                Are you sure you want to permanently delete customer <b>"{deleteCustomerModal.customer.name}"</b> (<code>{maskPhone(deleteCustomerModal.customer.phone)}</code>)?
              </p>
              <p style={{ color: '#64748b', fontSize: '12px', marginTop: '8px' }}>
                This will remove their opt-in history and contact record from your GS Shop database.
              </p>
            </div>
            <div className="modal-dialog-footer">
              <button className="btn-secondary" style={{ color: '#0f172a', borderColor: '#cbd5e1' }} onClick={() => setDeleteCustomerModal({ isOpen: false, customer: null })}>
                Cancel
              </button>
              <button className="btn-danger" onClick={() => handleDeleteCustomer(deleteCustomerModal.customer._id)}>
                <Trash2 size={15} /> Delete Customer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. CSV Import Modal */}
      {csvImportModal && (
        <CSVImportModal
          onClose={() => setCsvImportModal(false)}
          onImport={handleImportCustomers}
        />
      )}

      {/* 5. Campaign Details & Logs Modal */}
      {campaignDetailsModal.isOpen && campaignDetailsModal.campaign && (
        <CampaignDetailsModal
          campaign={campaignDetailsModal.campaign}
          logs={campaignDetailsModal.logs}
          onClose={() => setCampaignDetailsModal({ isOpen: false, campaign: null, logs: [] })}
          onRunDryRun={() => {
            const camp = campaignDetailsModal.campaign;
            setCampaignDetailsModal({ isOpen: false, campaign: null, logs: [] });
            handleRunDryRun(camp);
          }}
        />
      )}

      {/* 6. Add / Edit Auto-Reply Rule Modal */}
      {autoReplyModal.isOpen && (
        <AutoReplyFormModal
          mode={autoReplyModal.mode}
          initialData={autoReplyModal.data}
          onClose={() => setAutoReplyModal({ isOpen: false, mode: 'create', data: null })}
          onSave={handleSaveAutoReply}
        />
      )}

      {/* 7. Auto-Reply Message Preview Modal */}
      {previewReplyModal.isOpen && previewReplyModal.rule && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-dialog-header">
              <div>
                <h3>WhatsApp Auto-Reply Preview</h3>
                <small style={{ color: '#64748b' }}>Keyword trigger: "{previewReplyModal.rule.keyword}"</small>
              </div>
              <button onClick={() => setPreviewReplyModal({ isOpen: false, rule: null })}><X size={18} /></button>
            </div>
            <div className="modal-dialog-body">
              <div className="phone-mockup" style={{ maxWidth: '360px', margin: '0 auto' }}>
                <div className="phone-mockup-header">
                  <div className="phone-avatar-circle">GS</div>
                  <div>
                    <b style={{ fontSize: '13px', display: 'block' }}>GS Shop · Alangulam</b>
                    <small style={{ fontSize: '10px', color: '#bbf7d0' }}>Official WhatsApp Business Account</small>
                  </div>
                </div>
                <div className="phone-chat-body" style={{ minHeight: '220px' }}>
                  {/* Incoming user bubble */}
                  <div style={{ alignSelf: 'flex-end', background: '#d9fdd3', padding: '8px 12px', borderRadius: '10px 0 10px 10px', fontSize: '12px', maxWidth: '80%', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                    <span>{previewReplyModal.rule.keyword.split(',')[0]}</span>
                    <div style={{ fontSize: '9px', color: '#667781', textAlign: 'right', marginTop: '2px' }}>10:30 AM</div>
                  </div>
                  {/* Automated response bubble */}
                  <div className="chat-bubble-wa" style={{ marginTop: '8px' }}>
                    <p style={{ whiteSpace: 'pre-wrap' }}>{previewReplyModal.rule.replyText}</p>
                    <div className="chat-time-tag">
                      10:30 AM · <CheckCircle2 size={11} color="#128c7e" style={{ display: 'inline' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-dialog-footer">
              <button className="btn-secondary" style={{ color: '#0f172a', borderColor: '#cbd5e1' }} onClick={() => setPreviewReplyModal({ isOpen: false, rule: null })}>
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Generic Confirmation Dialog Modal */}
      {confirmDialog.isOpen && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-dialog-header">
              <h3>{confirmDialog.title}</h3>
              <button onClick={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-dialog-body">
              <p>{confirmDialog.message}</p>
            </div>
            <div className="modal-dialog-footer">
              <button
                className="btn-secondary"
                style={{ color: '#0f172a', borderColor: '#cbd5e1' }}
                onClick={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
              >
                Cancel
              </button>
              <button
                className={confirmDialog.isDanger ? 'btn-danger' : 'btn-primary'}
                onClick={() => {
                  const action = confirmDialog.onConfirm;
                  setConfirmDialog({ ...confirmDialog, isOpen: false });
                  if (action) action();
                }}
              >
                {confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 1. DASHBOARD VIEW (With Auto-Replies & Conversations Summary)
// ==========================================
function DashboardView({
  customers,
  campaigns,
  messages,
  conversations,
  autoReplies,
  analytics,
  onSeed,
  onCreate,
  onRunDryRun,
  onViewDetails
}) {
  const totalCustomers = analytics?.customers?.total ?? customers.length;
  const optedInCount = analytics?.customers?.optedIn ?? customers.filter((c) => c.consentStatus === 'opted_in').length;
  const totalCampaigns = analytics?.campaigns?.total ?? campaigns.length;
  const scheduledCount = analytics?.campaigns?.scheduled ?? campaigns.filter((c) => c.status === 'scheduled').length;
  const simulatedCount = analytics?.messages?.simulatedDryRun ?? messages.filter((m) => m.status === 'dry_run').length;
  const estimatedCost = (optedInCount * 0.86).toFixed(2);
  const pendingHandovers = conversations.filter((c) => c.handoverRequired && c.handoverStatus === 'pending').length;

  return (
    <>
      <section className="dashboard-hero">
        <div className="hero-content">
          <span className="hero-tag">
            <Sparkles size={14} /> GS SHOP ALANGULAM MARKETING SUITE
          </span>
          <h2>Automate Customer Service & Festival Offers on WhatsApp</h2>
          <p>
            Intelligent bilingual auto-replies (Tamil + English), human agent escalation, Meta webhook event logging, and festival broadcasts with 100% demo safety.
          </p>
          <div className="hero-actions">
            <button className="btn-primary" onClick={onCreate}>
              <MessageSquarePlus size={16} /> Create Campaign
            </button>
            <button className="btn-secondary" onClick={onSeed}>
              <RefreshCw size={15} /> Load Demo Customers
            </button>
          </div>
        </div>

        <div className="hero-graphic">
          <div className="hero-pill-badge">
            <div className="badge-icon">
              <ShieldCheck size={20} />
            </div>
            <div>
              <b style={{ color: '#fff', fontSize: '12px', display: 'block' }}>Dry-Run Guard Active</b>
              <small style={{ color: '#94a3b8', fontSize: '11px' }}>
                Safe simulation · 0 Meta fees
              </small>
            </div>
          </div>
        </div>
      </section>

      <div className="section-header">
        <div>
          <h3>Database Campaign & Conversation Metrics</h3>
          <p>Live metrics aggregated directly from MongoDB</p>
        </div>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-title">Total Customers</span>
            <div className="metric-icon-wrap blue">
              <Users size={18} />
            </div>
          </div>
          <div className="metric-value">{totalCustomers}</div>
          <div className="metric-footnote">
            <strong>{optedInCount} opted in</strong> ({totalCustomers > 0 ? Math.round((optedInCount / totalCustomers) * 100) : 0}% consent rate)
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-title">Opted-in Customers</span>
            <div className="metric-icon-wrap green">
              <BadgeCheck size={18} />
            </div>
          </div>
          <div className="metric-value">{optedInCount}</div>
          <div className="metric-footnote">
            <strong>Eligible audience</strong> for WhatsApp campaigns
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-title">Auto-Reply Rules</span>
            <div className="metric-icon-wrap purple">
              <Bot size={18} />
            </div>
          </div>
          <div className="metric-value">{autoReplies.length}</div>
          <div className="metric-footnote">
            <strong>{autoReplies.filter(r => r.enabled).length} active</strong> keyword triggers
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-title">Conversations</span>
            <div className="metric-icon-wrap blue">
              <MessagesSquare size={18} />
            </div>
          </div>
          <div className="metric-value">{conversations.length}</div>
          <div className="metric-footnote">
            <strong>{pendingHandovers} pending</strong> human agent escalation
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-title">Total Campaigns</span>
            <div className="metric-icon-wrap purple">
              <Megaphone size={18} />
            </div>
          </div>
          <div className="metric-value">{totalCampaigns}</div>
          <div className="metric-footnote">
            <strong>{scheduledCount}</strong> scheduled broadcasts
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-title">Simulated Messages</span>
            <div className="metric-icon-wrap amber">
              <Activity size={18} />
            </div>
          </div>
          <div className="metric-value">{simulatedCount}</div>
          <div className="metric-footnote">
            <strong>Dry-run logs</strong> (0 Meta API charges)
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-title">Estimated Live Cost</span>
            <div className="metric-icon-wrap green">
              <IndianRupee size={18} />
            </div>
          </div>
          <div className="metric-value">₹0.00</div>
          <div className="metric-footnote">
            <strong>₹{estimatedCost}</strong> projected live Meta fee
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-title">Webhook Security</span>
            <div className="metric-icon-wrap green">
              <ShieldCheck size={18} />
            </div>
          </div>
          <div className="metric-value" style={{ fontSize: '17px', color: '#047857' }}>HMAC SHA-256</div>
          <div className="metric-footnote">
            <strong>X-Hub-Signature</strong> verified
          </div>
        </div>
      </div>

      <div className="grid-2col">
        <div className="panel-card">
          <div className="panel-card-header">
            <div>
              <h4>Recent Campaign Activity</h4>
              <small>Latest marketing runs and scheduled broadcasts</small>
            </div>
            <button className="btn-secondary" style={{ color: '#0f172a', borderColor: '#cbd5e1' }} onClick={onCreate}>
              + New
            </button>
          </div>

          {campaigns.length > 0 ? (
            <div className="activity-list">
              {campaigns.slice(0, 4).map((c) => (
                <div key={c._id} className="activity-item">
                  <div className="activity-icon">
                    <Gift size={18} />
                  </div>
                  <div className="activity-info">
                    <b>{c.name}</b>
                    <span>
                      {c.offerDetails} · {c.scheduledAt ? `Scheduled: ${new Date(c.scheduledAt).toLocaleDateString()}` : 'Draft'}
                    </span>
                    <div style={{ marginTop: '4px', display: 'flex', gap: '6px' }}>
                      <span className="badge badge-simulated">
                        ⚡ {c.simulatedCount ?? 0} simulated
                      </span>
                      <span className="badge badge-delivered">
                        ✓ {c.deliveredCount ?? 0} live delivered
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                    <span className={`badge badge-${c.status}`}>
                      {c.status}
                    </span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        className="btn-secondary"
                        style={{ padding: '4px 8px', fontSize: '11px', color: '#0f172a', borderColor: '#cbd5e1' }}
                        onClick={() => onViewDetails(c)}
                        title="View details and logs"
                      >
                        <Eye size={12} /> View
                      </button>
                      {c.status !== 'completed' && c.status !== 'cancelled' && (
                        <button
                          className="btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '11px', color: '#128c7e', borderColor: '#128c7e' }}
                          onClick={() => onRunDryRun(c)}
                          title="Run dry-run simulation"
                        >
                          <Play size={12} /> Run
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">
                <Gift size={24} />
              </div>
              <h5>No Campaigns Scheduled</h5>
              <p>Create your first promotional offer campaign to engage your Alangulam customers.</p>
            </div>
          )}
        </div>

        <div className="panel-card">
          <div className="panel-card-header">
            <div>
              <h4>WhatsApp Webhook & Auto-Reply Architecture</h4>
              <small>Compliance Rules for Customer Service & Meta API</small>
            </div>
            <Bot size={20} color="#128c7e" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <CheckCircle2 size={18} color="#059669" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <b style={{ fontSize: '13px', display: 'block' }}>Official Meta Webhook Receiver</b>
                <small style={{ color: '#64748b', fontSize: '12px' }}>
                  Verifies incoming Meta requests using <code>X-Hub-Signature-256</code> HMAC-SHA256 signature and verify tokens.
                </small>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <CheckCircle2 size={18} color="#059669" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <b style={{ fontSize: '13px', display: 'block' }}>Loop Prevention & Rate Limiting</b>
                <small style={{ color: '#64748b', fontSize: '12px' }}>
                  Ignores messages sent by the business account itself and rate limits bursts (&gt;10 msgs in 10 mins).
                </small>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <CheckCircle2 size={18} color="#059669" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <b style={{ fontSize: '13px', display: 'block' }}>Customer Consent on Offer Inquiries</b>
                <small style={{ color: '#64748b', fontSize: '12px' }}>
                  If an opted-out customer triggers promotional offer keywords, marketing text is withheld with opt-in guidance.
                </small>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <CheckCircle2 size={18} color="#059669" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <b style={{ fontSize: '13px', display: 'block' }}>Human Agent Handover Escalation</b>
                <small style={{ color: '#64748b', fontSize: '12px' }}>
                  When "Agent", "Human" or "மனிதர்" is detected, auto-replies stop and flag a ticket for live staff resolution.
                </small>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ==========================================
// 2. CUSTOMERS VIEW (Preserved from Phase 2)
// ==========================================
function CustomersView({
  customers,
  search,
  setSearch,
  consentFilter,
  setConsentFilter,
  segmentFilter,
  setSegmentFilter,
  onAddCustomer,
  onEditCustomer,
  onDeleteCustomer,
  onViewDetails,
  onToggleConsent,
  onOpenImport,
  onSeed
}) {
  const filtered = customers.filter((c) => {
    const matchesSearch =
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search.replace(/\D/g, '')) ||
      (c.tags && c.tags.some((t) => t.toLowerCase().includes(search.toLowerCase())));

    const matchesConsent = consentFilter === 'all' || c.consentStatus === consentFilter;
    const matchesSegment = segmentFilter === 'all' || c.segment === segmentFilter;

    return matchesSearch && matchesConsent && matchesSegment;
  });

  return (
    <div className="table-container">
      <div className="table-toolbar">
        <div>
          <h4 style={{ fontSize: '16px', fontWeight: 800 }}>Customer Directory</h4>
          <p style={{ fontSize: '12px', color: '#64748b' }}>
            Manage shopper contacts, opt-in consent evidence, notes, and audience segments
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn-primary" onClick={onAddCustomer}>
            <UserPlus size={15} /> Add Customer
          </button>
          <button className="btn-secondary" style={{ color: '#0f172a', borderColor: '#cbd5e1' }} onClick={onOpenImport}>
            <Upload size={14} /> Import CSV
          </button>
          <button className="btn-secondary" style={{ color: '#0f172a', borderColor: '#cbd5e1' }} onClick={onSeed}>
            <RefreshCw size={14} /> Load Demo
          </button>
        </div>
      </div>

      <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--border-light)', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="table-search" style={{ flex: 1, minWidth: '220px' }}>
          <Search size={15} />
          <input
            type="text"
            placeholder="Search by name, phone, or tags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="filter-pills-bar">
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>Consent:</span>
          {['all', 'opted_in', 'opted_out', 'unknown'].map((s) => (
            <button
              key={s}
              className={`filter-pill ${consentFilter === s ? 'active' : ''}`}
              onClick={() => setConsentFilter(s)}
            >
              {s === 'all' ? 'All' : s.replace('_', ' ')}
            </button>
          ))}
        </div>

        <div className="filter-pills-bar">
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>Segment:</span>
          {['all', 'general', 'recent', 'appliances', 'vip'].map((seg) => (
            <button
              key={seg}
              className={`filter-pill ${segmentFilter === seg ? 'active' : ''}`}
              onClick={() => setSegmentFilter(seg)}
            >
              {seg === 'all' ? 'All' : seg}
            </button>
          ))}
        </div>
      </div>

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Customer Name</th>
              <th>Phone Number (Masked)</th>
              <th>Segment & Tags</th>
              <th>Consent Status</th>
              <th>Opt-In Evidence</th>
              <th>Notes</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length > 0 ? (
              filtered.map((c) => (
                <tr key={c._id}>
                  <td>
                    <b>{c.name}</b>
                    <small>ID: {c._id.slice(-6)}</small>
                  </td>
                  <td>
                    <code>{maskPhone(c.phone)}</code>
                  </td>
                  <td>
                    <span style={{ textTransform: 'capitalize', fontWeight: 700, color: '#075e54', display: 'block' }}>
                      {c.segment}
                    </span>
                    {c.tags && c.tags.length > 0 && (
                      <div style={{ marginTop: '4px' }}>
                        {c.tags.map((t, idx) => (
                          <span key={idx} className="tag-badge">#{t}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        c.consentStatus === 'opted_in'
                          ? 'badge-opted-in'
                          : c.consentStatus === 'opted_out'
                          ? 'badge-opted-out'
                          : 'badge-unknown'
                      }`}
                    >
                      {c.consentStatus === 'opted_in' && <Check size={11} style={{ display: 'inline', marginRight: '3px' }} />}
                      {c.consentStatus.replace('_', ' ')}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: '12px', display: 'block' }}>{c.consentSource || 'None recorded'}</span>
                    <small style={{ color: '#94a3b8' }}>
                      {c.consentAt ? new Date(c.consentAt).toLocaleDateString() : 'No date'}
                    </small>
                  </td>
                  <td style={{ maxWidth: '180px', fontSize: '12px', color: '#64748b' }}>
                    {c.notes || '—'}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'inline-flex', gap: '6px' }}>
                      <button
                        className="btn-secondary"
                        style={{ padding: '6px 8px', color: '#0f172a', borderColor: '#cbd5e1' }}
                        onClick={() => onViewDetails(c)}
                        title="View Customer Details"
                      >
                        <Eye size={13} />
                      </button>
                      <button
                        className="btn-secondary"
                        style={{ padding: '6px 8px', color: '#128c7e', borderColor: '#cbd5e1' }}
                        onClick={() => onEditCustomer(c)}
                        title="Edit Customer"
                      >
                        <Edit2 size={13} />
                      </button>
                      {c.consentStatus === 'opted_in' ? (
                        <button
                          className="btn-secondary"
                          style={{ padding: '6px 8px', color: '#be123c', borderColor: '#fecdd3' }}
                          onClick={() => onToggleConsent(c, 'opted_out')}
                          title="Opt out / Unsubscribe customer"
                        >
                          <UserX size={13} />
                        </button>
                      ) : (
                        <button
                          className="btn-secondary"
                          style={{ padding: '6px 8px', color: '#047857', borderColor: '#a7f3d0' }}
                          onClick={() => onToggleConsent(c, 'opted_in')}
                          title="Record opt-in consent"
                        >
                          <UserCheck size={13} />
                        </button>
                      )}
                      <button
                        className="btn-secondary"
                        style={{ padding: '6px 8px', color: '#dc2626', borderColor: '#fecaca' }}
                        onClick={() => onDeleteCustomer(c)}
                        title="Delete customer"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">
                    <div className="empty-state-icon">
                      <Users size={24} />
                    </div>
                    <h5>No Customers Found</h5>
                    <p>Try adjusting your search or filter terms, or add a customer to get started.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="table-footer-bar">
        <span>Showing {filtered.length} of {customers.length} total customers</span>
        <span>Consent Policy: Only customers with Opted In status can receive WhatsApp promotions.</span>
      </div>
    </div>
  );
}

// ==========================================
// 3. CAMPAIGNS VIEW (Preserved from Phase 2)
// ==========================================
function CampaignsView({
  campaigns,
  statusFilter,
  setStatusFilter,
  onCreate,
  onRunDryRun,
  onCancelCampaign,
  onViewDetails
}) {
  const filtered = campaigns.filter((c) => {
    return statusFilter === 'all' || c.status === statusFilter;
  });

  return (
    <div>
      <div className="section-header">
        <div>
          <h3>Campaign Schedule & Broadcast History</h3>
          <p>Review drafts, upcoming scheduled campaigns, and safe simulation delivery counts</p>
        </div>
        <button className="btn-primary" onClick={onCreate}>
          <PlusCircle size={16} /> New Campaign
        </button>
      </div>

      <div className="table-container">
        <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--border-light)', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>Filter by Status:</span>
          {['all', 'draft', 'scheduled', 'completed', 'cancelled'].map((st) => (
            <button
              key={st}
              className={`filter-pill ${statusFilter === st ? 'active' : ''}`}
              onClick={() => setStatusFilter(st)}
            >
              {st === 'all' ? 'All' : st}
            </button>
          ))}
        </div>

        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Campaign Name & Goal</th>
                <th>Offer Details</th>
                <th>Target Audience</th>
                <th>Template</th>
                <th>Scheduled At</th>
                <th>Status</th>
                <th>Simulated</th>
                <th>Delivered</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length > 0 ? (
                filtered.map((c) => (
                  <tr key={c._id}>
                    <td>
                      <b>{c.name}</b>
                      {c.description && <small>{c.description}</small>}
                    </td>
                    <td>{c.offerDetails}</td>
                    <td>
                      <span className="badge badge-scheduled" style={{ textTransform: 'capitalize' }}>
                        {c.audience === 'all' ? 'All Opted-in' : c.audience} ({c.recipientCount || 0})
                      </span>
                    </td>
                    <td>
                      <code style={{ fontSize: '11px' }}>{c.templateName}</code>
                    </td>
                    <td>
                      {c.scheduledAt ? new Date(c.scheduledAt).toLocaleString() : <span style={{ color: '#94a3b8' }}>Unscheduled Draft</span>}
                    </td>
                    <td>
                      <span className={`badge badge-${c.status}`}>{c.status}</span>
                    </td>
                    <td>
                      <span className="badge badge-simulated">⚡ {c.simulatedCount ?? 0}</span>
                    </td>
                    <td>
                      <span className="badge badge-delivered">✓ {c.deliveredCount ?? 0}</span>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        <button
                          className="btn-secondary"
                          style={{ padding: '6px 8px', color: '#0f172a', borderColor: '#cbd5e1' }}
                          onClick={() => onViewDetails(c)}
                          title="View Details & Message Logs"
                        >
                          <Eye size={13} />
                        </button>
                        {c.status !== 'completed' && c.status !== 'cancelled' && (
                          <button
                            className="btn-secondary"
                            style={{ padding: '6px 8px', color: '#128c7e', borderColor: '#128c7e' }}
                            onClick={() => onRunDryRun(c)}
                            title="Execute safe dry-run simulation"
                          >
                            <Play size={13} /> Run
                          </button>
                        )}
                        {(c.status === 'scheduled' || c.status === 'draft') && (
                          <button
                            className="btn-secondary"
                            style={{ padding: '6px 8px', color: '#991b1b', borderColor: '#fecaca' }}
                            onClick={() => onCancelCampaign(c)}
                            title="Cancel Campaign"
                          >
                            <X size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-state">
                      <div className="empty-state-icon">
                        <Megaphone size={24} />
                      </div>
                      <h5>No Campaigns Found</h5>
                      <p>Create a draft or scheduled campaign to preview WhatsApp broadcast workflows.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 4. CREATE CAMPAIGN VIEW (Preserved from Phase 2)
// ==========================================
function CreateCampaignView({ form, setForm, templates, analytics, loading, onSaveDraft, onSchedule }) {
  const template = templates.find((t) => t.name === form.templateName);
  const eligibleAll = analytics?.customers?.byAudience?.all ?? 0;
  const eligibleRecent = analytics?.customers?.byAudience?.recent ?? 0;
  const eligibleAppliances = analytics?.customers?.byAudience?.appliances ?? 0;
  const eligibleGeneral = analytics?.customers?.byAudience?.general ?? 0;
  const eligibleVip = analytics?.customers?.byAudience?.vip ?? 0;

  const currentAudienceCount =
    form.audience === 'all'
      ? eligibleAll
      : form.audience === 'recent'
      ? eligibleRecent
      : form.audience === 'appliances'
      ? eligibleAppliances
      : form.audience === 'general'
      ? eligibleGeneral
      : eligibleVip;

  return (
    <div className="studio-grid">
      <div className="panel-card">
        <div className="panel-card-header">
          <div>
            <h4>Compose Promotional Campaign</h4>
            <small>Configure audience, offer text, and scheduling options</small>
          </div>
          <Gift size={20} color="#128c7e" />
        </div>

        <form onSubmit={(e) => { e.preventDefault(); onSchedule(); }}>
          <div className="form-group">
            <label>Campaign Name *</label>
            <input
              type="text"
              className="form-input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Diwali Mega Festival Sale"
              required
            />
          </div>

          <div className="form-group">
            <label>Campaign Description & Goal (Internal)</label>
            <textarea
              className="form-textarea"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Internal campaign objective, target revenue or notes..."
            />
          </div>

          <div className="form-group">
            <label>Offer Details (WhatsApp Body Replacement) *</label>
            <input
              type="text"
              className="form-input"
              value={form.offerDetails}
              onChange={(e) => setForm({ ...form, offerDetails: e.target.value })}
              placeholder="e.g. Up to 25% off on home appliances"
              required
            />
            <span className="form-hint">This text populates the WhatsApp template placeholder variable.</span>
          </div>

          <div className="form-group">
            <label>Eligible Target Audience *</label>
            <select
              className="form-select"
              value={form.audience}
              onChange={(e) => setForm({ ...form, audience: e.target.value })}
            >
              <option value="all">All Opted-in Customers ({eligibleAll} eligible)</option>
              <option value="recent">Recent Buyers ({eligibleRecent} eligible)</option>
              <option value="appliances">Home Appliance Buyers ({eligibleAppliances} eligible)</option>
              <option value="general">General Shoppers ({eligibleGeneral} eligible)</option>
              <option value="vip">VIP Loyalty Customers ({eligibleVip} eligible)</option>
            </select>
          </div>

          <div className="form-group">
            <label>WhatsApp Template *</label>
            <select
              className="form-select"
              value={form.templateName}
              onChange={(e) => setForm({ ...form, templateName: e.target.value })}
            >
              {templates.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name} · {t.status === 'approved' && t.metaTemplateId ? 'Meta-approved' : 'Demo template — not approved by Meta'}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Scheduled Execution Date & Time (IST)</label>
            <input
              type="datetime-local"
              className="form-input"
              value={form.scheduledAt}
              onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
              required
            />
            <span className="form-hint">
              <Clock size={12} style={{ display: 'inline', marginRight: '4px' }} />
              Scheduled campaigns execute automatically via node-cron in safe dry-run mode.
            </span>
          </div>

          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', marginBottom: '18px' }}>
            <b style={{ fontSize: '12px', color: '#0f172a', display: 'block', marginBottom: '6px' }}>Campaign Summary:</b>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px', color: '#475569' }}>
              <div>Eligible Recipients: <b>{currentAudienceCount} customers</b></div>
              <div>Opt-in Verification: <b>100% verified</b></div>
              <div>Estimated Live Fee: <b>₹{(currentAudienceCount * 0.86).toFixed(2)}</b></div>
              <div>Execution Mode: <b style={{ color: '#059669' }}>Dry-Run Simulation</b></div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              type="button"
              className="btn-secondary"
              style={{ flex: 1, justifyContent: 'center', color: '#0f172a', borderColor: '#cbd5e1' }}
              onClick={onSaveDraft}
              disabled={loading}
            >
              Save as Draft
            </button>
            <button
              type="submit"
              className="btn-primary"
              style={{ flex: 1.3, justifyContent: 'center' }}
              disabled={loading}
            >
              <CalendarClock size={16} /> Schedule Campaign
            </button>
          </div>
        </form>
      </div>

      <div>
        <div className="phone-mockup">
          <div className="phone-mockup-header">
            <div className="phone-avatar-circle">GS</div>
            <div>
              <b style={{ fontSize: '13px', display: 'block' }}>GS Shop · Alangulam</b>
              <small style={{ fontSize: '10px', color: '#bbf7d0' }}>Official WhatsApp Business Account</small>
            </div>
          </div>

          <div className="phone-chat-body">
            <div style={{ textAlign: 'center', margin: '4px 0' }}>
              <span style={{ fontSize: '10px', background: '#ffffff', padding: '4px 10px', borderRadius: '12px', color: '#64748b' }}>
                TODAY
              </span>
            </div>

            <div className="chat-bubble-wa">
              <p><b>🎉 {form.name || 'GS Shop Festival Offer'}</b></p>
              <p style={{ marginTop: '6px' }}>வணக்கம் Customer! 👋</p>
              <p style={{ marginTop: '4px' }}>
                GS Shop Alangulam-ல் உங்களுக்கான சிறப்பு சலுகைகள்!
              </p>
              <p style={{ marginTop: '8px', padding: '8px', background: '#f0fdf4', borderRadius: '6px', borderLeft: '3px solid #128c7e' }}>
                🛍️ <b>{form.offerDetails || 'சிறப்பு தள்ளுபடிகள்'}</b>
              </p>
              <p style={{ marginTop: '6px' }}>
                மேலும் விவரங்களுக்கு எங்கள் கடைக்கு நேரில் வருகை தாருங்கள்.
              </p>
              <p style={{ marginTop: '6px', fontSize: '11px', color: '#475569' }}>
                📍 <b>GS Shop, Alangulam, Tenkasi District</b>
              </p>
              <p style={{ marginTop: '6px', fontSize: '10px', color: '#94a3b8' }}>
                Reply STOP to unsubscribe.
              </p>
              <div className="chat-time-tag">
                10:00 AM · <CheckCircle2 size={12} color="#128c7e" style={{ display: 'inline' }} />
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '16px' }} className="panel-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#d97706' }} />
            <b style={{ fontSize: '13px' }}>{template?.name || 'gs_festival_offer'}</b>
            <span className="badge badge-simulated">Demo template — not approved by Meta</span>
          </div>
          <p style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>
            WhatsApp requires all broadcast campaigns to use templates verified by Meta. Unapproved templates are restricted to local dry-run simulations.
          </p>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 5. AUTO REPLIES VIEW (Phase 3 Full CRUD & Settings)
// ==========================================
function AutoRepliesView({ rules, pendingHandovers, onAddRule, onEditRule, onToggleRule, onDeleteRule, onPreviewRule }) {
  return (
    <div>
      <div className="section-header">
        <div>
          <h3>Automated Reply Rules Engine</h3>
          <p>Configurable keyword-based auto-responders for incoming customer inquiries</p>
        </div>
        <button className="btn-primary" onClick={onAddRule}>
          <PlusCircle size={15} /> Add Auto-Reply Rule
        </button>
      </div>

      {/* Overview Cards: Fallback & Handover */}
      <div className="grid-2col" style={{ marginBottom: '20px' }}>
        <div className="panel-card" style={{ borderLeft: '4px solid #128c7e' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bot size={18} color="#128c7e" />
              <b style={{ fontSize: '13px' }}>Default Fallback Response</b>
            </div>
            <span className="badge badge-delivered">Always Active</span>
          </div>
          <p style={{ fontSize: '12px', color: '#475569', lineHeight: 1.5, background: '#f8fafc', padding: '10px', borderRadius: '8px' }}>
            "மன்னிக்கவும், உங்கள் செய்தி புரியவில்லை. உதவிக்கு 'வணக்கம்', 'விலை', 'சலுகை', 'முகவரி', அல்லது 'Agent' என அனுப்பவும். / Sorry, we didn't recognize that. Reply with 'Hello', 'Offer', 'Price', 'Location', or 'Agent' for assistance."
          </p>
          <small style={{ color: '#64748b', fontSize: '11px', display: 'block', marginTop: '6px' }}>
            Sent automatically when an incoming message doesn't match any configured keyword.
          </small>
        </div>

        <div className="panel-card" style={{ borderLeft: '4px solid #9333ea' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Headphones size={18} color="#9333ea" />
              <b style={{ fontSize: '13px' }}>Human Agent Handover Setting</b>
            </div>
            <span className={`badge ${pendingHandovers > 0 ? 'badge-failed' : 'badge-delivered'}`}>
              {pendingHandovers} Pending Ticket{pendingHandovers === 1 ? '' : 's'}
            </span>
          </div>
          <p style={{ fontSize: '12px', color: '#475569', lineHeight: 1.5, background: '#f8fafc', padding: '10px', borderRadius: '8px' }}>
            Keywords: <code>human, agent, person, help, மனிதர், உதவி</code> automatically pause the bot, notify the shop staff, and record a pending handover ticket in the Conversations tab.
          </p>
          <small style={{ color: '#64748b', fontSize: '11px', display: 'block', marginTop: '6px' }}>
            Prevents repetitive automated replies when a customer requests personal assistance.
          </small>
        </div>
      </div>

      {/* Rules Table */}
      <div className="table-container">
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Keyword Triggers</th>
                <th>Automated Reply Message</th>
                <th>Language</th>
                <th>Type</th>
                <th>Usage</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.length > 0 ? (
                rules.map((r) => (
                  <tr key={r._id}>
                    <td>
                      <b style={{ fontSize: '13px', color: '#075e54' }}>{r.keyword}</b>
                      <small style={{ color: '#64748b' }}>Case-insensitive</small>
                    </td>
                    <td style={{ maxWidth: '320px', fontSize: '12px', lineHeight: 1.5 }}>
                      <p style={{ whiteSpace: 'pre-wrap', maxHeight: '60px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {r.replyText}
                      </p>
                    </td>
                    <td>
                      <span className="badge badge-scheduled" style={{ textTransform: 'uppercase' }}>
                        {r.language}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${r.actionType === 'handover' ? 'badge-failed' : r.actionType === 'offer' ? 'badge-simulated' : 'badge-delivered'}`}>
                        {r.actionType}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '12px', fontWeight: 600 }}>{r.matchCount || 0} hits</span>
                    </td>
                    <td>
                      <button
                        className="btn-secondary"
                        style={{ padding: '4px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px', color: r.enabled ? '#047857' : '#64748b' }}
                        onClick={() => onToggleRule(r)}
                        title={r.enabled ? 'Click to disable' : 'Click to enable'}
                      >
                        {r.enabled ? <ToggleRight size={16} color="#059669" /> : <ToggleLeft size={16} color="#94a3b8" />}
                        {r.enabled ? 'Enabled' : 'Disabled'}
                      </button>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        <button
                          className="btn-secondary"
                          style={{ padding: '6px 8px', color: '#0f172a', borderColor: '#cbd5e1' }}
                          onClick={() => onPreviewRule(r)}
                          title="Preview WhatsApp chat bubble"
                        >
                          <Eye size={13} />
                        </button>
                        <button
                          className="btn-secondary"
                          style={{ padding: '6px 8px', color: '#128c7e', borderColor: '#cbd5e1' }}
                          onClick={() => onEditRule(r)}
                          title="Edit Rule"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          className="btn-secondary"
                          style={{ padding: '6px 8px', color: '#dc2626', borderColor: '#fecaca' }}
                          onClick={() => onDeleteRule(r)}
                          title="Delete Rule"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <div className="empty-state-icon">
                        <Bot size={24} />
                      </div>
                      <h5>No Auto-Reply Rules Configured</h5>
                      <p>Create keyword rules to automatically respond to customer messages.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// AUTO-REPLY FORM MODAL (Add / Edit)
// ==========================================
function AutoReplyFormModal({ mode, initialData, onClose, onSave }) {
  const [keyword, setKeyword] = useState(initialData?.keyword || '');
  const [replyText, setReplyText] = useState(initialData?.replyText || '');
  const [language, setLanguage] = useState(initialData?.language || 'bilingual');
  const [actionType, setActionType] = useState(initialData?.actionType || 'reply');
  const [enabled, setEnabled] = useState(initialData?.enabled ?? true);

  function handleSubmit(e) {
    e.preventDefault();
    onSave(
      {
        keyword,
        replyText,
        language,
        actionType,
        enabled
      },
      mode,
      initialData?._id
    );
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-dialog">
        <div className="modal-dialog-header">
          <h3>{mode === 'create' ? 'Add Auto-Reply Rule' : 'Edit Auto-Reply Rule'}</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-dialog-body">
            <div className="form-group">
              <label>Trigger Keyword(s) * (Comma separated)</label>
              <input
                type="text"
                className="form-input"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="e.g. discount, offer, தள்ளுபடி"
                required
              />
              <span className="form-hint">Matches are case-insensitive and support Tamil + English words.</span>
            </div>

            <div className="form-group">
              <label>Automated Reply Message *</label>
              <textarea
                className="form-textarea"
                rows={4}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Enter Tamil & English reply text for customers..."
                required
              />
            </div>

            <div className="form-group">
              <label>Language</label>
              <select className="form-select" value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="bilingual">Bilingual (Tamil + English)</option>
                <option value="ta">Tamil Only (தமிழ்)</option>
                <option value="en">English Only</option>
              </select>
            </div>

            <div className="form-group">
              <label>Action Type</label>
              <select className="form-select" value={actionType} onChange={(e) => setActionType(e.target.value)}>
                <option value="reply">Standard Auto-Reply</option>
                <option value="offer">Promotional Offer (Requires customer consent check)</option>
                <option value="handover">Human Handover (Escalates to staff)</option>
              </select>
            </div>

            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="ruleEnabledCheckbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <label htmlFor="ruleEnabledCheckbox" style={{ marginBottom: 0 }}>Enable this auto-reply rule immediately</label>
            </div>
          </div>

          <div className="modal-dialog-footer">
            <button type="button" className="btn-secondary" style={{ color: '#0f172a', borderColor: '#cbd5e1' }} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              {mode === 'create' ? 'Create Rule' : 'Update Rule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// 6. CONVERSATIONS VIEW (Phase 3 Incoming WhatsApp Messages & Handover)
// ==========================================
function ConversationsView({ conversations, search, setSearch, handoverOnly, setHandoverOnly, onResolveHandover }) {
  const filtered = conversations.filter((c) => {
    const matchesSearch =
      !search ||
      c.customerName.toLowerCase().includes(search.toLowerCase()) ||
      c.customerPhone.includes(search.replace(/\D/g, '')) ||
      c.incomingMessage.toLowerCase().includes(search.toLowerCase()) ||
      c.replyMessage.toLowerCase().includes(search.toLowerCase());

    const matchesHandover = !handoverOnly || c.handoverRequired;

    return matchesSearch && matchesHandover;
  });

  return (
    <div>
      <div className="section-header">
        <div>
          <h3>WhatsApp Customer Conversations</h3>
          <p>Real-time log of incoming customer messages, automated responses, and human agent tickets</p>
        </div>
      </div>

      <div className="table-container">
        <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--border-light)', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="table-search" style={{ flex: 1, minWidth: '220px' }}>
            <Search size={15} />
            <input
              type="text"
              placeholder="Search conversations by customer, message..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="filter-pills-bar">
            <button
              className={`filter-pill ${!handoverOnly ? 'active' : ''}`}
              onClick={() => setHandoverOnly(false)}
            >
              All Messages ({conversations.length})
            </button>
            <button
              className={`filter-pill ${handoverOnly ? 'active' : ''}`}
              onClick={() => setHandoverOnly(true)}
            >
              Human Handover Requests ({conversations.filter(c => c.handoverRequired).length})
            </button>
          </div>
        </div>

        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Incoming Message</th>
                <th>Automated Reply</th>
                <th>Matched Trigger</th>
                <th>Delivery Mode</th>
                <th>Handover Ticket</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length > 0 ? (
                filtered.map((c) => (
                  <tr key={c._id}>
                    <td>
                      <b>{c.customerName}</b>
                      <small><code>{maskPhone(c.customerPhone)}</code></small>
                    </td>
                    <td style={{ maxWidth: '240px', fontSize: '12px' }}>
                      <p style={{ background: '#f8fafc', padding: '6px 10px', borderRadius: '6px', borderLeft: '3px solid #25d366' }}>
                        "{c.incomingMessage}"
                      </p>
                    </td>
                    <td style={{ maxWidth: '300px', fontSize: '12px', lineHeight: 1.5 }}>
                      <p style={{ background: '#f0fdf4', padding: '6px 10px', borderRadius: '6px', borderLeft: '3px solid #128c7e' }}>
                        {c.replyMessage}
                      </p>
                    </td>
                    <td>
                      <span className="badge badge-scheduled">
                        {c.matchedKeyword || 'fallback'}
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-simulated">
                        DEMO (DRY RUN)
                      </span>
                    </td>
                    <td>
                      {c.handoverRequired ? (
                        c.handoverStatus === 'resolved' ? (
                          <span className="badge badge-delivered">Resolved</span>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="badge badge-failed">Pending Handover</span>
                            <button
                              className="btn-secondary"
                              style={{ padding: '3px 7px', fontSize: '10px', color: '#047857', borderColor: '#a7f3d0' }}
                              onClick={() => onResolveHandover(c._id)}
                            >
                              Resolve
                            </button>
                          </div>
                        )
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: '11px' }}>—</span>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '11px', color: '#64748b' }}>
                      {new Date(c.receivedAt).toLocaleString()}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <div className="empty-state-icon">
                        <MessagesSquare size={24} />
                      </div>
                      <h5>No Conversations Recorded Yet</h5>
                      <p>Send a test message through the Meta webhook to view incoming and automated responses.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="table-footer-bar">
          <span>Total Conversations: {conversations.length}</span>
          <span>Compliance: All automated responses were generated within local demo mode (0 live Meta Graph API calls).</span>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 7. MESSAGE TEMPLATES VIEW (Preserved from Phase 1 & 2)
// ==========================================
function TemplatesView({ templates }) {
  return (
    <div>
      <div className="section-header">
        <div>
          <h3>WhatsApp Business Message Templates</h3>
          <p>Meta-compliant message formats and category registrations</p>
        </div>
      </div>

      <div className="panel-card" style={{ marginBottom: '20px', borderLeft: '4px solid #d97706', background: '#fffbeb' }}>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Info size={20} color="#b45309" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <b style={{ fontSize: '13px', color: '#92400e' }}>Meta Template Approval Guide:</b>
            <p style={{ fontSize: '12px', color: '#b45309', marginTop: '4px' }}>
              WhatsApp requires all broadcast campaigns to use templates verified by Meta. Templates in status "demo_only" allow full workflow testing in this application without triggering live WhatsApp charges.
            </p>
          </div>
        </div>
      </div>

      <div className="table-container">
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Template Name</th>
                <th>Category</th>
                <th>Language</th>
                <th>Status</th>
                <th>Meta ID</th>
                <th>Template Content</th>
              </tr>
            </thead>
            <tbody>
              {templates.length > 0 ? (
                templates.map((t) => (
                  <tr key={t.name}>
                    <td>
                      <b>{t.name}</b>
                    </td>
                    <td>
                      <span className="badge badge-scheduled">{t.category}</span>
                    </td>
                    <td>{t.language}</td>
                    <td>
                      <span className={`badge ${t.status === 'approved' && t.metaTemplateId ? 'badge-delivered' : 'badge-simulated'}`}>
                        {t.status === 'approved' && t.metaTemplateId ? 'Approved by Meta' : 'Demo template — not approved by Meta'}
                      </span>
                    </td>
                    <td><code>{t.metaTemplateId || 'local_demo'}</code></td>
                    <td style={{ maxWidth: '380px', fontSize: '12px' }}>{t.body}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <h5>No Templates Registered</h5>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 8. BROADCAST MESSAGE LOGS VIEW (Preserved from Phase 1 & 2)
// ==========================================
function MessagesView({ messages }) {
  return (
    <div>
      <div className="section-header">
        <div>
          <h3>Broadcast Delivery Logs</h3>
          <p>Complete audit trail of simulated runs and incoming delivery receipts</p>
        </div>
      </div>

      <div className="table-container">
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Recipient Name</th>
                <th>Phone (Masked)</th>
                <th>Template Name</th>
                <th>Delivery Mode & Status</th>
                <th>Status Details</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {messages.length > 0 ? (
                messages.map((m) => (
                  <tr key={m._id}>
                    <td>
                      <b>{m.customerId?.name || 'Customer'}</b>
                    </td>
                    <td>
                      <code>{maskPhone(m.recipientPhone)}</code>
                    </td>
                    <td>{m.templateName}</td>
                    <td>
                      {m.status === 'dry_run' ? (
                        <span className="badge badge-simulated">SIMULATED (DRY RUN)</span>
                      ) : m.status === 'delivered' || m.status === 'read' ? (
                        <span className="badge badge-delivered">LIVE · DELIVERED</span>
                      ) : m.status === 'sent' ? (
                        <span className="badge badge-scheduled">LIVE · SENT</span>
                      ) : (
                        <span className="badge badge-opted-out">{m.status}</span>
                      )}
                    </td>
                    <td style={{ fontSize: '12px', color: '#475569' }}>{m.detail}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '12px' }}>
                      {new Date(m.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <div className="empty-state-icon">
                        <History size={24} />
                      </div>
                      <h5>No Message Logs Yet</h5>
                      <p>Run a campaign simulation to generate dry-run delivery records.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="table-footer-bar">
          <span>Total Records: {messages.length}</span>
          <span>Notice: Simulated dry-run messages are completely segregated from live deliveries.</span>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 9. REPORTS VIEW (Preserved & Polished)
// ==========================================
function ReportsView({ customers, campaigns, messages, conversations, analytics }) {
  const total = customers.length;
  const optedIn = analytics?.customers?.optedIn ?? customers.filter((c) => c.consentStatus === 'opted_in').length;
  const consentRate = total > 0 ? Math.round((optedIn / total) * 100) : 0;
  const simulated = analytics?.messages?.simulatedDryRun ?? messages.filter((m) => m.status === 'dry_run').length;

  return (
    <div>
      <div className="section-header">
        <div>
          <h3>Marketing Reports & Automation Analytics</h3>
          <p>Audience health, auto-reply effectiveness, and WhatsApp conversation cost analysis</p>
        </div>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-title">Opt-in Consent Rate</span>
            <div className="metric-icon-wrap green">
              <BadgeCheck size={18} />
            </div>
          </div>
          <div className="metric-value">{consentRate}%</div>
          <div className="metric-footnote">
            <strong>{optedIn} of {total}</strong> customers opted in
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-title">Simulated Broadcasts</span>
            <div className="metric-icon-wrap amber">
              <Activity size={18} />
            </div>
          </div>
          <div className="metric-value">{simulated}</div>
          <div className="metric-footnote">
            <strong>Dry-run tested</strong> successfully
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-title">Conversations Processed</span>
            <div className="metric-icon-wrap blue">
              <MessagesSquare size={18} />
            </div>
          </div>
          <div className="metric-value">{conversations.length}</div>
          <div className="metric-footnote">
            <strong>Automated reply</strong> audit records
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-title">Projected Broadcast Cost</span>
            <div className="metric-icon-wrap purple">
              <WalletCards size={18} />
            </div>
          </div>
          <div className="metric-value">₹{(optedIn * 0.86).toFixed(2)}</div>
          <div className="metric-footnote">
            <strong>Based on ₹0.86</strong> per Meta marketing msg
          </div>
        </div>
      </div>

      <div className="grid-2col">
        <div className="panel-card">
          <div className="panel-card-header">
            <h4>Audience Segmentation Distribution</h4>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                <span>General Store Shoppers</span>
                <b>{customers.filter((c) => c.segment === 'general').length} customers</b>
              </div>
              <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${total ? (customers.filter((c) => c.segment === 'general').length / total) * 100 : 0}%`,
                    background: '#128c7e'
                  }}
                />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                <span>Recent Buyers</span>
                <b>{customers.filter((c) => c.segment === 'recent').length} customers</b>
              </div>
              <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${total ? (customers.filter((c) => c.segment === 'recent').length / total) * 100 : 0}%`,
                    background: '#2563eb'
                  }}
                />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                <span>Home Appliance Buyers</span>
                <b>{customers.filter((c) => c.segment === 'appliances').length} customers</b>
              </div>
              <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${total ? (customers.filter((c) => c.segment === 'appliances').length / total) * 100 : 0}%`,
                    background: '#9333ea'
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="panel-card">
          <div className="panel-card-header">
            <h4>WhatsApp Marketing & Service ROI Highlights</h4>
          </div>
          <div style={{ fontSize: '13px', lineHeight: 1.7, color: '#475569' }}>
            <p style={{ marginBottom: '10px' }}>
              ✓ <b>98% Open Rate:</b> WhatsApp messages achieve 4x higher customer engagement compared to conventional SMS.
            </p>
            <p style={{ marginBottom: '10px' }}>
              ✓ <b>Instant Tamil Replies:</b> Immediate answers to store hours, location, and price inquiries build customer trust in Alangulam.
            </p>
            <p>
              ✓ <b>Zero Waste:</b> Strict opt-in filtering ensures promotions are delivered only to interested shoppers, maximizing marketing budget efficiency.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 10. SETTINGS VIEW (Preserved & Polished)
// ==========================================
function SettingsView({ authOwner, onChangePassword }) {
  const DEFAULTS = {
    shopName: 'GS Shop Alangulam',
    address: 'Main Road, Alangulam, Tenkasi District - 627851',
    landmark: 'Near Bus Stand',
    phone: '+91 99000 00001',
    email: 'gsshop.alangulam@gmail.com',
    openingHours: 'Monday - Sunday: 9:00 AM to 9:30 PM',
    defaultTamilReply: 'வணக்கம்! GS Shop Alangulam-க்கு வரவேற்கிறோம்.',
    defaultEnglishReply: 'Hello! Welcome to GS Shop Alangulam.',
    humanSupportContact: '+91 99000 00001',
  };

  const [settings, setSettings] = useState(DEFAULTS);
  const [loadStatus, setLoadStatus] = useState('loading');
  const [saveStatus, setSaveStatus] = useState('idle');
  const [saveError, setSaveError] = useState('');
  const [validationError, setValidationError] = useState('');
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwStatus, setPwStatus] = useState('idle');
  const [pwError, setPwError] = useState('');

  useEffect(() => {
    async function loadSettings() {
      setLoadStatus('loading');
      try {
        const data = await request('/api/settings');
        setSettings(prev => ({ ...prev, ...data }));
      } catch { /* use defaults */ }
      setLoadStatus('ready');
    }
    loadSettings();
  }, []);

  function handleChange(field, value) {
    setSettings(prev => ({ ...prev, [field]: value }));
    setValidationError('');
    setSaveStatus('idle');
  }

  async function handleSave(e) {
    e.preventDefault();
    setValidationError('');
    setSaveError('');
    if (!settings.shopName.trim()) { setValidationError('Shop name is required.'); return; }
    if (!settings.phone.trim()) { setValidationError('Phone number is required.'); return; }
    if (settings.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.email)) {
      setValidationError('Enter a valid email address.'); return;
    }
    setSaveStatus('saving');
    try {
      await request('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          shopName: settings.shopName.trim(),
          address: settings.address.trim(),
          landmark: settings.landmark.trim(),
          phone: settings.phone.trim(),
          email: settings.email.trim(),
          openingHours: settings.openingHours.trim(),
          defaultTamilReply: settings.defaultTamilReply.trim(),
          defaultEnglishReply: settings.defaultEnglishReply.trim(),
          humanSupportContact: settings.humanSupportContact.trim(),
        })
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      setSaveError(err.message || 'Failed to save settings.');
      setSaveStatus('error');
    }
  }

  async function handlePasswordChange(e) {
    e.preventDefault();
    setPwError('');
    if (pwForm.newPassword !== pwForm.confirmPassword) { setPwError('New passwords do not match.'); return; }
    if (pwForm.newPassword.length < 8) { setPwError('New password must be at least 8 characters.'); return; }
    setPwStatus('saving');
    try {
      await onChangePassword(pwForm.currentPassword, pwForm.newPassword);
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPwStatus('saved');
      setTimeout(() => setPwStatus('idle'), 3000);
    } catch (err) {
      setPwError(err.message || 'Password change failed.');
      setPwStatus('error');
    }
  }

  const inputStyle = {
    width: '100%', padding: '9px 13px', borderRadius: 8,
    border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit', transition: 'border-color 0.2s',
    background: '#fff'
  };
  const labelStyle = {
    display: 'block', fontSize: 11, fontWeight: 700,
    color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px'
  };
  const fieldStyle = { display: 'flex', flexDirection: 'column', gap: 4 };

  if (loadStatus === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: 12 }}>
        <div style={{ width: 28, height: 28, border: '3px solid #25D366', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <span style={{ color: '#64748b', fontSize: 14 }}>Loading settings from database…</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Shop Information + Auto-Reply Defaults */}
      <form onSubmit={handleSave}>
        <div className="panel-card">
          <div className="panel-card-header">
            <div>
              <h4>Shop Information</h4>
              <small>Visible in auto-replies and customer communications</small>
            </div>
            <Store size={20} color="#128c7e" />
          </div>

          {validationError && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#dc2626', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
              <AlertCircle size={16} /> {validationError}
            </div>
          )}

          <div className="settings-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Shop Name *</label>
              <input style={inputStyle} value={settings.shopName} onChange={e => handleChange('shopName', e.target.value)}
                onFocus={e => e.target.style.borderColor = '#25D366'} onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                placeholder="e.g. GS Shop Alangulam" required />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Phone Number *</label>
              <input style={inputStyle} value={settings.phone} onChange={e => handleChange('phone', e.target.value)}
                onFocus={e => e.target.style.borderColor = '#25D366'} onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                placeholder="+91 99000 00001" required />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Email Address</label>
              <input style={inputStyle} type="email" value={settings.email} onChange={e => handleChange('email', e.target.value)}
                onFocus={e => e.target.style.borderColor = '#25D366'} onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                placeholder="gsshop@example.com" />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Opening Hours</label>
              <input style={inputStyle} value={settings.openingHours} onChange={e => handleChange('openingHours', e.target.value)}
                onFocus={e => e.target.style.borderColor = '#25D366'} onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                placeholder="Mon–Sun: 9:00 AM – 9:30 PM" />
            </div>
            <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Shop Address</label>
              <input style={inputStyle} value={settings.address} onChange={e => handleChange('address', e.target.value)}
                onFocus={e => e.target.style.borderColor = '#25D366'} onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                placeholder="Main Road, Alangulam, Tenkasi District - 627851" />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Landmark</label>
              <input style={inputStyle} value={settings.landmark} onChange={e => handleChange('landmark', e.target.value)}
                onFocus={e => e.target.style.borderColor = '#25D366'} onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                placeholder="Near Bus Stand" />
            </div>
          </div>
        </div>

        {/* Auto-Reply Defaults */}
        <div className="panel-card" style={{ marginTop: 20 }}>
          <div className="panel-card-header">
            <div>
              <h4>WhatsApp Auto-Reply Defaults</h4>
              <small>Fallback messages when no keyword rule matches</small>
            </div>
            <Bot size={20} color="#128c7e" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Default Tamil Reply (இயற்புள்ளி)</label>
              <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
                value={settings.defaultTamilReply}
                onChange={e => handleChange('defaultTamilReply', e.target.value)}
                onFocus={e => e.target.style.borderColor = '#25D366'} onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                placeholder="வணக்கம்! GS Shop-க்கு வரவேற்கிறோம்." />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Default English Reply</label>
              <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
                value={settings.defaultEnglishReply}
                onChange={e => handleChange('defaultEnglishReply', e.target.value)}
                onFocus={e => e.target.style.borderColor = '#25D366'} onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                placeholder="Hello! Welcome to GS Shop Alangulam." />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Human Support Contact</label>
              <input style={inputStyle} value={settings.humanSupportContact} onChange={e => handleChange('humanSupportContact', e.target.value)}
                onFocus={e => e.target.style.borderColor = '#25D366'} onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                placeholder="+91 99000 00001" />
            </div>
          </div>
        </div>

        {/* Save button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
          <button type="submit" className="btn-primary" disabled={saveStatus === 'saving'}
            style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: saveStatus === 'saving' ? 0.7 : 1 }}>
            {saveStatus === 'saving'
              ? <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Saving…</>
              : <><Save size={15} /> Save Settings</>}
          </button>
          {saveStatus === 'saved' && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#16a34a', fontSize: 13, fontWeight: 600 }}>
              <CheckCircle2 size={16} /> Settings saved successfully!
            </span>
          )}
          {saveStatus === 'error' && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#dc2626', fontSize: 13 }}>
              <AlertCircle size={16} /> {saveError}
            </span>
          )}
        </div>
      </form>

      {/* Password Change */}
      {onChangePassword && (
        <form onSubmit={handlePasswordChange}>
          <div className="panel-card">
            <div className="panel-card-header">
              <div>
                <h4>Security — Change Password</h4>
                <small>Logged in as @{authOwner?.username || 'admin'}</small>
              </div>
              <KeyRound size={20} color="#7c3aed" />
            </div>
            {pwError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 14, color: '#dc2626', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
                <AlertCircle size={16} /> {pwError}
              </div>
            )}
            <div className="settings-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              {[
                { key: 'currentPassword', label: 'Current Password', placeholder: 'Enter current password' },
                { key: 'newPassword', label: 'New Password (min 8 chars)', placeholder: 'Enter new password' },
                { key: 'confirmPassword', label: 'Confirm New Password', placeholder: 'Repeat new password' },
              ].map(f => (
                <div key={f.key} style={fieldStyle}>
                  <label style={labelStyle}>{f.label}</label>
                  <input type="password" style={inputStyle} value={pwForm[f.key]}
                    onChange={e => setPwForm(p => ({ ...p, [f.key]: e.target.value }))}
                    onFocus={e => e.target.style.borderColor = '#7c3aed'} onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                    placeholder={f.placeholder} autoComplete="new-password" required />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
              <button type="submit" disabled={pwStatus === 'saving'}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 20px', borderRadius: 8, border: 'none', background: pwStatus === 'saving' ? '#94a3b8' : '#7c3aed', color: '#fff', fontWeight: 600, fontSize: 13, cursor: pwStatus === 'saving' ? 'not-allowed' : 'pointer' }}>
                {pwStatus === 'saving'
                  ? <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Changing…</>
                  : <><KeyRound size={14} /> Change Password</>}
              </button>
              {pwStatus === 'saved' && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#16a34a', fontSize: 13, fontWeight: 600 }}>
                  <CheckCircle2 size={16} /> Password changed. Log in again with your new password.
                </span>
              )}
            </div>
          </div>
        </form>
      )}

      {/* System / Safety Info */}
      <div className="panel-card">
        <div className="panel-card-header">
          <div>
            <h4>System &amp; Safety Status</h4>
            <small>Read-only — do not modify credentials here</small>
          </div>
          <ShieldAlert size={20} color="#059669" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, fontSize: 13 }}>
          {[
            { label: 'Operating Mode', value: 'DRY_RUN=true · Safe Demo Locked', badge: true },
            { label: 'WhatsApp API Adapter', value: 'Meta Graph API v23.0', code: true },
            { label: 'Webhook Verification', value: 'GET /api/webhooks/whatsapp', code: true },
            { label: 'Signature Validation', value: 'X-Hub-Signature-256', code: true },
          ].map((row, i, arr) => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < arr.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
              <span style={{ color: '#64748b' }}>{row.label}</span>
              {row.badge
                ? <span className="badge badge-delivered">{row.value}</span>
                : row.code
                ? <code style={{ fontSize: 11, background: '#f8fafc', padding: '2px 8px', borderRadius: 4 }}>{row.value}</code>
                : <span>{row.value}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


// ==========================================
// 10. WHATSAPP INTEGRATION VIEW
// ==========================================
function WhatsAppIntegrationView() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('gs_token');
    fetch('/api/whatsapp/settings', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setSettings(d))
      .catch(() => setSettings(null))
      .finally(() => setLoading(false));
  }, []);

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const token = localStorage.getItem('gs_token');
      const r = await fetch('/api/whatsapp/test-connection', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: '{}'
      });
      const d = await r.json();
      setTestResult({ ok: r.ok, ...d });
    } catch (e) {
      setTestResult({ ok: false, error: e.message });
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
        <div className="spinner" />
      </div>
    );
  }

  const statusOk = settings?.connection?.status === 'connected';

  return (
    <div>
      <div className="section-header">
        <div>
          <h3>WhatsApp API Integration</h3>
          <p>Live connection status, webhook health, and template metrics for your Meta WhatsApp Cloud API</p>
        </div>
      </div>

      {/* Connection Status Card */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Smartphone size={20} color="#25d366" />
            <h4 style={{ margin: 0 }}>WhatsApp Connection</h4>
          </div>
          <span className={`badge ${statusOk ? 'badge-delivered' : 'badge-simulated'}`}>
            {statusOk ? '● CONNECTED' : '● DEMO MODE'}
          </span>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[
              { label: 'Business Name', value: settings?.connection?.businessName || settings?.connection?.businessPhoneNumber || '—' },
              { label: 'WABA Status', value: settings?.connection?.wabaStatus || '—' },
              { label: 'Phone Number ID', value: settings?.connection?.phoneNumberIdMasked || settings?.connection?.phoneNumberId || '—', code: true },
              { label: 'API Version', value: settings?.connection?.apiVersion || 'v23.0', code: true },
            ].map((row) => (
              <div key={row.label} style={{ padding: '8px 0' }}>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{row.label}</div>
                {row.code
                  ? <code style={{ fontSize: 13, background: '#f8fafc', padding: '2px 8px', borderRadius: 4 }}>{row.value}</code>
                  : <div style={{ fontWeight: 600 }}>{row.value}</div>}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #f1f5f9', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn-primary"
              onClick={handleTestConnection}
              disabled={testing}
            >
              {testing ? 'Testing…' : '🔌 Test Connection'}
            </button>
            {testResult && (
              <div style={{ fontSize: 13, color: testResult.ok ? '#059669' : '#dc2626', fontWeight: 500 }}>
                {testResult.ok
                  ? `✓ ${testResult.status || 'Connection OK'}`
                  : `✗ ${testResult.error || testResult.message || 'Connection failed'}`}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Webhook Health Card */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h4 style={{ margin: 0 }}>🔒 Webhook Security</h4>
        </div>
        <div className="card-body">
          {[
            { label: 'Webhook Endpoint', value: settings?.webhook?.endpoint || 'POST /api/webhooks/whatsapp', code: true },
            { label: 'Verification Token', value: settings?.webhook?.verificationConfigured ? '✓ Configured' : '✗ Not set', ok: settings?.webhook?.verificationConfigured },
            { label: 'Signature Validation', value: settings?.webhook?.signatureValidation || 'HMAC-SHA256', code: true },
            { label: 'Duplicate Prevention', value: 'X-Hub-Signature-256 + WebhookLog', code: true },
          ].map((row, i, arr) => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < arr.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
              <span style={{ color: '#64748b', fontSize: 13 }}>{row.label}</span>
              {row.code
                ? <code style={{ fontSize: 11, background: '#f8fafc', padding: '2px 8px', borderRadius: 4 }}>{row.value}</code>
                : <span style={{ fontWeight: 600, color: row.ok === false ? '#dc2626' : row.ok === true ? '#059669' : '#0f172a' }}>{row.value}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Template Metrics Card */}
      <div className="card">
        <div className="card-header">
          <h4 style={{ margin: 0 }}>📋 Template Overview</h4>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {[
              { label: 'Total Templates', value: settings?.templates?.total ?? '—', color: '#6366f1' },
              { label: 'Approved', value: settings?.templates?.approved ?? '—', color: '#059669' },
              { label: 'Pending Review', value: settings?.templates?.pending ?? '—', color: '#f59e0b' },
            ].map((m) => (
              <div key={m.label} className="quota-card" style={{ borderLeftColor: m.color }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: m.color }}>{m.value}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{m.label}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, padding: '12px', background: '#f0fdf4', borderRadius: 8, fontSize: 13, color: '#065f46' }}>
            <strong>🔒 DRY_RUN=true is enforced.</strong> No real WhatsApp messages will be sent regardless of API configuration.
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 11. SUBSCRIPTION / SAAS PLAN VIEW
// ==========================================
function SubscriptionView() {
  const [sub, setSub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('gs_token');
    fetch('/api/subscription', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        // API returns { ok, tenant } — normalise to a flat shape
        const t = d.tenant || d;
        setSub({
          plan: t.plan || 'free',
          usage: {
            messages: t.monthlyMessagesUsed || 0,
            customers: t.customerCount || 0,
            campaigns: t.campaignCount || 0
          },
          limits: {
            monthlyMessages: t.monthlyMessageLimit || 500,
            customers: t.customerLimit || 100,
            campaigns: t.campaignLimit || 5
          },
          features: t.features || {},
          subscriptionStatus: t.subscriptionStatus || 'active',
          renewalDate: t.renewalDate
        });
      })
      .catch(() => setSub(null))
      .finally(() => setLoading(false));
  }, []);

  async function handleUpgrade(plan) {
    setUpgrading(true);
    setNotice('');
    try {
      const token = localStorage.getItem('gs_token');
      const r = await fetch('/api/subscription/plan', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan })
      });
      const d = await r.json();
      if (r.ok) {
        setSub((prev) => ({ ...prev, plan: d.plan, limits: d.limits }));
        setNotice(`Plan upgraded to ${d.plan}!`);
      } else {
        setNotice(d.error || 'Upgrade failed');
      }
    } catch (e) {
      setNotice(e.message);
    } finally {
      setUpgrading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
        <div className="spinner" />
      </div>
    );
  }

  const plans = [
    { id: 'free', name: 'Free', price: '₹0/mo', color: '#6366f1', messages: 500, customers: 100, campaigns: 5, features: ['500 messages/month', '100 customers', '5 campaigns', 'Basic templates', 'Email support'] },
    { id: 'starter', name: 'Starter', price: '₹999/mo', color: '#0ea5e9', messages: 5000, customers: 1000, campaigns: 20, features: ['5,000 messages/month', '1,000 customers', '20 campaigns', 'All templates', 'Priority support', 'CSV export'] },
    { id: 'pro', name: 'Pro', price: '₹2,999/mo', color: '#25d366', messages: 25000, customers: 5000, campaigns: 100, features: ['25,000 messages/month', '5,000 customers', '100 campaigns', 'Auto-replies', 'Analytics', 'API access', 'Dedicated support'] },
    { id: 'enterprise', name: 'Enterprise', price: 'Custom', color: '#f59e0b', messages: Infinity, customers: Infinity, campaigns: Infinity, features: ['Unlimited messages', 'Unlimited customers', 'Multi-location', 'Custom templates', 'SLA guarantee', 'Custom integrations'] },
  ];

  const currentPlan = sub?.plan || 'free';
  const usage = sub?.usage || {};
  const limits = sub?.limits || {};

  function pct(used, limit) {
    if (!limit || limit === Infinity) return 0;
    return Math.min(100, Math.round((used / limit) * 100));
  }

  return (
    <div>
      <div className="section-header">
        <div>
          <h3>SaaS Subscription Plan</h3>
          <p>Manage your plan, usage limits, and upgrade your subscription</p>
        </div>
      </div>

      {notice && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, color: '#065f46', fontSize: 14 }}>
          {notice}
        </div>
      )}

      {/* Usage Quota Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Messages This Month', used: usage.messages || 0, limit: limits.monthlyMessages || 25000, color: '#25d366' },
          { label: 'Customers', used: usage.customers || 0, limit: limits.customers || 5000, color: '#6366f1' },
          { label: 'Active Campaigns', used: usage.campaigns || 0, limit: limits.campaigns || 100, color: '#0ea5e9' },
        ].map((q) => (
          <div key={q.label} className="quota-card" style={{ borderLeftColor: q.color }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: '#64748b' }}>{q.label}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {q.used.toLocaleString()} / {q.limit === Infinity ? '∞' : q.limit.toLocaleString()}
              </span>
            </div>
            <div className="progress-bar-wrap">
              <div className="progress-bar-fill" style={{ width: `${pct(q.used, q.limit)}%`, background: q.color }} />
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{pct(q.used, q.limit)}% used</div>
          </div>
        ))}
      </div>

      {/* Pricing Grid */}
      <div className="pricing-grid">
        {plans.map((plan) => {
          const isActive = currentPlan === plan.id;
          return (
            <div key={plan.id} className={`plan-card${isActive ? ' plan-card-active' : ''}`} style={{ borderTopColor: plan.color }}>
              {isActive && <div className="plan-badge-current">Current Plan</div>}
              <div style={{ fontSize: 18, fontWeight: 700, color: plan.color, marginBottom: 4 }}>{plan.name}</div>
              <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 16 }}>{plan.price}</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', fontSize: 13, lineHeight: '1.8' }}>
                {plan.features.map((f) => (
                  <li key={f} style={{ color: '#475569' }}>✓ {f}</li>
                ))}
              </ul>
              <button
                className={isActive ? 'btn-secondary' : 'btn-primary'}
                style={{ width: '100%', opacity: isActive ? 0.7 : 1, cursor: isActive ? 'default' : 'pointer' }}
                disabled={isActive || upgrading}
                onClick={() => !isActive && handleUpgrade(plan.id)}
              >
                {isActive ? 'Active Plan' : upgrading ? 'Upgrading…' : `Upgrade to ${plan.name}`}
              </button>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 20, padding: '12px 16px', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, fontSize: 13, color: '#92400e' }}>
        <strong>Note:</strong> This is a demo subscription system. Payment gateway integration (Razorpay / Stripe) can be added for production billing.
      </div>
    </div>
  );
}

// ==========================================
// MODAL SUB-COMPONENTS (CustomerForm, CustomerDetails, CSVImport, CampaignDetails)
// ==========================================
function CustomerFormModal({ mode, initialData, onClose, onSave }) {
  const [name, setName] = useState(initialData?.name || '');
  const [phone, setPhone] = useState(initialData?.phone || '');
  const [segment, setSegment] = useState(initialData?.segment || 'general');
  const [tags, setTags] = useState(initialData?.tags?.join(', ') || '');
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [consentStatus, setConsentStatus] = useState(initialData?.consentStatus || 'unknown');
  const [consentSource, setConsentSource] = useState(initialData?.consentSource || '');
  const [birthday, setBirthday] = useState(initialData?.birthday ? initialData.birthday.slice(0, 10) : '');
  const [source, setSource] = useState(initialData?.source || 'store_counter');

  function handleSubmit(e) {
    e.preventDefault();
    const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
    onSave(
      {
        name,
        phone,
        segment,
        tags: tagList,
        notes,
        consentStatus,
        consentSource,
        birthday: birthday || undefined,
        source
      },
      mode,
      initialData?._id
    );
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-dialog">
        <div className="modal-dialog-header">
          <h3>{mode === 'create' ? 'Add New Customer' : 'Edit Customer'}</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-dialog-body">
            <div className="form-group">
              <label>Customer Name *</label>
              <input
                type="text"
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ramesh Kumar"
                required
              />
            </div>

            <div className="form-group">
              <label>Phone Number (with Country Code) *</label>
              <input
                type="text"
                className="form-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+919876543210"
                required
              />
              <span className="form-hint">Duplicate phone numbers are automatically rejected.</span>
            </div>

            <div className="form-group">
              <label>Customer Segment</label>
              <select className="form-select" value={segment} onChange={(e) => setSegment(e.target.value)}>
                <option value="general">General Retail Customer</option>
                <option value="recent">Recent Buyer</option>
                <option value="appliances">Home Appliance Buyer</option>
                <option value="vip">VIP Customer</option>
              </select>
            </div>

            <div className="form-group">
              <label>Customer Tags (Comma separated)</label>
              <input
                type="text"
                className="form-input"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="e.g. festival_buyer, grinder_inquiry, loyal"
              />
            </div>

            <div className="form-group">
              <label>Marketing Opt-In Consent *</label>
              <select className="form-select" value={consentStatus} onChange={(e) => setConsentStatus(e.target.value)}>
                <option value="unknown">Unknown / Not Consented (Default)</option>
                <option value="opted_in">Opted-In (Consent Verified)</option>
                <option value="opted_out">Opted-Out / Unsubscribed</option>
              </select>
            </div>

            {consentStatus === 'opted_in' && (
              <div className="form-group">
                <label>Opt-in Evidence / Source *</label>
                <input
                  type="text"
                  className="form-input"
                  value={consentSource}
                  onChange={(e) => setConsentSource(e.target.value)}
                  placeholder="e.g. Store billing counter checkbox, WhatsApp inquiry"
                  required={consentStatus === 'opted_in'}
                />
              </div>
            )}

            <div className="form-group">
              <label>Staff Notes</label>
              <textarea
                className="form-textarea"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Purchased mixer grinder last Pongal, requested utensil catalog..."
              />
            </div>

            <div className="form-group">
              <label>Birthday (Optional)</label>
              <input
                type="date"
                className="form-input"
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
              />
              <span className="form-hint">Used for birthday greeting automations.</span>
            </div>

            <div className="form-group">
              <label>Customer Source</label>
              <select className="form-select" value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="store_counter">Store Counter</option>
                <option value="whatsapp_inquiry">WhatsApp Inquiry</option>
                <option value="referral">Referral</option>
                <option value="csv_import">CSV Import</option>
                <option value="website">Website</option>
              </select>
            </div>
          </div>

          <div className="modal-dialog-footer">
            <button type="button" className="btn-secondary" style={{ color: '#0f172a', borderColor: '#cbd5e1' }} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              {mode === 'create' ? 'Save Customer' : 'Update Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CustomerDetailsModal({ customer, onClose, onToggleConsent }) {
  return (
    <div className="modal-backdrop">
      <div className="modal-dialog">
        <div className="modal-dialog-header">
          <h3>Customer Details</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-dialog-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '18px' }}>
            <div className="brand-badge" style={{ width: '46px', height: '46px', borderRadius: '50%' }}>
              <Users size={22} />
            </div>
            <div>
              <h4 style={{ fontSize: '17px', fontWeight: 800 }}>{customer.name}</h4>
              <code style={{ fontSize: '13px', color: '#128c7e' }}>{maskPhone(customer.phone)}</code>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <span className={`badge ${customer.consentStatus === 'opted_in' ? 'badge-opted-in' : customer.consentStatus === 'opted_out' ? 'badge-opted-out' : 'badge-unknown'}`}>
                {customer.consentStatus.replace('_', ' ')}
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', background: '#f8fafc', padding: '14px', borderRadius: '10px', marginBottom: '16px' }}>
            <div>
              <small style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Audience Segment</small>
              <b style={{ textTransform: 'capitalize' }}>{customer.segment}</b>
            </div>
            <div>
              <small style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Registered Date</small>
              <b>{new Date(customer.createdAt).toLocaleDateString()}</b>
            </div>
            <div>
              <small style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Consent Source</small>
              <b>{customer.consentSource || 'None recorded'}</b>
            </div>
            <div>
              <small style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Consent Timestamp</small>
              <b>{customer.consentAt ? new Date(customer.consentAt).toLocaleString() : '—'}</b>
            </div>
          </div>

          {customer.tags && customer.tags.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <small style={{ color: '#64748b', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Customer Tags</small>
              {customer.tags.map((t, idx) => (
                <span key={idx} className="tag-badge">#{t}</span>
              ))}
            </div>
          )}

          <div style={{ marginBottom: '16px' }}>
            <small style={{ color: '#64748b', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Internal Notes</small>
            <p style={{ background: '#ffffff', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', color: '#334155' }}>
              {customer.notes || 'No customer notes recorded.'}
            </p>
          </div>
        </div>

        <div className="modal-dialog-footer">
          {customer.consentStatus === 'opted_in' ? (
            <button
              className="btn-secondary"
              style={{ color: '#be123c', borderColor: '#fecdd3' }}
              onClick={() => onToggleConsent('opted_out')}
            >
              <UserX size={15} /> Opt-Out Customer
            </button>
          ) : (
            <button
              className="btn-primary"
              onClick={() => onToggleConsent('opted_in')}
            >
              <UserCheck size={15} /> Record Opt-In Consent
            </button>
          )}
          <button className="btn-secondary" style={{ color: '#0f172a', borderColor: '#cbd5e1' }} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function CSVImportModal({ onClose, onImport }) {
  const [csvText, setCsvText] = useState(
    `Name,Phone,Segment,ConsentStatus,ConsentSource,Notes\nKarthik,+919900000010,general,unknown,,Direct store walk-in\nMeena,+919900000011,appliances,opted_in,Counter billing form,Interested in wet grinder\nAnitha,+919900000012,recent,opted_out,Customer request,Do not send promotional offers`
  );
  const [previewRows, setPreviewRows] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');

  function parseCSV(text) {
    setErrorMsg('');
    const lines = text.trim().split('\n');
    if (lines.length < 2) {
      setErrorMsg('CSV must include a header line and at least one customer row.');
      return [];
    }

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(',').map((p) => p.trim());
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = parts[idx] || '';
      });

      if (!row.name || !row.phone) {
        continue;
      }

      rows.push({
        name: row.name,
        phone: row.phone,
        segment: row.segment || 'general',
        consentStatus: row.consentstatus || 'unknown',
        consentSource: row.consentsource || '',
        notes: row.notes || ''
      });
    }

    return rows;
  }

  function handlePreview() {
    const parsed = parseCSV(csvText);
    setPreviewRows(parsed);
  }

  useEffect(() => {
    handlePreview();
  }, [csvText]);

  function handleConfirm() {
    if (!previewRows.length) {
      setErrorMsg('No valid rows found to import.');
      return;
    }
    onImport(previewRows);
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-dialog modal-lg">
        <div className="modal-dialog-header">
          <h3>Import Customers via CSV</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-dialog-body">
          <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px', padding: '12px', marginBottom: '14px', fontSize: '12px', color: '#065f46' }}>
            <b style={{ display: 'block', marginBottom: '4px' }}>Consent Safety Policy:</b>
            Imported records default to <b>"Unknown / Not Consented"</b> unless explicitly marked <code>opted_in</code> with a documented consent source. Duplicate phone numbers are automatically identified and skipped.
          </div>

          <div className="form-group">
            <label>Paste CSV Data (Header: Name, Phone, Segment, ConsentStatus, ConsentSource, Notes)</label>
            <textarea
              className="form-textarea"
              rows={5}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              style={{ fontFamily: 'monospace', fontSize: '11px' }}
            />
          </div>

          {errorMsg && (
            <p style={{ color: '#be123c', fontSize: '12px', marginBottom: '10px' }}>{errorMsg}</p>
          )}

          <div style={{ marginTop: '14px' }}>
            <b style={{ fontSize: '12px', display: 'block', marginBottom: '6px' }}>
              Preview Valid Rows ({previewRows.length} found):
            </b>
            <div style={{ maxHeight: '160px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
              <table className="data-table" style={{ fontSize: '11px' }}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Segment</th>
                    <th>Consent</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.name}</td>
                      <td><code>{maskPhone(r.phone)}</code></td>
                      <td>{r.segment}</td>
                      <td>
                        <span className={`badge ${r.consentStatus === 'opted_in' ? 'badge-opted-in' : 'badge-unknown'}`}>
                          {r.consentStatus}
                        </span>
                      </td>
                      <td>{r.consentSource || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="modal-dialog-footer">
          <button className="btn-secondary" style={{ color: '#0f172a', borderColor: '#cbd5e1' }} onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleConfirm} disabled={!previewRows.length}>
            <Upload size={15} /> Import {previewRows.length} Customers
          </button>
        </div>
      </div>
    </div>
  );
}

function CampaignDetailsModal({ campaign, logs, onClose, onRunDryRun }) {
  return (
    <div className="modal-backdrop">
      <div className="modal-dialog modal-lg">
        <div className="modal-dialog-header">
          <div>
            <h3>{campaign.name}</h3>
            <small style={{ color: '#64748b' }}>Campaign Details & Simulated Logs</small>
          </div>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-dialog-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', background: '#f8fafc', padding: '14px', borderRadius: '10px', marginBottom: '16px', fontSize: '12px' }}>
            <div>
              <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Status</span>
              <span className={`badge badge-${campaign.status}`}>{campaign.status}</span>
            </div>
            <div>
              <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Audience</span>
              <b>{campaign.audience}</b>
            </div>
            <div>
              <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Target Recipients</span>
              <b>{campaign.recipientCount || 0} customers</b>
            </div>
            <div>
              <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Scheduled At</span>
              <b>{campaign.scheduledAt ? new Date(campaign.scheduledAt).toLocaleString() : 'Draft'}</b>
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>Offer Details:</span>
            <p style={{ background: '#ffffff', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px' }}>
              {campaign.offerDetails}
            </p>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <b style={{ fontSize: '13px' }}>Simulated Message Logs ({logs.length})</b>
              <span className="badge badge-simulated">Dry-Run Only</span>
            </div>

            <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
              <table className="data-table" style={{ fontSize: '11px' }}>
                <thead>
                  <tr>
                    <th>Recipient</th>
                    <th>Phone</th>
                    <th>Status</th>
                    <th>Detail</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length > 0 ? (
                    logs.map((l) => (
                      <tr key={l._id}>
                        <td>{l.customerId?.name || 'Customer'}</td>
                        <td><code>{maskPhone(l.recipientPhone)}</code></td>
                        <td>
                          <span className={`badge ${l.status === 'dry_run' ? 'badge-simulated' : 'badge-delivered'}`}>
                            {l.status}
                          </span>
                        </td>
                        <td>{l.detail}</td>
                        <td>{new Date(l.createdAt).toLocaleTimeString()}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>
                        No execution records found. Run a dry-run simulation to generate logs.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="modal-dialog-footer">
          {campaign.status !== 'completed' && campaign.status !== 'cancelled' && (
            <button className="btn-primary" onClick={onRunDryRun}>
              <Play size={14} /> Run Dry-Run Now
            </button>
          )}
          <button className="btn-secondary" style={{ color: '#0f172a', borderColor: '#cbd5e1' }} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}


// ============================================================
// AUTH COMPONENTS: LoginView, SetupView
// ============================================================
function AuthCard({ title, subtitle, icon: Icon, children, error }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #f0fdf4 0%, #e8f5e9 50%, #f0f9f0 100%)',
      padding: '20px'
    }}>
      <div style={{
        background: '#fff', borderRadius: 20, boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
        padding: '40px', width: '100%', maxWidth: 420
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16, background: 'linear-gradient(135deg, #25D366, #128c7e)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', boxShadow: '0 8px 20px rgba(37,211,102,0.3)'
          }}>
            {Icon && <Icon size={28} color="#fff" />}
          </div>
          <h2 style={{ margin: '0 0 4px', color: '#0f172a', fontSize: 22, fontWeight: 700 }}>{title}</h2>
          <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>{subtitle}</p>
        </div>

        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
            padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8,
            color: '#dc2626', fontSize: 13
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {children}

        <p style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', marginTop: 24, lineHeight: 1.5 }}>
          GS Shop Alangulam · WhatsApp Marketing Automation<br />
          <span style={{ color: '#22c55e' }}>🔒 DRY_RUN=true · Demo Mode · No Live Sending</span>
        </p>
      </div>
    </div>
  );
}

function LoginView({ form, setForm, onSubmit, loading, error }) {
  return (
    <AuthCard title="Owner Login" subtitle="Sign in to GS Shop Dashboard" icon={Store} error={error}>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
            Username
          </label>
          <input
            type="text"
            value={form.username}
            onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
            placeholder="Enter your username"
            required
            autoComplete="username"
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0',
              fontSize: 14, outline: 'none', boxSizing: 'border-box',
              transition: 'border-color 0.2s'
            }}
            onFocus={e => e.target.style.borderColor = '#25D366'}
            onBlur={e => e.target.style.borderColor = '#e2e8f0'}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
            Password
          </label>
          <input
            type="password"
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            placeholder="Enter your password"
            required
            autoComplete="current-password"
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0',
              fontSize: 14, outline: 'none', boxSizing: 'border-box',
              transition: 'border-color 0.2s'
            }}
            onFocus={e => e.target.style.borderColor = '#25D366'}
            onBlur={e => e.target.style.borderColor = '#e2e8f0'}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          style={{
            background: loading ? '#94a3b8' : 'linear-gradient(135deg, #25D366, #128c7e)',
            color: '#fff', border: 'none', borderRadius: 10, padding: '12px',
            fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all 0.2s'
          }}
        >
          <LogIn size={16} />
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </AuthCard>
  );
}

function SetupView({ form, setForm, onSubmit, loading, error }) {
  return (
    <AuthCard title="Create Owner Account" subtitle="First-time setup — create your admin account" icon={ShieldCheck} error={error}>
      <div style={{
        background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10,
        padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#166534'
      }}>
        <b>First time setup</b> — No accounts exist yet. Create the owner account to get started.
      </div>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {[
          { label: 'Display Name', key: 'displayName', type: 'text', placeholder: 'e.g. GS Shop Owner', autocomplete: 'name' },
          { label: 'Username', key: 'username', type: 'text', placeholder: 'e.g. gsadmin', autocomplete: 'username' },
          { label: 'Password (min 8 characters)', key: 'password', type: 'password', placeholder: 'Choose a strong password', autocomplete: 'new-password' }
        ].map(field => (
          <div key={field.key}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              {field.label}
            </label>
            <input
              type={field.type}
              value={form[field.key]}
              onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
              placeholder={field.placeholder}
              required={field.key !== 'displayName'}
              autoComplete={field.autocomplete}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0',
                fontSize: 14, outline: 'none', boxSizing: 'border-box'
              }}
              onFocus={e => e.target.style.borderColor = '#25D366'}
              onBlur={e => e.target.style.borderColor = '#e2e8f0'}
            />
          </div>
        ))}
        <button
          type="submit"
          disabled={loading}
          style={{
            background: loading ? '#94a3b8' : 'linear-gradient(135deg, #25D366, #128c7e)',
            color: '#fff', border: 'none', borderRadius: 10, padding: '12px',
            fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
          }}
        >
          <ShieldCheck size={16} />
          {loading ? 'Creating account…' : 'Create Owner Account'}
        </button>
      </form>
    </AuthCard>
  );
}
