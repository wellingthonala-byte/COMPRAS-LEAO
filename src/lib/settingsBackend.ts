import { getSupabase } from './supabase';
import { Role } from '../data/users';

/** Corta consultas penduradas: se o servidor não responder em 15s, cai no modo offline */
function withTimeout<T>(p: PromiseLike<T>, ms = 15000): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

/* ================================================================== */
/* app_settings — linha única (id = 1)                                  */
/* ================================================================== */
export async function fetchAppSettings(): Promise<Record<string, unknown> | null> {
  const sb = getSupabase();
  const { data, error } = await withTimeout(
    sb.from('app_settings').select('data').eq('id', 1).maybeSingle()
  );
  if (error) throw error;
  return (data?.data as Record<string, unknown>) ?? null;
}

export async function saveAppSettings(data: Record<string, unknown>, userId?: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await withTimeout(
    sb.from('app_settings').upsert({ id: 1, data, updated_by: userId ?? null, updated_at: new Date().toISOString() })
  );
  if (error) throw error;
}

/* ================================================================== */
/* role_permissions — matriz papel × módulo                             */
/* ================================================================== */
export interface RolePermissionRow {
  role: string;
  module: string;
  allowed: boolean;
}

export async function fetchRolePermissions(): Promise<RolePermissionRow[]> {
  const sb = getSupabase();
  const { data, error } = await withTimeout(
    sb.from('role_permissions').select('role, module, allowed')
  );
  if (error) throw error;
  return data ?? [];
}

export async function saveRolePermission(role: string, module: string, allowed: boolean): Promise<void> {
  const sb = getSupabase();
  const { error } = await withTimeout(
    sb.from('role_permissions').upsert({ role, module, allowed, updated_at: new Date().toISOString() })
  );
  if (error) throw error;
}

/* ================================================================== */
/* Logo da empresa — Supabase Storage (bucket "branding", público)      */
/* ================================================================== */
const LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const LOGO_ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];

export async function uploadLogo(file: File): Promise<string> {
  if (!LOGO_ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Formato não suportado — envie PNG, JPG, SVG ou WEBP.');
  }
  if (file.size > LOGO_MAX_BYTES) {
    throw new Error('Arquivo maior que 2 MB.');
  }
  const sb = getSupabase();
  const ext = file.name.split('.').pop() || 'png';
  const path = `logo-${Date.now()}.${ext}`;
  const { error } = await withTimeout(
    sb.storage.from('branding').upload(path, file, { upsert: true, cacheControl: '3600' })
  );
  if (error) throw error;
  const { data } = sb.storage.from('branding').getPublicUrl(path);
  return data.publicUrl;
}

/* ================================================================== */
/* Usuários reais (Supabase Auth) — só leitura.                         */
/* Criar/editar/desativar é feito direto no painel do Supabase: alterar */
/* login exige a Admin API (chave service_role), que não fica no front. */
/* ================================================================== */
export interface RealUser {
  id: string;
  name: string;
  sector: string | null;
  roles: string[];
}

export async function fetchRealUsers(): Promise<RealUser[]> {
  const sb = getSupabase();
  const [{ data: profiles, error: pErr }, { data: roles, error: rErr }] = await withTimeout(Promise.all([
    sb.from('profiles').select('id, full_name, sector'),
    sb.from('user_roles').select('user_id, role'),
  ]));
  if (pErr) throw pErr;
  if (rErr) throw rErr;
  const roleMap = new Map<string, string[]>();
  (roles ?? []).forEach((r: { user_id: string; role: string }) => {
    roleMap.set(r.user_id, [...(roleMap.get(r.user_id) ?? []), r.role]);
  });
  return (profiles ?? [])
    .map((p: { id: string; full_name: string; sector: string | null }) => ({
      id: p.id,
      name: p.full_name,
      sector: p.sector,
      roles: roleMap.get(p.id) ?? ['solicitante'],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Papéis do banco (public.app_role) que correspondem a um papel do front. */
export function dbRolesFor(role: Role): string[] {
  switch (role) {
    case 'gestor': return ['admin', 'gestor'];
    case 'comprador': return ['compras'];
    case 'financeiro': return ['financeiro'];
    case 'solicitante': return ['solicitante'];
  }
}

export function buildPermissionMap(rows: RolePermissionRow[]): Map<string, boolean> {
  return new Map(rows.map((r) => [`${r.role}:${r.module}`, r.allowed]));
}

export function isModuleAllowed(perms: Map<string, boolean>, role: Role, module: string): boolean {
  return dbRolesFor(role).some((r) => perms.get(`${r}:${module}`) === true);
}
