import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2, Palette, Users, ShieldCheck, GitBranch, ShoppingCart, Truck, Bell,
  Plug, Lock, DatabaseBackup, SlidersHorizontal, ScrollText, KeyRound, Database,
  Search, Star, ChevronRight, Plus, Trash2, Pencil, X, Check, AlertTriangle,
  Download, Upload, RotateCcw, Eye, EyeOff, CheckCircle2, CircleOff, Clock,
} from 'lucide-react';
import { Header } from '../components/Layout/Header';
import { colorFromInitials } from '../utils/colors';
import { PurchaseRequest } from '../types';
import { AppUser, Role, loadUsers, saveUsers } from '../data/users';

/* ================================================================== */
/* Modelo de configurações (estrutura pronta para o banco de dados)    */
/* ================================================================== */
export interface AppSettings {
  company: {
    nome: string; razaoSocial: string; fantasia: string; cnpj: string; ie: string;
    endereco: string; cidade: string; estado: string; cep: string; pais: string;
    telefone: string; whatsapp: string; email: string; website: string;
  };
  branding: { primaryColor: string; secondaryColor: string; theme: 'claro' | 'escuro'; font: string };
  approval: {
    niveis: number; aprovacaoPorValor: boolean; valorAlcada: string;
    aprovacaoPorSetor: boolean; autoAprovarAbaixo: string; aprovacaoObrigatoria: boolean;
  };
  purchasing: {
    numeracaoAutomatica: boolean; prefixo: string; slaHorasMaquinaParada: string;
    slaHorasUrgente: string; prioridadePadrao: string;
    categorias: string[]; centrosCusto: string[]; tiposSolicitacao: string[];
  };
  suppliers: {
    categorias: string[]; criterioPrazo: number; criterioPreco: number; criterioQualidade: number;
    prazoAlvoDias: string; homologacaoObrigatoria: boolean; bloqueados: string[];
  };
  notifications: {
    pushEnabled: boolean; ntfyTopic: string; emailEnabled: boolean; whatsappEnabled: boolean;
    evAprovacao: boolean; evReprovacao: boolean; evCompras: boolean; evRecebimento: boolean; evNovas: boolean;
  };
  security: { mfa: boolean; sessaoMinutos: string; ipPermitido: string; sso: boolean };
  customization: {
    nomeSistema: string; rodape: string; idioma: string; fuso: string;
    formatoData: string; formatoMoeda: string;
  };
  profiles: Record<string, Record<string, boolean>>;
  apiKeys: { id: string; label: string; key: string; createdAt: string }[];
  backups: { id: string; date: string; size: number }[];
  autoBackup: boolean;
}

const SETTINGS_KEY = 'compras-leao-settings';

const PROFILE_NAMES = ['Administrador', 'Diretor', 'Gestor', 'Comprador', 'Almoxarifado', 'Financeiro', 'Auditor', 'Solicitante'];
const MODULES = ['Dashboard', 'Kanban', 'Ordens de Serviço', 'Relatórios', 'Configurações', 'Usuários', 'Solicitações', 'Compras', 'Fornecedores'];

function defaultProfiles(): Record<string, Record<string, boolean>> {
  const p: Record<string, Record<string, boolean>> = {};
  PROFILE_NAMES.forEach((name) => {
    p[name] = {};
    MODULES.forEach((m) => {
      p[name][m] =
        name === 'Administrador' ? true :
        name === 'Solicitante' ? ['Dashboard', 'Kanban', 'Solicitações'].includes(m) :
        name === 'Comprador' ? !['Configurações', 'Usuários'].includes(m) :
        name === 'Gestor' || name === 'Diretor' ? m !== 'Configurações' :
        ['Dashboard', 'Kanban', 'Relatórios'].includes(m);
    });
  });
  return p;
}

const DEFAULT_SETTINGS: AppSettings = {
  company: { nome: 'Compras Leão', razaoSocial: '', fantasia: '', cnpj: '', ie: '', endereco: '', cidade: '', estado: '', cep: '', pais: 'Brasil', telefone: '', whatsapp: '', email: '', website: '' },
  branding: { primaryColor: '#7c3aed', secondaryColor: '#0f172a', theme: 'claro', font: 'Inter' },
  approval: { niveis: 1, aprovacaoPorValor: false, valorAlcada: '', aprovacaoPorSetor: false, autoAprovarAbaixo: '', aprovacaoObrigatoria: true },
  purchasing: { numeracaoAutomatica: true, prefixo: '#', slaHorasMaquinaParada: '4', slaHorasUrgente: '24', prioridadePadrao: 'Não Urgente', categorias: ['Manutenção Geral', 'Produção', 'EPI', 'Escritório', 'TI', 'Logística'], centrosCusto: ['Produção', 'Manutenção', 'Administrativo', 'TI', 'RH', 'Logística'], tiposSolicitacao: ['Material', 'Serviço'] },
  suppliers: { categorias: [], criterioPrazo: 40, criterioPreco: 40, criterioQualidade: 20, prazoAlvoDias: '7', homologacaoObrigatoria: false, bloqueados: [] },
  notifications: { pushEnabled: true, ntfyTopic: 'clleao9274', emailEnabled: false, whatsappEnabled: false, evAprovacao: true, evReprovacao: true, evCompras: true, evRecebimento: true, evNovas: true },
  security: { mfa: false, sessaoMinutos: '480', ipPermitido: '', sso: false },
  customization: { nomeSistema: 'Compras Leão', rodape: '', idioma: 'Português (Brasil)', fuso: 'America/Sao_Paulo', formatoData: 'DD/MM/AAAA', formatoMoeda: 'R$ 1.234,56' },
  profiles: defaultProfiles(),
  apiKeys: [],
  backups: [],
  autoBackup: false,
};

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_SETTINGS, ...parsed,
        company: { ...DEFAULT_SETTINGS.company, ...parsed.company },
        branding: { ...DEFAULT_SETTINGS.branding, ...parsed.branding },
        approval: { ...DEFAULT_SETTINGS.approval, ...parsed.approval },
        purchasing: { ...DEFAULT_SETTINGS.purchasing, ...parsed.purchasing },
        suppliers: { ...DEFAULT_SETTINGS.suppliers, ...parsed.suppliers },
        notifications: { ...DEFAULT_SETTINGS.notifications, ...parsed.notifications },
        security: { ...DEFAULT_SETTINGS.security, ...parsed.security },
        customization: { ...DEFAULT_SETTINGS.customization, ...parsed.customization },
        profiles: parsed.profiles ?? defaultProfiles(),
      };
    }
  } catch { /* volta ao padrão */ }
  return DEFAULT_SETTINGS;
}

/* ================================================================== */
/* Seções                                                              */
/* ================================================================== */
type SectionKey =
  | 'geral' | 'identidade' | 'usuarios' | 'perfis' | 'aprovacao' | 'compras'
  | 'fornecedores' | 'notificacoes' | 'integracoes' | 'seguranca' | 'backup'
  | 'personalizacao' | 'auditoria' | 'api' | 'banco';

const SECTIONS: { key: SectionKey; label: string; icon: typeof Building2; critical?: boolean; keywords: string }[] = [
  { key: 'geral', label: 'Geral', icon: Building2, keywords: 'empresa cnpj razão social endereço telefone email' },
  { key: 'identidade', label: 'Identidade Visual', icon: Palette, keywords: 'logo cor tema fonte marca claro escuro' },
  { key: 'usuarios', label: 'Usuários', icon: Users, critical: true, keywords: 'usuário senha cargo criar editar excluir' },
  { key: 'perfis', label: 'Perfis e Permissões', icon: ShieldCheck, critical: true, keywords: 'permissão perfil administrador módulo acesso' },
  { key: 'aprovacao', label: 'Fluxo de Aprovação', icon: GitBranch, keywords: 'aprovação alçada valor aprovador nível' },
  { key: 'compras', label: 'Compras', icon: ShoppingCart, keywords: 'numeração prefixo sla prioridade categoria centro de custo' },
  { key: 'fornecedores', label: 'Fornecedores', icon: Truck, keywords: 'fornecedor avaliação score homologação bloqueio' },
  { key: 'notificacoes', label: 'Notificações', icon: Bell, keywords: 'notificação push email whatsapp ntfy alerta' },
  { key: 'integracoes', label: 'Integrações', icon: Plug, keywords: 'erp api webhook smtp google microsoft slack teams power bi' },
  { key: 'seguranca', label: 'Segurança', icon: Lock, critical: true, keywords: 'mfa sessão ip sso login auditoria log' },
  { key: 'backup', label: 'Backup', icon: DatabaseBackup, critical: true, keywords: 'backup restauração download exportar importar' },
  { key: 'personalizacao', label: 'Personalização', icon: SlidersHorizontal, keywords: 'idioma fuso horário formato data moeda rodapé' },
  { key: 'auditoria', label: 'Auditoria', icon: ScrollText, critical: true, keywords: 'auditoria log alteração histórico quem alterou' },
  { key: 'api', label: 'API', icon: KeyRound, critical: true, keywords: 'api chave token webhook documentação' },
  { key: 'banco', label: 'Banco de Dados', icon: Database, critical: true, keywords: 'banco dados espaço integridade registros' },
];

/* ================================================================== */
/* Componentes reutilizáveis                                           */
/* ================================================================== */
function Field({ label, value, onChange, placeholder, type = 'text', span }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; span?: boolean;
}) {
  return (
    <div className={span ? 'sm:col-span-2' : ''}>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white"
      />
    </div>
  );
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex items-center justify-between gap-3 py-2.5 border-b border-slate-50 last:border-0 cursor-pointer group">
      <span>
        <span className="text-sm text-slate-700 font-medium">{label}</span>
        {hint && <span className="block text-xs text-slate-400 mt-0.5">{hint}</span>}
      </span>
      <button
        type="button" role="switch" aria-checked={checked} aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-violet-600' : 'bg-slate-200'}`}
      >
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
    </label>
  );
}

function TagEditor({ label, tags, onChange, placeholder }: { label: string; tags: string[]; onChange: (t: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setDraft('');
  };
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.length === 0 && <span className="text-xs text-slate-400">Nenhum item cadastrado.</span>}
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 bg-violet-50 text-violet-700 text-xs font-medium px-2 py-1 rounded-lg">
            {t}
            <button onClick={() => onChange(tags.filter((x) => x !== t))} aria-label={`Remover ${t}`} className="hover:text-red-600">
              <X size={11} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder ?? 'Adicionar...'}
          className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
        <button onClick={add} className="flex items-center gap-1 text-xs text-violet-600 border border-violet-200 hover:border-violet-400 px-2.5 py-1.5 rounded-lg font-medium">
          <Plus size={12} /> Adicionar
        </button>
      </div>
    </div>
  );
}

function Card({ title, children, subtitle }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <h3 className="font-semibold text-slate-700 text-sm">{title}</h3>
      {subtitle && <p className="text-xs text-slate-400 mt-0.5 mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </div>
  );
}

function PendingBanner({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
      <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
      <p className="text-xs text-amber-700">{text}</p>
    </div>
  );
}

function NoPermission() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
      <Lock size={28} className="text-slate-300 mx-auto mb-3" />
      <h3 className="font-semibold text-slate-700 mb-1">Acesso restrito</h3>
      <p className="text-sm text-slate-400">Apenas usuários com perfil de <strong>Gestor (administrador)</strong> podem acessar esta configuração.</p>
    </div>
  );
}

/* ================================================================== */
/* Página                                                              */
/* ================================================================== */
interface SettingsPageProps {
  currentUser: AppUser;
  requests: PurchaseRequest[];
}

export function SettingsPage({ currentUser, requests }: SettingsPageProps) {
  const isAdmin = currentUser.role === 'gestor';
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<SectionKey>('geral');
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState<SectionKey[]>(() => {
    try { return JSON.parse(localStorage.getItem('compras-leao-fav-settings') ?? '[]'); } catch { return []; }
  });
  const [recents, setRecents] = useState<SectionKey[]>([]);
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving'>('saved');
  const [toast, setToast] = useState<string | null>(null);
  const [users, setUsers] = useState<AppUser[]>(loadUsers);
  const firstRender = useRef(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 350);
    return () => clearTimeout(t);
  }, []);

  // Salvamento automático com debounce
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    setSaveState('dirty');
    const t = setTimeout(() => {
      setSaveState('saving');
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      setTimeout(() => setSaveState('saved'), 300);
    }, 700);
    return () => clearTimeout(t);
  }, [settings]);

  useEffect(() => {
    localStorage.setItem('compras-leao-fav-settings', JSON.stringify(favorites));
  }, [favorites]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const openSection = (key: SectionKey) => {
    setActive(key);
    setRecents((prev) => [key, ...prev.filter((k) => k !== key)].slice(0, 3));
  };

  const patch = <K extends keyof AppSettings>(key: K, value: Partial<AppSettings[K]>) =>
    setSettings((s) => ({ ...s, [key]: typeof s[key] === 'object' && !Array.isArray(s[key]) ? { ...(s[key] as object), ...(value as object) } : value } as AppSettings));

  const visibleSections = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? SECTIONS.filter((s) => s.label.toLowerCase().includes(q) || s.keywords.includes(q)) : SECTIONS;
    return [...list].sort((a, b) => Number(favorites.includes(b.key)) - Number(favorites.includes(a.key)));
  }, [search, favorites]);

  const activeSection = SECTIONS.find((s) => s.key === active)!;
  const blocked = activeSection.critical && !isAdmin;

  const persistUsers = (next: AppUser[]) => { setUsers(next); saveUsers(next); };

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen lg:pl-60 bg-slate-50">
        <Header title="Configurações" subtitle="Central de configurações do sistema" requests={requests} />
        <div className="flex-1 pt-16 px-6 py-6 animate-pulse" aria-busy="true">
          <div className="flex gap-5">
            <div className="w-60 space-y-2">{Array.from({ length: 10 }).map((_, i) => <div key={i} className="h-9 bg-slate-200/60 rounded-xl" />)}</div>
            <div className="flex-1 space-y-4">
              <div className="h-8 w-64 bg-slate-200/60 rounded-lg" />
              <div className="h-72 bg-slate-200/60 rounded-2xl" />
              <div className="h-48 bg-slate-200/60 rounded-2xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen lg:pl-60 bg-slate-50">
      <Header title="Configurações" subtitle="Central de configurações do sistema" requests={requests} />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-800 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2">
          <CheckCircle2 size={15} className="text-emerald-400" /> {toast}
        </div>
      )}

      <div className="flex-1 pt-16 px-4 md:px-6 py-6">
        <div className="flex flex-col md:flex-row gap-5 items-start">

          {/* Sidebar interna */}
          <aside className="w-full md:w-60 flex-shrink-0 md:sticky md:top-20">
            <div className="relative mb-3">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar configurações..." aria-label="Pesquisar configurações"
                className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            {recents.length > 0 && !search && (
              <div className="mb-3 px-1">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Recentes</p>
                <div className="flex flex-wrap gap-1">
                  {recents.map((k) => {
                    const s = SECTIONS.find((x) => x.key === k)!;
                    return (
                      <button key={k} onClick={() => openSection(k)}
                        className="text-[11px] bg-white border border-slate-200 hover:border-violet-300 rounded-lg px-2 py-1 text-slate-600">
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <nav className="bg-white border border-slate-200 rounded-2xl p-2 space-y-0.5 max-h-[65vh] overflow-y-auto">
              {visibleSections.length === 0 && <p className="text-xs text-slate-400 text-center py-4">Nada encontrado.</p>}
              {visibleSections.map(({ key, label, icon: Icon, critical }) => (
                <div key={key} className={`group flex items-center rounded-xl transition-colors ${active === key ? 'bg-violet-50' : 'hover:bg-slate-50'}`}>
                  <button onClick={() => openSection(key)}
                    className={`flex-1 flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-left ${active === key ? 'text-violet-700' : 'text-slate-600'}`}>
                    <Icon size={15} className={active === key ? 'text-violet-600' : 'text-slate-400'} />
                    <span className="flex-1 truncate">{label}</span>
                    {critical && <Lock size={10} className="text-slate-300" />}
                  </button>
                  <button
                    onClick={() => setFavorites((f) => f.includes(key) ? f.filter((x) => x !== key) : [...f, key])}
                    aria-label={`Favoritar ${label}`}
                    className={`pr-2.5 ${favorites.includes(key) ? 'text-amber-400' : 'text-slate-200 opacity-0 group-hover:opacity-100'} transition-opacity`}
                  >
                    <Star size={13} fill={favorites.includes(key) ? 'currentColor' : 'none'} />
                  </button>
                </div>
              ))}
            </nav>
          </aside>

          {/* Conteúdo */}
          <main className="flex-1 min-w-0 w-full space-y-4">
            {/* Breadcrumb + estado de salvamento */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1.5 text-sm">
                <span className="text-slate-400">Configurações</span>
                <ChevronRight size={13} className="text-slate-300" />
                <span className="font-semibold text-slate-700">{activeSection.label}</span>
              </div>
              <span className={`flex items-center gap-1.5 text-xs font-medium ${
                saveState === 'saved' ? 'text-emerald-600' : saveState === 'saving' ? 'text-slate-400' : 'text-amber-600'
              }`}>
                {saveState === 'saved' ? <><CheckCircle2 size={13} /> Tudo salvo</> :
                 saveState === 'saving' ? <><Clock size={13} /> Salvando...</> :
                 <><AlertTriangle size={13} /> Alterações não salvas</>}
              </span>
            </div>

            {blocked ? <NoPermission /> : (
              <>
                {active === 'geral' && <GeneralSection settings={settings} patch={patch} />}
                {active === 'identidade' && <BrandingSection settings={settings} patch={patch} />}
                {active === 'usuarios' && <UsersSection users={users} persist={persistUsers} currentUser={currentUser} showToast={showToast} />}
                {active === 'perfis' && <ProfilesSection settings={settings} setSettings={setSettings} />}
                {active === 'aprovacao' && <ApprovalSection settings={settings} patch={patch} />}
                {active === 'compras' && <PurchasingSection settings={settings} patch={patch} />}
                {active === 'fornecedores' && <SuppliersSection settings={settings} patch={patch} />}
                {active === 'notificacoes' && <NotificationsSection settings={settings} patch={patch} />}
                {active === 'integracoes' && <IntegrationsSection />}
                {active === 'seguranca' && <SecuritySection settings={settings} patch={patch} users={users} />}
                {active === 'backup' && <BackupSection settings={settings} setSettings={setSettings} showToast={showToast} />}
                {active === 'personalizacao' && <CustomizationSection settings={settings} patch={patch} />}
                {active === 'auditoria' && <AuditSection requests={requests} />}
                {active === 'api' && <ApiSection settings={settings} setSettings={setSettings} showToast={showToast} />}
                {active === 'banco' && <DatabaseSection requests={requests} users={users} settings={settings} />}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Seções                                                              */
/* ================================================================== */
type PatchFn = <K extends keyof AppSettings>(key: K, value: Partial<AppSettings[K]>) => void;

function GeneralSection({ settings, patch }: { settings: AppSettings; patch: PatchFn }) {
  const c = settings.company;
  const set = (field: keyof AppSettings['company']) => (v: string) => patch('company', { [field]: v });
  return (
    <div className="space-y-4">
      <Card title="Dados da Empresa" subtitle="Informações cadastrais utilizadas em documentos e relatórios">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nome da empresa" value={c.nome} onChange={set('nome')} />
          <Field label="Nome fantasia" value={c.fantasia} onChange={set('fantasia')} />
          <Field label="Razão Social" value={c.razaoSocial} onChange={set('razaoSocial')} span />
          <Field label="CNPJ" value={c.cnpj} onChange={set('cnpj')} placeholder="00.000.000/0000-00" />
          <Field label="Inscrição Estadual" value={c.ie} onChange={set('ie')} />
        </div>
      </Card>
      <Card title="Endereço">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Endereço" value={c.endereco} onChange={set('endereco')} span />
          <Field label="Cidade" value={c.cidade} onChange={set('cidade')} />
          <Field label="Estado" value={c.estado} onChange={set('estado')} />
          <Field label="CEP" value={c.cep} onChange={set('cep')} placeholder="00000-000" />
          <Field label="País" value={c.pais} onChange={set('pais')} />
        </div>
      </Card>
      <Card title="Contato">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Telefone" value={c.telefone} onChange={set('telefone')} placeholder="(00) 0000-0000" />
          <Field label="WhatsApp" value={c.whatsapp} onChange={set('whatsapp')} placeholder="(00) 90000-0000" />
          <Field label="E-mail" value={c.email} onChange={set('email')} type="email" />
          <Field label="Website" value={c.website} onChange={set('website')} placeholder="https://" />
        </div>
      </Card>
      <Card title="Logo e Favicon">
        <PendingBanner text="Upload de arquivos requer o backend (armazenamento). A estrutura já está pronta — os campos serão habilitados na integração." />
      </Card>
    </div>
  );
}

function BrandingSection({ settings, patch }: { settings: AppSettings; patch: PatchFn }) {
  const b = settings.branding;
  return (
    <div className="space-y-4">
      <Card title="Cores e Tema" subtitle="As cores escolhidas são aplicadas no preview ao lado; a aplicação global ocorre na integração do tema">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Cor primária</label>
              <div className="flex items-center gap-2">
                <input type="color" value={b.primaryColor} onChange={(e) => patch('branding', { primaryColor: e.target.value })}
                  aria-label="Cor primária" className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer" />
                <input value={b.primaryColor} onChange={(e) => patch('branding', { primaryColor: e.target.value })}
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-violet-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Cor secundária</label>
              <div className="flex items-center gap-2">
                <input type="color" value={b.secondaryColor} onChange={(e) => patch('branding', { secondaryColor: e.target.value })}
                  aria-label="Cor secundária" className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer" />
                <input value={b.secondaryColor} onChange={(e) => patch('branding', { secondaryColor: e.target.value })}
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-violet-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Tema</label>
              <div className="flex gap-2">
                {(['claro', 'escuro'] as const).map((t) => (
                  <button key={t} onClick={() => patch('branding', { theme: t })}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors capitalize ${
                      b.theme === t ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'
                    }`}>
                    Modo {t}
                  </button>
                ))}
              </div>
              {b.theme === 'escuro' && <p className="text-xs text-amber-600 mt-1.5">O modo escuro global será aplicado na próxima fase — a preferência já fica salva.</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Fonte</label>
              <select value={b.font} onChange={(e) => patch('branding', { font: e.target.value })}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500">
                {['Inter', 'Roboto', 'Open Sans', 'Poppins', 'Lato'].map((f) => <option key={f}>{f}</option>)}
              </select>
            </div>
          </div>

          {/* Preview em tempo real */}
          <div className={`rounded-2xl border p-4 ${b.theme === 'escuro' ? 'bg-slate-900 border-slate-700' : 'bg-slate-50 border-slate-200'}`}
            style={{ fontFamily: b.font }}>
            <p className={`text-[10px] font-semibold uppercase tracking-wide mb-3 ${b.theme === 'escuro' ? 'text-slate-400' : 'text-slate-400'}`}>Preview em tempo real</p>
            <div className={`rounded-xl p-4 shadow-sm border ${b.theme === 'escuro' ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: b.primaryColor }}>
                  <ShoppingCart size={15} className="text-white" />
                </div>
                <div>
                  <p className={`text-sm font-bold ${b.theme === 'escuro' ? 'text-white' : 'text-slate-800'}`}>{settings.customization.nomeSistema}</p>
                  <p className={`text-[10px] ${b.theme === 'escuro' ? 'text-slate-400' : 'text-slate-400'}`}>Gestão de Compras</p>
                </div>
              </div>
              <button className="w-full text-white text-xs font-medium py-2 rounded-lg mb-2" style={{ backgroundColor: b.primaryColor }}>
                Nova Solicitação
              </button>
              <button className="w-full text-xs font-medium py-2 rounded-lg border"
                style={{ color: b.secondaryColor, borderColor: b.secondaryColor + '40' }}>
                Ação secundária
              </button>
              <div className="flex gap-1.5 mt-3">
                <span className="text-[10px] px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: b.primaryColor }}>Badge</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${b.theme === 'escuro' ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-600'}`}>Neutro</span>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function UsersSection({ users, persist, currentUser, showToast }: {
  users: AppUser[]; persist: (u: AppUser[]) => void; currentUser: AppUser; showToast: (m: string) => void;
}) {
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AppUser | null>(null);
  const [showPwd, setShowPwd] = useState(false);
  const [formError, setFormError] = useState('');

  const roleLabel: Record<Role, string> = { gestor: 'Gestor', comprador: 'Comprador', solicitante: 'Solicitante' };

  const startNew = () => {
    setIsNew(true);
    setFormError('');
    setEditing({ id: `u-${Date.now()}`, name: '', email: '', password: '', role: 'solicitante', initials: '', active: true });
  };

  const save = () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name || !editing.password.trim()) {
      setFormError('Nome e senha são obrigatórios.');
      return;
    }
    if (editing.password.trim().length < 4) {
      setFormError('A senha deve ter pelo menos 4 caracteres.');
      return;
    }
    const duplicate = users.some((u) => u.id !== editing.id && u.name.trim().toLowerCase() === name.toLowerCase());
    if (duplicate) {
      setFormError(`Já existe um usuário chamado "${name}" — o login é feito pelo nome, então ele precisa ser único.`);
      return;
    }
    if (editing.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editing.email)) {
      setFormError('E-mail inválido.');
      return;
    }
    // Não permitir remover o último gestor ativo (trava de segurança do fluxo de aprovação)
    if (!isNew) {
      const original = users.find((u) => u.id === editing.id);
      const otherActiveGestor = users.some((u) => u.id !== editing.id && u.role === 'gestor' && u.active !== false);
      if (original?.role === 'gestor' && (editing.role !== 'gestor' || editing.active === false) && !otherActiveGestor) {
        setFormError('Este é o único gestor ativo — cadastre outro gestor antes de alterar o cargo ou desativá-lo.');
        return;
      }
    }
    const initials = name.slice(0, 2).toUpperCase();
    const final = { ...editing, name, email: editing.email?.trim() || undefined, initials };
    persist(isNew ? [...users, final] : users.map((u) => (u.id === final.id ? final : u)));
    showToast(isNew ? 'Usuário criado com sucesso' : 'Usuário atualizado');
    setEditing(null); setIsNew(false); setFormError('');
  };

  return (
    <div className="space-y-4">
      <Card title="Usuários do Sistema" subtitle="Estes usuários acessam o login do sistema — as alterações valem imediatamente">
        <div className="flex justify-end mb-3">
          <button onClick={startNew}
            className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white px-3 py-2 rounded-lg text-xs font-medium">
            <Plus size={13} /> Criar Usuário
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['Nome', 'Cargo', 'E-mail', 'Último acesso', 'Status', 'Ações'].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2.5 text-xs font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70">
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                        style={{ backgroundColor: colorFromInitials(u.initials) }}>{u.initials}</span>
                      <span className="text-sm font-medium text-slate-700">{u.name}{u.id === currentUser.id && <span className="text-[10px] text-violet-500 ml-1">(você)</span>}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                      u.role === 'gestor' ? 'bg-emerald-100 text-emerald-700' : u.role === 'comprador' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'
                    }`}>{roleLabel[u.role]}</span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{u.email || '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{u.lastLogin ? new Date(u.lastLogin).toLocaleString('pt-BR') : 'Nunca acessou'}</td>
                  <td className="px-3 py-2.5">
                    {u.active !== false ? (
                      <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium"><CheckCircle2 size={12} /> Ativo</span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] text-slate-400 font-medium"><CircleOff size={12} /> Inativo</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setIsNew(false); setFormError(''); setEditing(u); }} title="Editar" aria-label={`Editar ${u.name}`}
                        className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg"><Pencil size={13} /></button>
                      <button
                        onClick={() => {
                          if (u.id === currentUser.id) { showToast('Você não pode desativar a si mesmo'); return; }
                          if (u.role === 'gestor' && u.active !== false && !users.some((x) => x.id !== u.id && x.role === 'gestor' && x.active !== false)) {
                            showToast('Não é possível desativar o único gestor ativo');
                            return;
                          }
                          persist(users.map((x) => x.id === u.id ? { ...x, active: x.active === false } : x));
                          showToast(u.active !== false ? 'Usuário desativado' : 'Usuário ativado');
                        }}
                        title={u.active !== false ? 'Desativar' : 'Ativar'} aria-label={`${u.active !== false ? 'Desativar' : 'Ativar'} ${u.name}`}
                        className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg">
                        {u.active !== false ? <CircleOff size={13} /> : <CheckCircle2 size={13} />}
                      </button>
                      <button
                        onClick={() => {
                          if (u.id === currentUser.id) { showToast('Você não pode excluir a si mesmo'); return; }
                          if (u.role === 'gestor' && u.active !== false && !users.some((x) => x.id !== u.id && x.role === 'gestor' && x.active !== false)) {
                            showToast('Não é possível excluir o único gestor ativo');
                            return;
                          }
                          setConfirmDelete(u);
                        }}
                        title="Excluir" aria-label={`Excluir ${u.name}`}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal de edição/criação */}
      {editing && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">{isNew ? 'Criar Usuário' : `Editar ${editing.name}`}</h3>
              <button onClick={() => setEditing(null)} aria-label="Fechar" className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <Field label="Nome (usado no login)" value={editing.name} onChange={(v) => setEditing({ ...editing, name: v })} />
              <Field label="E-mail" value={editing.email ?? ''} onChange={(v) => setEditing({ ...editing, email: v })} type="email" />
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Senha</label>
                <div className="relative">
                  <input type={showPwd ? 'text' : 'password'} value={editing.password}
                    onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
                  <button onClick={() => setShowPwd((v) => !v)} aria-label="Mostrar senha"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {!isNew && (
                  <button onClick={() => setEditing({ ...editing, password: '1221' })}
                    className="text-[11px] text-violet-600 hover:text-violet-800 mt-1 flex items-center gap-1">
                    <RotateCcw size={10} /> Resetar senha para padrão (1221)
                  </button>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Cargo / Perfil</label>
                <select value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value as Role })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500">
                  <option value="gestor">Gestor — aprova solicitações</option>
                  <option value="comprador">Comprador — movimenta o fluxo e cancela</option>
                  <option value="solicitante">Solicitante — cria solicitações</option>
                </select>
              </div>
              <Toggle label="Usuário ativo" checked={editing.active !== false} onChange={(v) => setEditing({ ...editing, active: v })} />
            </div>
            {formError && (
              <div className="mt-3 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertTriangle size={13} className="text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{formError}</p>
              </div>
            )}
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancelar</button>
              <button onClick={save} disabled={!editing.name.trim() || !editing.password.trim()}
                className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium">
                <Check size={14} /> Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação de exclusão */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 text-center" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true">
            <AlertTriangle size={26} className="text-red-500 mx-auto mb-2" />
            <h3 className="font-semibold text-slate-800 mb-1">Excluir {confirmDelete.name}?</h3>
            <p className="text-sm text-slate-500 mb-4">Esta ação é permanente e o usuário perderá o acesso ao sistema.</p>
            <div className="flex justify-center gap-2">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancelar</button>
              <button onClick={() => {
                persist(users.filter((x) => x.id !== confirmDelete.id));
                showToast('Usuário excluído');
                setConfirmDelete(null);
              }} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium">Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProfilesSection({ settings, setSettings }: { settings: AppSettings; setSettings: React.Dispatch<React.SetStateAction<AppSettings>> }) {
  const toggle = (profile: string, module: string) =>
    setSettings((s) => ({
      ...s,
      profiles: { ...s.profiles, [profile]: { ...s.profiles[profile], [module]: !s.profiles[profile]?.[module] } },
    }));
  return (
    <div className="space-y-4">
      <PendingBanner text="Hoje o login usa 3 perfis ativos (Gestor, Comprador, Solicitante). Os demais perfis e esta matriz de permissões já ficam salvos e serão aplicados na integração com o backend." />
      <Card title="Matriz de Permissões por Módulo" subtitle="Marque quais módulos cada perfil pode acessar">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th scope="col" className="px-3 py-2.5 text-xs font-semibold text-slate-500">Perfil</th>
                {MODULES.map((m) => (
                  <th key={m} scope="col" className="px-2 py-2.5 text-[10px] font-semibold text-slate-500 text-center whitespace-nowrap">{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PROFILE_NAMES.map((p) => (
                <tr key={p} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70">
                  <td className="px-3 py-2 text-xs font-semibold text-slate-700 whitespace-nowrap">
                    {p}
                    {['Gestor', 'Comprador', 'Solicitante'].includes(p) && <span className="ml-1.5 text-[9px] text-emerald-600 font-medium">ativo</span>}
                  </td>
                  {MODULES.map((m) => (
                    <td key={m} className="px-2 py-2 text-center">
                      <input type="checkbox" checked={!!settings.profiles[p]?.[m]} onChange={() => toggle(p, m)}
                        aria-label={`${p} — ${m}`} className="accent-violet-600 cursor-pointer" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ApprovalSection({ settings, patch }: { settings: AppSettings; patch: PatchFn }) {
  const a = settings.approval;
  return (
    <div className="space-y-4">
      <Card title="Regras de Aprovação" subtitle="Regras aplicadas à etapa 'Em Aprovação' do Kanban">
        <Toggle label="Aprovação obrigatória" hint="Toda solicitação precisa passar pelo gestor antes da cotação (regra ativa hoje no fluxo)"
          checked={a.aprovacaoObrigatoria} onChange={(v) => patch('approval', { aprovacaoObrigatoria: v })} />
        <Toggle label="Aprovação por valor (alçada)" hint="Solicitações acima do valor de alçada exigem aprovação"
          checked={a.aprovacaoPorValor} onChange={(v) => patch('approval', { aprovacaoPorValor: v })} />
        {a.aprovacaoPorValor && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-3">
            <Field label="Valor de alçada do gestor (R$)" value={a.valorAlcada} onChange={(v) => patch('approval', { valorAlcada: v })} placeholder="5000" type="number" />
            <Field label="Auto-aprovar abaixo de (R$)" value={a.autoAprovarAbaixo} onChange={(v) => patch('approval', { autoAprovarAbaixo: v })} placeholder="500" type="number" />
          </div>
        )}
        <Toggle label="Aprovação por setor / centro de custo" hint="Cada setor tem seu próprio aprovador responsável"
          checked={a.aprovacaoPorSetor} onChange={(v) => patch('approval', { aprovacaoPorSetor: v })} />
        <div className="py-3">
          <label className="block text-xs font-medium text-slate-600 mb-1">Quantidade de níveis de aprovação</label>
          <select value={a.niveis} onChange={(e) => patch('approval', { niveis: Number(e.target.value) })}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500">
            <option value={1}>1 nível — gestor (atual)</option>
            <option value={2}>2 níveis — gestor → diretor</option>
            <option value={3}>3 níveis — gestor → diretor → financeiro</option>
          </select>
          {a.niveis > 1 && <p className="text-xs text-amber-600 mt-1.5">Múltiplos níveis serão aplicados ao fluxo na integração com o backend — a configuração já fica salva.</p>}
        </div>
      </Card>
    </div>
  );
}

function PurchasingSection({ settings, patch }: { settings: AppSettings; patch: PatchFn }) {
  const p = settings.purchasing;
  return (
    <div className="space-y-4">
      <Card title="Numeração e Prazos">
        <Toggle label="Numeração automática" hint={`Formato atual: ${p.prefixo}001/MM/AA reiniciando a cada mês`}
          checked={p.numeracaoAutomatica} onChange={(v) => patch('purchasing', { numeracaoAutomatica: v })} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-3">
          <Field label="Prefixo" value={p.prefixo} onChange={(v) => patch('purchasing', { prefixo: v })} />
          <Field label="SLA Máquina Parada (horas)" value={p.slaHorasMaquinaParada} onChange={(v) => patch('purchasing', { slaHorasMaquinaParada: v })} type="number" />
          <Field label="SLA Urgente (horas)" value={p.slaHorasUrgente} onChange={(v) => patch('purchasing', { slaHorasUrgente: v })} type="number" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Prioridade padrão de novas solicitações</label>
          <select value={p.prioridadePadrao} onChange={(e) => patch('purchasing', { prioridadePadrao: e.target.value })}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500">
            {['Não Urgente', 'Urgente', 'Máquina Parada'].map((x) => <option key={x}>{x}</option>)}
          </select>
        </div>
      </Card>
      <Card title="Listas do Processo" subtitle="Categorias e centros de custo usados nos formulários e relatórios">
        <div className="space-y-5">
          <TagEditor label="Categorias (aplicação)" tags={p.categorias} onChange={(t) => patch('purchasing', { categorias: t })} />
          <TagEditor label="Centros de custo (setores)" tags={p.centrosCusto} onChange={(t) => patch('purchasing', { centrosCusto: t })} />
          <TagEditor label="Tipos de solicitação" tags={p.tiposSolicitacao} onChange={(t) => patch('purchasing', { tiposSolicitacao: t })} />
        </div>
      </Card>
      <Card title="Status Personalizados">
        <PendingBanner text="As 9 colunas atuais do Kanban são fixas para garantir a consistência do fluxo. Status personalizados serão liberados junto com o backend, usando esta configuração." />
      </Card>
    </div>
  );
}

function SuppliersSection({ settings, patch }: { settings: AppSettings; patch: PatchFn }) {
  const s = settings.suppliers;
  const totalScore = s.criterioPrazo + s.criterioPreco + s.criterioQualidade;
  const slider = (label: string, field: 'criterioPrazo' | 'criterioPreco' | 'criterioQualidade') => (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-600 font-medium">{label}</span>
        <span className="font-bold text-slate-800">{s[field]}%</span>
      </div>
      <input type="range" min={0} max={100} step={5} value={s[field]} aria-label={label}
        onChange={(e) => patch('suppliers', { [field]: Number(e.target.value) })}
        className="w-full accent-violet-600" />
    </div>
  );
  return (
    <div className="space-y-4">
      <Card title="Critérios de Avaliação (Score)" subtitle="Pesos usados para calcular o score dos fornecedores nos relatórios">
        <div className="space-y-4">
          {slider('Prazo de entrega', 'criterioPrazo')}
          {slider('Preço', 'criterioPreco')}
          {slider('Qualidade', 'criterioQualidade')}
          <p className={`text-xs font-medium ${totalScore === 100 ? 'text-emerald-600' : 'text-red-500'}`}>
            Soma dos pesos: {totalScore}% {totalScore !== 100 && '— ajuste para totalizar 100%'}
          </p>
        </div>
      </Card>
      <Card title="Política de Fornecedores">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
          <Field label="Prazo médio de entrega alvo (dias)" value={s.prazoAlvoDias} onChange={(v) => patch('suppliers', { prazoAlvoDias: v })} type="number" />
        </div>
        <Toggle label="Homologação obrigatória" hint="Novos fornecedores precisam ser homologados antes da primeira compra"
          checked={s.homologacaoObrigatoria} onChange={(v) => patch('suppliers', { homologacaoObrigatoria: v })} />
        <div className="pt-4 space-y-5">
          <TagEditor label="Categorias de fornecedor" tags={s.categorias} onChange={(t) => patch('suppliers', { categorias: t })} placeholder="Ex.: Rolamentos, EPIs, Papelaria..." />
          <TagEditor label="Fornecedores bloqueados" tags={s.bloqueados} onChange={(t) => patch('suppliers', { bloqueados: t })} placeholder="Nome do fornecedor a bloquear" />
        </div>
      </Card>
    </div>
  );
}

function NotificationsSection({ settings, patch }: { settings: AppSettings; patch: PatchFn }) {
  const n = settings.notifications;
  return (
    <div className="space-y-4">
      <Card title="Canais" subtitle="O push via ntfy está ativo hoje; e-mail e WhatsApp dependem do backend">
        <Toggle label="Push (ntfy)" hint="Notificações no celular via aplicativo ntfy" checked={n.pushEnabled} onChange={(v) => patch('notifications', { pushEnabled: v })} />
        {n.pushEnabled && (
          <div className="py-3">
            <Field label="Tópico ntfy" value={n.ntfyTopic} onChange={(v) => patch('notifications', { ntfyTopic: v })} />
            <p className="text-[11px] text-slate-400 mt-1">Assine este tópico no app ntfy (Android/iOS) para receber os alertas.</p>
          </div>
        )}
        <Toggle label="E-mail" hint="Requer configuração SMTP no backend" checked={n.emailEnabled} onChange={(v) => patch('notifications', { emailEnabled: v })} />
        <Toggle label="WhatsApp" hint="Requer integração com API oficial no backend" checked={n.whatsappEnabled} onChange={(v) => patch('notifications', { whatsappEnabled: v })} />
      </Card>
      <Card title="Eventos Notificados">
        <Toggle label="Novas solicitações" checked={n.evNovas} onChange={(v) => patch('notifications', { evNovas: v })} />
        <Toggle label="Aprovação" checked={n.evAprovacao} onChange={(v) => patch('notifications', { evAprovacao: v })} />
        <Toggle label="Reprovação / objeções" checked={n.evReprovacao} onChange={(v) => patch('notifications', { evReprovacao: v })} />
        <Toggle label="Compras (avanço de status)" checked={n.evCompras} onChange={(v) => patch('notifications', { evCompras: v })} />
        <Toggle label="Recebimento / entrega" checked={n.evRecebimento} onChange={(v) => patch('notifications', { evRecebimento: v })} />
      </Card>
    </div>
  );
}

function IntegrationsSection() {
  const integrations = [
    { name: 'ERP', desc: 'Sincronize solicitações e pedidos com seu ERP' },
    { name: 'API REST', desc: 'Integração via API própria do sistema' },
    { name: 'Webhook', desc: 'Dispare eventos para sistemas externos' },
    { name: 'SMTP', desc: 'Servidor de e-mail para notificações' },
    { name: 'Microsoft 365', desc: 'Login e calendário Microsoft' },
    { name: 'Google Workspace', desc: 'Login e agenda Google' },
    { name: 'Slack', desc: 'Alertas em canais do Slack' },
    { name: 'Microsoft Teams', desc: 'Alertas em canais do Teams' },
    { name: 'Power BI', desc: 'Conecte os dados aos seus dashboards' },
  ];
  return (
    <div className="space-y-4">
      <PendingBanner text="As integrações dependem do backend e serão habilitadas na próxima fase. Esta área já está pronta para recebê-las." />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {integrations.map((i) => (
          <div key={i.name} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                <Plug size={15} className="text-slate-400" />
              </div>
              <h4 className="text-sm font-semibold text-slate-700">{i.name}</h4>
            </div>
            <p className="text-xs text-slate-400 mb-3">{i.desc}</p>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Não conectado</span>
              <button disabled className="text-xs text-slate-300 border border-slate-200 px-2.5 py-1 rounded-lg cursor-not-allowed" title="Disponível após integração com o backend">
                Conectar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SecuritySection({ settings, patch, users }: { settings: AppSettings; patch: PatchFn; users: AppUser[] }) {
  const s = settings.security;
  const logins = users.filter((u) => u.lastLogin).sort((a, b) => (b.lastLogin! > a.lastLogin! ? 1 : -1));
  return (
    <div className="space-y-4">
      <Card title="Políticas de Acesso" subtitle="As políticas ficam salvas e passam a valer com a autenticação do backend">
        <Toggle label="Autenticação em dois fatores (MFA)" hint="Exigir segundo fator no login" checked={s.mfa} onChange={(v) => patch('security', { mfa: v })} />
        <Toggle label="Login único (SSO)" hint="Autenticação via provedor corporativo" checked={s.sso} onChange={(v) => patch('security', { sso: v })} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-3">
          <Field label="Expiração da sessão (minutos)" value={s.sessaoMinutos} onChange={(v) => patch('security', { sessaoMinutos: v })} type="number" />
          <Field label="IPs permitidos (separados por vírgula)" value={s.ipPermitido} onChange={(v) => patch('security', { ipPermitido: v })} placeholder="Todos" />
        </div>
      </Card>
      <Card title="Histórico de Login" subtitle="Último acesso registrado de cada usuário neste navegador">
        {logins.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">Nenhum acesso registrado ainda.</p>
        ) : (
          <div className="space-y-2">
            {logins.map((u) => (
              <div key={u.id} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                <span className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                  style={{ backgroundColor: colorFromInitials(u.initials) }}>{u.initials}</span>
                <span className="text-sm text-slate-700 font-medium flex-1">{u.name}</span>
                <span className="text-xs text-slate-400">{new Date(u.lastLogin!).toLocaleString('pt-BR')}</span>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-slate-400 mt-3">IP e dispositivo por acesso serão registrados pelo backend.</p>
      </Card>
    </div>
  );
}

function BackupSection({ settings, setSettings, showToast }: {
  settings: AppSettings; setSettings: React.Dispatch<React.SetStateAction<AppSettings>>; showToast: (m: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);

  const doBackup = () => {
    const data: Record<string, unknown> = {};
    ['compras-leao-requests', 'compras-leao-users', 'compras-leao-settings'].forEach((k) => {
      const raw = localStorage.getItem(k);
      if (raw) { try { data[k] = JSON.parse(raw); } catch { data[k] = raw; } }
    });
    const json = JSON.stringify({ exportedAt: new Date().toISOString(), data }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-compras-leao-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setSettings((st) => ({
      ...st,
      backups: [{ id: `b-${Date.now()}`, date: new Date().toISOString(), size: json.length }, ...st.backups].slice(0, 10),
    }));
    showToast('Backup gerado e baixado');
  };

  const doRestore = (content: string) => {
    try {
      const parsed = JSON.parse(content);
      const data = parsed.data ?? parsed;
      Object.entries(data).forEach(([k, v]) => {
        if (k.startsWith('compras-leao-')) localStorage.setItem(k, JSON.stringify(v));
      });
      showToast('Backup restaurado — recarregando...');
      setTimeout(() => window.location.reload(), 1200);
    } catch {
      showToast('Arquivo de backup inválido');
    }
  };

  return (
    <div className="space-y-4">
      <Card title="Backup Manual" subtitle="Exporta todos os dados do sistema (solicitações, usuários e configurações) em JSON">
        <div className="flex flex-wrap gap-2">
          <button onClick={doBackup}
            className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Download size={14} /> Gerar e Baixar Backup
          </button>
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 text-sm text-slate-600 border border-slate-200 hover:border-violet-300 px-4 py-2 rounded-lg font-medium">
            <Upload size={14} /> Restaurar de Arquivo
          </button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" aria-label="Selecionar arquivo de backup"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const reader = new FileReader();
              reader.onload = () => setConfirmRestore(String(reader.result));
              reader.readAsText(f);
              e.target.value = '';
            }} />
        </div>
      </Card>
      <Card title="Backup Automático">
        <Toggle label="Backup automático agendado" hint="Agendamento no servidor — configurado aqui e executado pelo backend"
          checked={settings.autoBackup} onChange={(v) => setSettings((st) => ({ ...st, autoBackup: v }))} />
      </Card>
      <Card title="Histórico de Backups">
        {settings.backups.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">Nenhum backup gerado ainda.</p>
        ) : (
          <div className="space-y-2">
            {settings.backups.map((b) => (
              <div key={b.id} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                <DatabaseBackup size={14} className="text-violet-500" />
                <span className="text-sm text-slate-700 flex-1">{new Date(b.date).toLocaleString('pt-BR')}</span>
                <span className="text-xs text-slate-400">{(b.size / 1024).toFixed(1)} KB</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {confirmRestore && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4" onClick={() => setConfirmRestore(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 text-center" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true">
            <AlertTriangle size={26} className="text-amber-500 mx-auto mb-2" />
            <h3 className="font-semibold text-slate-800 mb-1">Restaurar backup?</h3>
            <p className="text-sm text-slate-500 mb-4">Os dados atuais serão <strong>substituídos</strong> pelos dados do arquivo. Esta ação não pode ser desfeita.</p>
            <div className="flex justify-center gap-2">
              <button onClick={() => setConfirmRestore(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancelar</button>
              <button onClick={() => doRestore(confirmRestore)} className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium">Restaurar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CustomizationSection({ settings, patch }: { settings: AppSettings; patch: PatchFn }) {
  const c = settings.customization;
  return (
    <Card title="Personalização do Sistema">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Nome do sistema" value={c.nomeSistema} onChange={(v) => patch('customization', { nomeSistema: v })} />
        <Field label="Texto do rodapé" value={c.rodape} onChange={(v) => patch('customization', { rodape: v })} placeholder="© 2026 Sua Empresa" />
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Idioma</label>
          <select value={c.idioma} onChange={(e) => patch('customization', { idioma: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500">
            {['Português (Brasil)', 'English (US)', 'Español'].map((x) => <option key={x}>{x}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Fuso horário</label>
          <select value={c.fuso} onChange={(e) => patch('customization', { fuso: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500">
            {['America/Sao_Paulo', 'America/Manaus', 'America/Fortaleza', 'UTC'].map((x) => <option key={x}>{x}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Formato de data</label>
          <select value={c.formatoData} onChange={(e) => patch('customization', { formatoData: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500">
            {['DD/MM/AAAA', 'MM/DD/AAAA', 'AAAA-MM-DD'].map((x) => <option key={x}>{x}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Formato monetário</label>
          <select value={c.formatoMoeda} onChange={(e) => patch('customization', { formatoMoeda: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500">
            {['R$ 1.234,56', '$ 1,234.56', '€ 1.234,56'].map((x) => <option key={x}>{x}</option>)}
          </select>
        </div>
      </div>
      <p className="text-[11px] text-slate-400 mt-3">Idioma, fuso e formatos são aplicados globalmente na integração com o backend; as preferências já ficam salvas.</p>
    </Card>
  );
}

function AuditSection({ requests }: { requests: PurchaseRequest[] }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const PAGE = 12;
  const entries = useMemo(() =>
    requests.flatMap((r) => r.history.map((h) => ({ ...h, number: r.number })))
      .sort((a, b) => (b.date > a.date ? 1 : -1)),
  [requests]);
  const filtered = entries.filter((e) => {
    const q = search.toLowerCase();
    return !q || e.user.toLowerCase().includes(q) || e.action.toLowerCase().includes(q) || e.number.toLowerCase().includes(q);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const safePage = Math.min(page, totalPages);
  return (
    <Card title="Registro de Auditoria" subtitle="Todas as ações registradas nas solicitações — quem alterou, o quê e quando">
      <div className="relative mb-3">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Filtrar por usuário, ação ou número..." aria-label="Filtrar auditoria"
          className="w-full sm:w-80 pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500" />
      </div>
      {filtered.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-8">Nenhum registro encontrado.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['Usuário', 'Ação', 'Solicitação', 'Data e Hora', 'IP / Dispositivo'].map((h) => (
                    <th key={h} scope="col" className="px-3 py-2.5 text-xs font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice((safePage - 1) * PAGE, safePage * PAGE).map((e) => (
                  <tr key={`${e.number}-${e.id}`} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70">
                    <td className="px-3 py-2.5 text-xs font-medium text-slate-700 whitespace-nowrap">{e.user}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">
                      {e.action}{e.from && e.to && <span className="text-slate-400"> ({e.from} → {e.to})</span>}
                    </td>
                    <td className="px-3 py-2.5 text-xs font-semibold text-violet-600 whitespace-nowrap">{e.number}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">{new Date(e.date).toLocaleString('pt-BR')}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-300">registrado pelo backend</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
            <span>{filtered.length} registro(s)</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}
                className="px-2 py-1 rounded-lg border border-slate-200 disabled:opacity-30 hover:bg-slate-50">Anterior</button>
              <span>{safePage}/{totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}
                className="px-2 py-1 rounded-lg border border-slate-200 disabled:opacity-30 hover:bg-slate-50">Próxima</button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function ApiSection({ settings, setSettings, showToast }: {
  settings: AppSettings; setSettings: React.Dispatch<React.SetStateAction<AppSettings>>; showToast: (m: string) => void;
}) {
  const [label, setLabel] = useState('');
  const genKey = () => {
    if (!label.trim()) return;
    const rand = Array.from(crypto.getRandomValues(new Uint8Array(24))).map((b) => b.toString(16).padStart(2, '0')).join('');
    setSettings((s) => ({
      ...s,
      apiKeys: [...s.apiKeys, { id: `k-${Date.now()}`, label: label.trim(), key: `cl_${rand}`, createdAt: new Date().toISOString() }],
    }));
    setLabel('');
    showToast('Chave de API gerada');
  };
  return (
    <div className="space-y-4">
      <PendingBanner text="A API REST será exposta pelo backend. As chaves geradas aqui já ficam registradas e serão validadas pelo servidor na integração." />
      <Card title="Chaves de API">
        <div className="flex gap-2 mb-4">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nome da chave (ex.: Integração ERP)"
            onKeyDown={(e) => { if (e.key === 'Enter') genKey(); }} aria-label="Nome da chave"
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
          <button onClick={genKey} disabled={!label.trim()}
            className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white px-3 py-2 rounded-lg text-xs font-medium">
            <KeyRound size={13} /> Gerar chave
          </button>
        </div>
        {settings.apiKeys.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">Nenhuma chave criada.</p>
        ) : (
          <div className="space-y-2">
            {settings.apiKeys.map((k) => (
              <div key={k.id} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                <KeyRound size={13} className="text-violet-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700">{k.label}</p>
                  <p className="text-xs text-slate-400 font-mono truncate">{k.key}</p>
                </div>
                <span className="text-[10px] text-slate-400 whitespace-nowrap">{new Date(k.createdAt).toLocaleDateString('pt-BR')}</span>
                <button onClick={() => setSettings((s) => ({ ...s, apiKeys: s.apiKeys.filter((x) => x.id !== k.id) }))}
                  aria-label={`Revogar ${k.label}`} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title="Webhooks, Documentação e Limites">
        <PendingBanner text="Webhooks, documentação da API, limites de uso e status ficarão disponíveis quando o backend for publicado." />
      </Card>
    </div>
  );
}

function MigrationTool() {
  const [oldUrl, setOldUrl] = useState('');
  const [oldSecret, setOldSecret] = useState('');
  const [newSecret, setNewSecret] = useState('');
  const [running, setRunning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const start = async () => {
    setConfirming(false);
    setRunning(true);
    setLog(['Iniciando migração...']);
    const addLog = (m: string) => setLog((prev) => [...prev, m]);
    try {
      const { runMigration } = await import('../lib/backend');
      const { SUPABASE_URL } = await import('../lib/supabase');
      await runMigration(oldUrl.trim(), oldSecret.trim(), SUPABASE_URL, newSecret.trim(), addLog);
    } catch (e) {
      addLog(`❌ Erro: ${e instanceof Error ? e.message : String(e)}`);
    }
    setRunning(false);
  };

  const input = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono';
  const valid = /^https:\/\/.+supabase\.co/.test(oldUrl.trim()) && oldSecret.trim().length > 20 && newSecret.trim().length > 20;

  return (
    <Card title="Migração de Dados (SaaS antigo → este sistema)" subtitle="Copia usuários, solicitações, itens, fornecedores, históricos e O.S. O banco antigo NÃO é modificado (somente leitura).">
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Project URL do projeto ANTIGO</label>
          <input value={oldUrl} onChange={(e) => setOldUrl(e.target.value)} placeholder="https://xxxxx.supabase.co" className={input} disabled={running} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Chave service_role LEGADA do projeto ANTIGO (começa com eyJ...)</label>
          <input type="password" value={oldSecret} onChange={(e) => setOldSecret(e.target.value)} placeholder="eyJhbGciOi..." className={input} disabled={running} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Chave service_role LEGADA do projeto NOVO (começa com eyJ...)</label>
          <input type="password" value={newSecret} onChange={(e) => setNewSecret(e.target.value)} placeholder="eyJhbGciOi..." className={input} disabled={running} />
        </div>
        {(oldSecret.trim().startsWith('sb_secret') || newSecret.trim().startsWith('sb_secret')) && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
            <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">Chaves <strong>sb_secret_...</strong> são bloqueadas pelo Supabase no navegador. Use as chaves <strong>legadas</strong>: no painel, Settings → API Keys → aba <strong>"Legacy API Keys"</strong> → copie a <strong>service_role</strong> (formato eyJ...).</p>
          </div>
        )}
        <PendingBanner text="Onde achar: painel do Supabase → Settings → API Keys → aba 'Legacy API Keys' → service_role (clique em Reveal). Antes de migrar, execute supabase/clone-schema.sql no SQL Editor do projeto NOVO. As chaves são usadas somente no seu navegador e não ficam salvas." />
        {!confirming ? (
          <button onClick={() => setConfirming(true)} disabled={!valid || running}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Database size={14} /> {running ? 'Migrando...' : 'Iniciar Migração'}
          </button>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p className="text-xs text-amber-800 mb-2"><strong>Confirmar migração?</strong> Os dados serão copiados para o projeto novo. O projeto antigo não será alterado. Usuários serão criados com a senha temporária <strong>Leao@2026</strong>.</p>
            <div className="flex gap-2">
              <button onClick={start} className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-1.5 rounded-lg text-xs font-medium">Sim, migrar agora</button>
              <button onClick={() => setConfirming(false)} className="text-xs text-slate-500 px-3 py-1.5">Cancelar</button>
            </div>
          </div>
        )}
        {log.length > 0 && (
          <div className="bg-slate-900 rounded-xl p-3 max-h-64 overflow-y-auto">
            {log.map((l, i) => (
              <p key={i} className={`text-[11px] font-mono leading-relaxed ${l.startsWith('❌') ? 'text-red-400' : l.startsWith('✅') ? 'text-emerald-400' : 'text-slate-300'}`}>{l}</p>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function DatabaseSection({ requests, users, settings }: { requests: PurchaseRequest[]; users: AppUser[]; settings: AppSettings }) {
  const purchases = requests.filter((r) => r.supplier || r.value);
  const totalValue = requests.reduce((s, r) => s + (r.value ?? 0), 0);
  let bytes = 0;
  let integrity = true;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (!k.startsWith('compras-leao')) continue;
    const v = localStorage.getItem(k) ?? '';
    bytes += k.length + v.length;
    if (k !== 'compras-leao-fav-settings') {
      try { JSON.parse(v); } catch { integrity = v === '1' || !v.startsWith('{') && !v.startsWith('['); }
    }
  }
  const lastBackup = settings.backups[0]?.date;
  const stats = [
    { label: 'Usuários cadastrados', value: String(users.length) },
    { label: 'Solicitações', value: String(requests.length) },
    { label: 'Compras registradas', value: String(purchases.length) },
    { label: 'Valor total registrado', value: totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) },
    { label: 'Espaço utilizado (localStorage)', value: `${(bytes / 1024).toFixed(1)} KB` },
    { label: 'Último backup', value: lastBackup ? new Date(lastBackup).toLocaleString('pt-BR') : 'Nunca' },
  ];
  return (
    <div className="space-y-4">
      <MigrationTool />
      <Card title="Informações do Banco de Dados" subtitle="Dados sincronizados com o Supabase, com cache local no navegador como fallback offline">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="border border-slate-100 rounded-xl p-3">
              <p className="text-lg font-bold text-slate-800 truncate">{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
        <div className={`mt-4 flex items-center gap-2 rounded-xl px-3 py-2.5 border ${integrity ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
          {integrity ? <CheckCircle2 size={14} className="text-emerald-600" /> : <AlertTriangle size={14} className="text-red-600" />}
          <p className={`text-xs font-medium ${integrity ? 'text-emerald-700' : 'text-red-700'}`}>
            Integridade dos dados: {integrity ? 'OK — todos os registros são válidos' : 'Falha — há registros corrompidos; considere restaurar um backup'}
          </p>
        </div>
      </Card>
    </div>
  );
}
