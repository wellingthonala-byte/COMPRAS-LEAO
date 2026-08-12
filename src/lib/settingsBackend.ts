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
