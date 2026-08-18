import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Building2, Palette, Users, ShieldCheck, GitBranch, ShoppingCart, Truck, Bell,
  Plug, Lock, DatabaseBackup, SlidersHorizontal, ScrollText, KeyRound, Database,
  Search, Star, ChevronRight, Plus, Trash2, X, AlertTriangle,
  Download, Upload, CheckCircle2, Clock, PiggyBank,
} from 'lucide-react';
import { Header } from '../components/Layout/Header';
import { colorFromInitials } from '../utils/colors';
import { PurchaseRequest } from '../types';
import { AppUser, Role, loadUsers } from '../data/users';
import { PAYMENT_TERMS_PRESETS } from '../lib/paymentTerms';
import { nationalHolidays } from '../lib/finance';
import {
  fetchAppSettings, saveAppSettings, fetchRolePermissions, saveRolePermission,
  buildPermissionMap, isModuleAllowed, dbRolesFor, fetchRealUsers, RealUser, uploadLogo,
} from '../lib/settingsBackend';

/* ================================================================== */
/* Modelo de configurações (estrutura pronta para o banco de dados)    */
/* ================================================================== */
export interface AppSettings {
  company: {
    nome: string; razaoSocial: string; fantasia: string; cnpj: string; ie: string;
    endereco: string; cidade: string; estado: string; cep: string; pais: string;
    telefone: string; whatsapp: string; email: string; website: string; logoUrl: string;
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
  /** Lido em lib/financeSettings.ts pelo módulo de Controle Financeiro Futuro. */
  finance: {
    limboDays: string; extraHolidays: string[]; backfillTermsId: string; limboAlertEnabled: boolean;
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
  apiKeys: { id: string; label: string; key: string; createdAt: string }[];
  backups: { id: string; date: string; size: number }[];
  autoBackup: boolean;
}

/** Versão do schema de backup — incrementar quando o formato do JSON exportado mudar. */
const BACKUP_SCHEMA_VERSION = 1;

/** Cache local — só usado para pintar a tela instantaneamente e como fallback
 *  se o Supabase estiver fora do ar. A fonte de verdade é a tabela app_settings. */
const SETTINGS_CACHE_KEY = 'compras-leao-settings';

/** Módulos protegidos por cadeado — chaves iguais às de SECTIONS (critical: true). */
const CRITICAL_MODULES: { key: string; label: string }[] = [
  { key: 'usuarios', label: 'Usuários' },
  { key: 'perfis', label: 'Perfis e Permissões' },
  { key: 'seguranca', label: 'Segurança' },
  { key: 'backup', label: 'Backup' },
  { key: 'auditoria', label: 'Auditoria' },
  { key: 'api', label: 'API' },
  { key: 'banco', label: 'Banco de Dados' },
  { key: 'compras', label: 'Compras' },
  { key: 'fornecedores', label: 'Fornecedores' },
  { key: 'financeiro', label: 'Financeiro' },
  { key: 'notificacoes', label: 'Notificações' },
];

/** Papéis reais do banco (public.app_role) para a matriz de permissões. */
const DB_ROLES: { key: string; label: string }[] = [
  { key: 'admin', label: 'Administrador' },
  { key: 'gestor', label: 'Gestor' },
  { key: 'compras', label: 'Comprador' },
  { key: 'financeiro', label: 'Financeiro' },
  { key: 'solicitante', label: 'Solicitante' },
];

const DEFAULT_SETTINGS: AppSettings = {
  company: { nome: 'Compras Leão', razaoSocial: '', fantasia: '', cnpj: '', ie: '', endereco: '', cidade: '', estado: '', cep: '', pais: 'Brasil', telefone: '', whatsapp: '', email: '', website: '', logoUrl: '' },
  branding: { primaryColor: '#7c3aed', secondaryColor: '#0f172a', theme: 'claro', font: 'Inter' },
  approval: { niveis: 1, aprovacaoPorValor: false, valorAlcada: '', aprovacaoPorSetor: false, autoAprovarAbaixo: '', aprovacaoObrigatoria: true },
  purchasing: { numeracaoAutomatica: true, prefixo: '#', slaHorasMaquinaParada: '4', slaHorasUrgente: '24', prioridadePadrao: 'Não Urgente', categorias: ['Manutenção Geral', 'Produção', 'EPI', 'Escritório', 'TI', 'Logística'], centrosCusto: ['Produção', 'Manutenção', 'Administrativo', 'TI', 'RH', 'Logística'], tiposSolicitacao: ['Material', 'Serviço'] },
  suppliers: { categorias: [], criterioPrazo: 40, criterioPreco: 40, criterioQualidade: 20, prazoAlvoDias: '7', homologacaoObrigatoria: false, bloqueados: [] },
  finance: { limboDays: '7', extraHolidays: [], backfillTermsId: '30', limboAlertEnabled: true },
  notifications: { pushEnabled: true, ntfyTopic: 'clleao9274', emailEnabled: false, whatsappEnabled: false, evAprovacao: true, evReprovacao: true, evCompras: true, evRecebimento: true, evNovas: true },
  security: { mfa: false, sessaoMinutos: '480', ipPermitido: '', sso: false },
  customization: { nomeSistema: 'Compras Leão', rodape: '', idioma: 'Português (Brasil)', fuso: 'America/Sao_Paulo', formatoData: 'DD/MM/AAAA', formatoMoeda: 'R$ 1.234,56' },
  apiKeys: [],
  backups: [],
  autoBackup: false,
};

function mergeDefaults(parsed: Record<string, unknown> | null | undefined): AppSettings {
  const p = (parsed ?? {}) as Partial<AppSettings>;
  return {
    ...DEFAULT_SETTINGS, ...p,
    company: { ...DEFAULT_SETTINGS.company, ...p.company },
    branding: { ...DEFAULT_SETTINGS.branding, ...p.branding },
    approval: { ...DEFAULT_SETTINGS.approval, ...p.approval },
    purchasing: { ...DEFAULT_SETTINGS.purchasing, ...p.purchasing },
    suppliers: { ...DEFAULT_SETTINGS.suppliers, ...p.suppliers },
    finance: { ...DEFAULT_SETTINGS.finance, ...p.finance },
    notifications: { ...DEFAULT_SETTINGS.notifications, ...p.notifications },
    security: { ...DEFAULT_SETTINGS.security, ...p.security },
    customization: { ...DEFAULT_SETTINGS.customization, ...p.customization },
  };
}

function loadCachedSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
    if (raw) return mergeDefaults(JSON.parse(raw));
  } catch { /* volta ao padrão */ }
  return DEFAULT_SETTINGS;
}

/* ================================================================== */
/* Seções                                                              */
/* ================================================================== */
type SectionKey =
  | 'geral' | 'identidade' | 'usuarios' | 'perfis' | 'aprovacao' | 'compras'
  | 'fornecedores' | 'financeiro' | 'notificacoes' | 'integracoes' | 'seguranca' | 'backup'
  | 'personalizacao' | 'auditoria' | 'api' | 'banco';

const SECTIONS: { key: SectionKey; label: string; icon: typeof Building2; critical?: boolean; keywords: string }[] = [
  { key: 'geral', label: 'Geral', icon: Building2, keywords: 'empresa cnpj razão social endereço telefone email' },
  { key: 'identidade', label: 'Identidade Visual', icon: Palette, keywords: 'logo cor tema fonte marca claro escuro' },
  { key: 'usuarios', label: 'Usuários', icon: Users, critical: true, keywords: 'usuário senha cargo criar editar excluir' },
  { key: 'perfis', label: 'Perfis e Permissões', icon: ShieldCheck, critical: true, keywords: 'permissão perfil administrador módulo acesso' },
  { key: 'aprovacao', label: 'Fluxo de Aprovação', icon: GitBranch, keywords: 'aprovação alçada valor aprovador nível' },
  { key: 'compras', label: 'Compras', icon: ShoppingCart, critical: true, keywords: 'numeração prefixo sla prioridade categoria centro de custo' },
  { key: 'fornecedores', label: 'Fornecedores', icon: Truck, critical: true, keywords: 'fornecedor avaliação score homologação bloqueio' },
  { key: 'financeiro', label: 'Financeiro', icon: PiggyBank, critical: true, keywords: 'financeiro parcela previsão vencimento feriado limbo comprometido caixa' },
  { key: 'notificacoes', label: 'Notificações', icon: Bell, critical: true, keywords: 'notificação push email whatsapp ntfy alerta' },
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
function Field({ label, value, onChange, placeholder, type = 'text', span, min }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; span?: boolean; min?: number;
}) {
  const id = useId();
  return (
    <div className={span ? 'sm:col-span-2' : ''}>
      <label htmlFor={id} className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input
        id={id}
        type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} min={min}
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
      <p className="text-sm text-slate-400">Seu perfil não tem permissão para acessar esta configuração. Um gestor pode liberar em <strong>Perfis e Permissões</strong>.</p>
    </div>
  );
}

function PermissionsUnavailable({ error, retrying, onRetry }: { error: string; retrying: boolean; onRetry: () => void }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
      <AlertTriangle size={28} className="text-amber-400 mx-auto mb-3" />
      <h3 className="font-semibold text-slate-700 mb-1">Não foi possível verificar suas permissões</h3>
      <p className="text-sm text-slate-400 max-w-sm mx-auto mb-4">
        A matriz de permissões não carregou ({error}). Isso é uma falha técnica, não uma negação de acesso — tente novamente.
      </p>
      <button
        onClick={onRetry}
        disabled={retrying}
        className="inline-flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-xs font-medium"
      >
        {retrying ? 'Tentando novamente...' : 'Tentar novamente'}
      </button>
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
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [permsLoading, setPermsLoading] = useState(true);
  const loading = settingsLoading || permsLoading;
  const [active, setActive] = useState<SectionKey>('geral');
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState<SectionKey[]>(() => {
    try { return JSON.parse(localStorage.getItem('compras-leao-fav-settings') ?? '[]'); } catch { return []; }
  });
  const [recents, setRecents] = useState<SectionKey[]>([]);
  const [settings, setSettings] = useState<AppSettings>(loadCachedSettings);
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [users] = useState<AppUser[]>(loadUsers);
  const [rolePerms, setRolePerms] = useState<Map<string, boolean>>(new Map());
  const [permsError, setPermsError] = useState<string | null>(null);
  const [permsRetrying, setPermsRetrying] = useState(false);
  const [realUsers, setRealUsers] = useState<RealUser[]>([]);
  const [realUsersLoading, setRealUsersLoading] = useState(true);
  const [realUsersError, setRealUsersError] = useState<string | null>(null);
  const justLoaded = useRef(false);
  const savingRef = useRef(false);

  const loadRealUsers = () => {
    setRealUsersLoading(true);
    setRealUsersError(null);
    fetchRealUsers()
      .then(setRealUsers)
      .catch((e) => setRealUsersError(e instanceof Error ? e.message : 'Falha ao carregar usuários'))
      .finally(() => setRealUsersLoading(false));
  };

  useEffect(() => { loadRealUsers(); }, []);

  // Carrega a matriz de permissões (Perfis e Permissões) — controla os cadeados.
  // Reaproveitável para "Tentar novamente": uma falha aqui NÃO pode significar
  // "acesso negado" para ninguém, inclusive admin/gestor — ver `permsError` abaixo.
  const loadRolePerms = (isRetry = false) => {
    if (isRetry) setPermsRetrying(true);
    setPermsError(null);
    fetchRolePermissions()
      .then((rows) => setRolePerms(buildPermissionMap(rows)))
      .catch((e) => setPermsError(e instanceof Error ? e.message : 'Falha ao carregar a matriz de permissões.'))
      .finally(() => { if (isRetry) setPermsRetrying(false); else setPermsLoading(false); });
  };

  useEffect(() => { loadRolePerms(false); }, []);

  // Carrega as configurações reais do Supabase (o cache local só serve para
  // pintar a tela na hora enquanto isso acontece).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const remote = await fetchAppSettings();
        if (cancelled) return;
        if (remote === null) {
          // Nada salvo ainda no banco — migra o cache local (se existir) uma única vez.
          const cachedRaw = localStorage.getItem(SETTINGS_CACHE_KEY);
          const merged = cachedRaw ? mergeDefaults(JSON.parse(cachedRaw)) : DEFAULT_SETTINGS;
          await saveAppSettings(merged as unknown as Record<string, unknown>, currentUser.id).catch(() => {});
          justLoaded.current = true;
          setSettings(merged);
        } else {
          const merged = mergeDefaults(remote);
          justLoaded.current = true;
          setSettings(merged);
          localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(merged));
        }
      } catch {
        // Offline — segue com o que já estava no cache local.
      } finally {
        if (!cancelled) setSettingsLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveNow = async (data: AppSettings) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaveState('saving');
    setSaveError(null);
    try {
      await saveAppSettings(data as unknown as Record<string, unknown>, currentUser.id);
      localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(data));
      setSaveState('saved');
    } catch (e) {
      setSaveState('error');
      setSaveError(e instanceof Error ? e.message : 'Falha ao salvar');
    } finally {
      savingRef.current = false;
    }
  };

  // Salvamento automático com debounce (Supabase é a fonte de verdade)
  useEffect(() => {
    if (settingsLoading) return;
    if (justLoaded.current) { justLoaded.current = false; return; }
    const suppliersTotalScore = settings.suppliers.criterioPrazo + settings.suppliers.criterioPreco + settings.suppliers.criterioQualidade;
    if (suppliersTotalScore !== 100) { setSaveState('error'); setSaveError('Soma dos pesos de avaliação de fornecedores precisa ser 100%.'); return; }
    const sessaoMinutosNum = Number(settings.security.sessaoMinutos);
    if (settings.security.sessaoMinutos !== '' && (!Number.isFinite(sessaoMinutosNum) || sessaoMinutosNum <= 0)) {
      setSaveState('error'); setSaveError('Duração da sessão inválida.'); return;
    }
    setSaveState('dirty');
    const t = setTimeout(() => { saveNow(settings); }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, settingsLoading]);

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
  // Fallback duro: 'perfis' é a própria tela que corrige a matriz de permissões —
  // travá-la junto com o resto (matriz vazia, erro de rede, ou até uma regra
  // deliberada mal configurada) eliminaria qualquer chance de autorrecuperação
  // pela UI. Gestor sempre enxerga esta aba, independente do que a matriz diga.
  const isPerfisHardFallback = activeSection.key === 'perfis' && currentUser.role === 'gestor';
  const blocked = !!activeSection.critical && !isPerfisHardFallback
    && !isModuleAllowed(rolePerms, currentUser.role, activeSection.key);
  // A matriz não carregou (erro técnico) — diferente de "carregou e nega o acesso".
  // Mostrar "Acesso restrito" aqui seria enganoso (parece negação deliberada) e,
  // pior, esconderia a própria aba 'perfis' que resolveria o problema.
  const permissionsUnavailable = !!permsError && !!activeSection.critical && !isPerfisHardFallback;

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
                saveState === 'saved' ? 'text-emerald-600' : saveState === 'saving' ? 'text-slate-400' : saveState === 'error' ? 'text-red-600' : 'text-amber-600'
              }`}>
                {saveState === 'saved' ? <><CheckCircle2 size={13} /> Tudo salvo</> :
                 saveState === 'saving' ? <><Clock size={13} /> Salvando...</> :
                 saveState === 'error' ? (
                   <>
                     <AlertTriangle size={13} /> Erro ao salvar{saveError ? ` — ${saveError}` : ''}
                     <button onClick={() => saveNow(settings)} disabled={savingRef.current} className="underline hover:text-red-800 font-semibold ml-1 disabled:opacity-50 disabled:cursor-not-allowed">Tentar novamente</button>
                   </>
                 ) :
                 <><AlertTriangle size={13} /> Alterações não salvas</>}
              </span>
            </div>

            {permissionsUnavailable ? (
              <PermissionsUnavailable error={permsError!} retrying={permsRetrying} onRetry={() => loadRolePerms(true)} />
            ) : blocked ? <NoPermission /> : (
              <>
                {active === 'geral' && <GeneralSection settings={settings} patch={patch} showToast={showToast} />}
                {active === 'identidade' && <BrandingSection settings={settings} patch={patch} />}
                {active === 'usuarios' && <UsersSection users={realUsers} loading={realUsersLoading} error={realUsersError} onRetry={loadRealUsers} currentUserId={currentUser.id} />}
                {active === 'perfis' && <ProfilesSection rolePerms={rolePerms} setRolePerms={setRolePerms} showToast={showToast} currentUserRole={currentUser.role} />}
                {active === 'aprovacao' && <ApprovalSection settings={settings} patch={patch} />}
                {active === 'compras' && <PurchasingSection settings={settings} patch={patch} />}
                {active === 'fornecedores' && <SuppliersSection settings={settings} patch={patch} />}
                {active === 'financeiro' && <FinanceSection settings={settings} patch={patch} />}
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

function GeneralSection({ settings, patch, showToast }: { settings: AppSettings; patch: PatchFn; showToast: (m: string) => void }) {
  const c = settings.company;
  const set = (field: keyof AppSettings['company']) => (v: string) => patch('company', { [field]: v });
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadLogo(file);
      patch('company', { logoUrl: url });
      showToast('Logo enviada com sucesso');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Falha ao enviar a logo');
    } finally {
      setUploading(false);
    }
  };

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
      <Card title="Logo" subtitle="PNG, JPG, SVG ou WEBP — até 2 MB">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden flex-shrink-0">
            {c.logoUrl ? (
              <img src={c.logoUrl} alt="Logo da empresa" className="w-full h-full object-contain" />
            ) : (
              <Building2 size={24} className="text-slate-300" />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-xs font-medium">
                <Upload size={13} /> {uploading ? 'Enviando...' : c.logoUrl ? 'Trocar logo' : 'Enviar logo'}
              </button>
              {c.logoUrl && (
                <button onClick={() => patch('company', { logoUrl: '' })}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-600 border border-slate-200 hover:border-red-300 px-3 py-2 rounded-lg font-medium">
                  <Trash2 size={13} /> Remover
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden"
              aria-label="Selecionar arquivo de logo"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} />
          </div>
        </div>
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

const DB_ROLE_LABEL: Record<string, string> = {
  admin: 'Administrador', gestor: 'Gestor', compras: 'Comprador', financeiro: 'Financeiro', solicitante: 'Solicitante',
};
const DB_ROLE_BADGE: Record<string, string> = {
  admin: 'bg-emerald-100 text-emerald-700', gestor: 'bg-emerald-100 text-emerald-700',
  compras: 'bg-violet-100 text-violet-700', financeiro: 'bg-teal-100 text-teal-700', solicitante: 'bg-slate-100 text-slate-600',
};

function UsersSection({ users, loading, error, onRetry, currentUserId }: {
  users: RealUser[]; loading: boolean; error: string | null; onRetry: () => void; currentUserId: string;
}) {
  return (
    <div className="space-y-4">
      <Card title="Usuários do Sistema" subtitle="Lista real do Supabase Auth. Criar, editar cargo, desativar ou excluir usuários é feito direto no painel do Supabase (Authentication → Users).">
        {loading ? (
          <p className="text-xs text-slate-400 text-center py-8">Carregando usuários...</p>
        ) : error ? (
          <div className="flex flex-col items-center gap-2 py-8">
            <AlertTriangle size={20} className="text-red-500" />
            <p className="text-xs text-red-600 text-center max-w-sm">{error}</p>
            <button onClick={onRetry} className="text-xs text-violet-600 hover:text-violet-800 font-medium underline">Tentar novamente</button>
          </div>
        ) : users.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8">Nenhum usuário encontrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['Nome', 'Cargo(s)', 'Setor'].map((h) => (
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
                          style={{ backgroundColor: colorFromInitials(u.name.slice(0, 2).toUpperCase()) }}>{u.name.slice(0, 2).toUpperCase()}</span>
                        <span className="text-sm font-medium text-slate-700">{u.name}{u.id === currentUserId && <span className="text-[10px] text-violet-500 ml-1">(você)</span>}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {u.roles.map((r) => (
                          <span key={r} className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${DB_ROLE_BADGE[r] ?? 'bg-slate-100 text-slate-600'}`}>
                            {DB_ROLE_LABEL[r] ?? r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">{u.sector || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <PendingBanner text="E-mail e último acesso não aparecem aqui porque exigem a Admin API do Supabase (chave service_role), que não pode ficar no navegador. Consulte esses dados no painel do Supabase." />
    </div>
  );
}

function ProfilesSection({ rolePerms, setRolePerms, showToast, currentUserRole }: {
  rolePerms: Map<string, boolean>;
  setRolePerms: React.Dispatch<React.SetStateAction<Map<string, boolean>>>;
  showToast: (m: string) => void;
  currentUserRole: Role;
}) {
  const [saving, setSaving] = useState<string | null>(null);

  const toggle = async (role: string, module: string) => {
    const cellKey = `${role}:${module}`;
    const next = !(rolePerms.get(cellKey) ?? false);
    // "admin" e "gestor" são tratados como o mesmo bloco no restante do sistema
    // (o front colapsa admin em gestor no login) — mantém os dois sincronizados
    // para não criar uma regra que parece aplicada mas não é.
    const affected = role === 'admin' || role === 'gestor' ? ['admin', 'gestor'] : [role];

    // Trava de segurança: desmarcar 'perfis' para o próprio papel logado tranca
    // esta própria tela (a única capaz de reverter a matriz) sem saída pela UI.
    if (module === 'perfis' && !next && affected.some((r) => dbRolesFor(currentUserRole).includes(r))) {
      showToast('Esta ação removeria seu próprio acesso a Perfis e Permissões, sem forma de reverter pela interface. Peça a outro gestor ou ajuste direto no banco.');
      return;
    }

    setSaving(cellKey);
    try {
      await Promise.all(affected.map((r) => saveRolePermission(r, module, next)));
      setRolePerms((prev) => {
        const copy = new Map(prev);
        affected.forEach((r) => copy.set(`${r}:${module}`, next));
        return copy;
      });
    } catch (e) {
      showToast(`Erro ao salvar permissão: ${e instanceof Error ? e.message : 'tente novamente'}`);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card title="Matriz de Permissões — Abas com Cadeado" subtitle="Controla quem acessa cada aba protegida de Configurações. A regra é aplicada de verdade: bloqueada aqui, bloqueada no banco (RLS) também.">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th scope="col" className="px-3 py-2.5 text-xs font-semibold text-slate-500">Papel</th>
                {CRITICAL_MODULES.map((m) => (
                  <th key={m.key} scope="col" className="px-2 py-2.5 text-[10px] font-semibold text-slate-500 text-center whitespace-nowrap">{m.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DB_ROLES.map((r) => (
                <tr key={r.key} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70">
                  <td className="px-3 py-2 text-xs font-semibold text-slate-700 whitespace-nowrap">
                    {r.label}
                    {dbRolesFor(currentUserRole).includes(r.key) && <span className="ml-1.5 text-[9px] text-violet-600 font-medium">você</span>}
                  </td>
                  {CRITICAL_MODULES.map((m) => {
                    const cellKey = `${r.key}:${m.key}`;
                    const affected = r.key === 'admin' || r.key === 'gestor' ? ['admin', 'gestor'] : [r.key];
                    const isSelfLockCell = m.key === 'perfis' && affected.some((x) => dbRolesFor(currentUserRole).includes(x));
                    return (
                      <td key={m.key} className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={rolePerms.get(cellKey) ?? false}
                          disabled={saving === cellKey}
                          onChange={() => toggle(r.key, m.key)}
                          aria-label={`${r.label} — ${m.label}`}
                          title={isSelfLockCell ? 'Controla seu próprio acesso a esta tela — não pode ser desmarcada por aqui.' : undefined}
                          className="accent-violet-600 cursor-pointer disabled:opacity-40"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <PendingBanner text="Esta matriz controla apenas as 7 abas com cadeado. As demais abas de Configurações continuam abertas a qualquer usuário logado — se quiser restringir alguma outra, é só pedir." />
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
            {(() => {
              const valorAlcada = Number(a.valorAlcada);
              const autoAprovarAbaixo = Number(a.autoAprovarAbaixo);
              if (valorAlcada > 0 && autoAprovarAbaixo > 0 && autoAprovarAbaixo >= valorAlcada) {
                return <p className="sm:col-span-2 text-xs text-red-600">O valor de auto-aprovação deve ser menor que a alçada.</p>;
              }
              return null;
            })()}
          </div>
        )}
        <Toggle label="Aprovação por setor / centro de custo" hint="Cada setor tem seu próprio aprovador responsável"
          checked={a.aprovacaoPorSetor} onChange={(v) => patch('approval', { aprovacaoPorSetor: v })} />
        <div className="py-3">
          <label htmlFor="approval-niveis" className="block text-xs font-medium text-slate-600 mb-1">Quantidade de níveis de aprovação</label>
          <select id="approval-niveis" value={a.niveis} onChange={(e) => patch('approval', { niveis: Number(e.target.value) })}
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

function FinanceSection({ settings, patch }: { settings: AppSettings; patch: PatchFn }) {
  const f = settings.finance;
  const year = new Date().getFullYear();
  return (
    <div className="space-y-4">
      <Card
        title="Projeção de Parcelas"
        subtitle="As parcelas nascem quando o gestor aprova o valor cotado, não quando a compra acontece"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-3">
          <Field
            label="Alerta de pedido aprovado e não comprado (dias)"
            value={f.limboDays} type="number"
            onChange={(v) => patch('finance', { limboDays: v })}
          />
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Condição assumida no backfill
            </label>
            <select
              value={f.backfillTermsId}
              onChange={(e) => patch('finance', { backfillTermsId: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              {PAYMENT_TERMS_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <p className="text-[11px] text-slate-400 mt-1">
              Usada só para pedidos antigos que não têm condição registrada.
            </p>
          </div>
        </div>
        <Toggle
          label="Alertar por ntfy os pedidos parados no limbo"
          hint="Uma notificação por pedido por dia, enviada a gestor e financeiro"
          checked={f.limboAlertEnabled}
          onChange={(v) => patch('finance', { limboAlertEnabled: v })}
        />
      </Card>

      <Card
        title="Regra de Vencimento"
        subtitle="Vencimento em fim de semana ou feriado antecipa para o dia útil anterior"
      >
        <p className="text-xs text-slate-500 py-2">
          Os feriados nacionais são calculados automaticamente, inclusive os móveis
          (Carnaval, Sexta-feira Santa e Corpus Christi, derivados da Páscoa). Carnaval entra
          porque é feriado bancário — o que importa é quando o dinheiro sai do caixa.
        </p>
        <TagEditor
          label={`Feriados municipais e regionais (AAAA-MM-DD)`}
          tags={f.extraHolidays}
          onChange={(t) => patch('finance', { extraHolidays: t })}
          placeholder={`${year}-08-24`}
        />
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 mt-3">
          <p className="text-[11px] font-medium text-slate-600 mb-1.5">Feriados nacionais de {year}</p>
          <div className="flex flex-wrap gap-1.5">
            {nationalHolidays(year).map((h) => (
              <span key={h.date} className="text-[10px] bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-600">
                {h.date.slice(8, 10)}/{h.date.slice(5, 7)} {h.name}
              </span>
            ))}
          </div>
        </div>
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
          {totalScore !== 100 && (
            <p className="text-xs text-red-500 font-medium">
              Configuração inválida: esta alteração não será salva enquanto a soma dos pesos não for 100%.
            </p>
          )}
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
          <div>
            <Field label="Expiração da sessão (minutos)" value={s.sessaoMinutos} onChange={(v) => patch('security', { sessaoMinutos: v })} type="number" min={1} />
            {(() => {
              const n = Number(s.sessaoMinutos);
              if (s.sessaoMinutos !== '' && (!Number.isFinite(n) || n <= 0)) {
                return <p className="text-xs text-red-600 mt-1">A duração da sessão deve ser um número maior que zero.</p>;
              }
              return null;
            })()}
          </div>
          <div>
            <Field label="IPs permitidos (separados por vírgula)" value={s.ipPermitido} onChange={(v) => patch('security', { ipPermitido: v })} placeholder="Todos" />
            {(() => {
              const v = s.ipPermitido.trim();
              if (!v) return null;
              const parts = v.split(',').map((p) => p.trim()).filter(Boolean);
              const ipRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(\/\d{1,2})?$/;
              const isSpecial = (p: string) => /^(todos|all)$/i.test(p);
              const invalid = parts.some((p) => !isSpecial(p) && !ipRegex.test(p));
              if (invalid) {
                return <p className="text-xs text-red-600 mt-1">Formato inválido. Use IPs/CIDR como 192.168.0.1 ou 10.0.0.0/24, separados por vírgula.</p>;
              }
              return null;
            })()}
          </div>
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
  const [versionMismatch, setVersionMismatch] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  const doBackup = () => {
    const data: Record<string, unknown> = {};
    ['compras-leao-requests', 'compras-leao-users', 'compras-leao-settings'].forEach((k) => {
      const raw = localStorage.getItem(k);
      if (raw) { try { data[k] = JSON.parse(raw); } catch { data[k] = raw; } }
    });
    const json = JSON.stringify({ version: BACKUP_SCHEMA_VERSION, exportedAt: new Date().toISOString(), data }, null, 2);
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

  const doRestore = (content: string, skipVersionCheck = false) => {
    try {
      const parsed = JSON.parse(content);
      if (!skipVersionCheck && typeof parsed.version === 'number' && parsed.version !== BACKUP_SCHEMA_VERSION) {
        setConfirmRestore(null);
        setVersionMismatch(content);
        return;
      }
      const data = parsed.data ?? parsed;
      setRestoring(true);
      Object.entries(data).forEach(([k, v]) => {
        if (k.startsWith('compras-leao-')) localStorage.setItem(k, JSON.stringify(v));
      });
      showToast('Backup restaurado — recarregando...');
      setTimeout(() => window.location.reload(), 1200);
    } catch {
      setRestoring(false);
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
              <button onClick={() => setConfirmRestore(null)} disabled={restoring} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium disabled:opacity-50">Cancelar</button>
              <button onClick={() => doRestore(confirmRestore)} disabled={restoring}
                className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed">
                {restoring ? 'Restaurando...' : 'Restaurar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {versionMismatch && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4" onClick={() => !restoring && setVersionMismatch(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 text-center" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true">
            <AlertTriangle size={26} className="text-amber-500 mx-auto mb-2" />
            <h3 className="font-semibold text-slate-800 mb-1">Versão de backup diferente</h3>
            <p className="text-sm text-slate-500 mb-4">Este backup pode ser de uma versão diferente do sistema — restaurar mesmo assim?</p>
            <div className="flex justify-center gap-2">
              <button onClick={() => setVersionMismatch(null)} disabled={restoring} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium disabled:opacity-50">Cancelar</button>
              <button onClick={() => { const c = versionMismatch; setVersionMismatch(null); if (c) doRestore(c, true); }} disabled={restoring}
                className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed">
                {restoring ? 'Restaurando...' : 'Restaurar mesmo assim'}
              </button>
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
          <label htmlFor="customization-idioma" className="block text-xs font-medium text-slate-600 mb-1">Idioma</label>
          <select id="customization-idioma" value={c.idioma} onChange={(e) => patch('customization', { idioma: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500">
            {['Português (Brasil)', 'English (US)', 'Español'].map((x) => <option key={x}>{x}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="customization-fuso" className="block text-xs font-medium text-slate-600 mb-1">Fuso horário</label>
          <select id="customization-fuso" value={c.fuso} onChange={(e) => patch('customization', { fuso: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500">
            {['America/Sao_Paulo', 'America/Manaus', 'America/Fortaleza', 'UTC'].map((x) => <option key={x}>{x}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="customization-formato-data" className="block text-xs font-medium text-slate-600 mb-1">Formato de data</label>
          <select id="customization-formato-data" value={c.formatoData} onChange={(e) => patch('customization', { formatoData: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500">
            {['DD/MM/AAAA', 'MM/DD/AAAA', 'AAAA-MM-DD'].map((x) => <option key={x}>{x}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="customization-formato-moeda" className="block text-xs font-medium text-slate-600 mb-1">Formato monetário</label>
          <select id="customization-formato-moeda" value={c.formatoMoeda} onChange={(e) => patch('customization', { formatoMoeda: e.target.value })}
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
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

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
          <input type="password" autoComplete="off" value={oldSecret} onChange={(e) => setOldSecret(e.target.value)} placeholder="eyJhbGciOi..." className={input} disabled={running} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Chave service_role LEGADA do projeto NOVO (começa com eyJ...)</label>
          <input type="password" autoComplete="off" value={newSecret} onChange={(e) => setNewSecret(e.target.value)} placeholder="eyJhbGciOi..." className={input} disabled={running} />
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
          <div ref={logRef} className="bg-slate-900 rounded-xl p-3 max-h-64 overflow-y-auto">
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
      try { JSON.parse(v); } catch { integrity = false; }
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
