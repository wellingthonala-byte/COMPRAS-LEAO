export type Role = 'gestor' | 'solicitante';

export interface AppUser {
  id: string;
  name: string;
  password: string;
  role: Role;
  initials: string;
}

export const USERS: AppUser[] = [
  { id: 'u1', name: 'Well', password: '1221', role: 'gestor', initials: 'WE' },
  { id: 'u2', name: 'Charles', password: '1221', role: 'solicitante', initials: 'CH' },
];

export function authenticate(name: string, password: string): AppUser | null {
  return USERS.find(
    (u) => u.name.toLowerCase() === name.toLowerCase() && u.password === password
  ) ?? null;
}
