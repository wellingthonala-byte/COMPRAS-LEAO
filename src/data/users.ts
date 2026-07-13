export type Role = 'gestor' | 'solicitante' | 'comprador';

export interface AppUser {
  id: string;
  name: string;
  email?: string;
  password: string;
  role: Role;
  initials: string;
  active?: boolean;
  lastLogin?: string;
}

const USERS_KEY = 'compras-leao-users';

export const DEFAULT_USERS: AppUser[] = [
  { id: 'u1', name: 'Well', password: '1221', role: 'gestor', initials: 'WE', active: true },
  { id: 'u2', name: 'Charles', password: '1221', role: 'comprador', initials: 'CH', active: true },
  { id: 'u3', name: 'Alef', password: '1221', role: 'solicitante', initials: 'AL', active: true },
];

export function loadUsers(): AppUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* dados corrompidos: volta ao padrão */ }
  return DEFAULT_USERS;
}

export function saveUsers(users: AppUser[]): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function authenticate(name: string, password: string): AppUser | null {
  const users = loadUsers();
  const user = users.find(
    (u) => u.name.toLowerCase() === name.toLowerCase() && u.password === password && u.active !== false
  ) ?? null;
  if (user) {
    const stamped = { ...user, lastLogin: new Date().toISOString() };
    saveUsers(users.map((u) => (u.id === user.id ? stamped : u)));
    return stamped;
  }
  return null;
}
