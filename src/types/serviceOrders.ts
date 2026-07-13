export type OSStatus =
  | 'Aberta' | 'Em Análise' | 'Aguardando Aprovação' | 'Aguardando Peças'
  | 'Em Execução' | 'Em Testes' | 'Concluída' | 'Cancelada';

export type MaintenanceType = 'Corretiva' | 'Preventiva' | 'Preditiva' | 'Melhoria';
export type OSPriority = 'Baixa' | 'Média' | 'Alta' | 'Crítica';

export const OS_FLOW: OSStatus[] = [
  'Aberta', 'Em Análise', 'Aguardando Aprovação', 'Aguardando Peças', 'Em Execução', 'Em Testes', 'Concluída',
];

export interface OSEquipment {
  code: string;
  name: string;
  model?: string;
  manufacturer?: string;
  serial?: string;
  patrimony?: string;
  location?: string;
  acquiredAt?: string;
  warrantyUntil?: string;
}

export interface OSMaterial {
  id: string;
  product: string;
  code?: string;
  quantity: number;
  unit: string;
  unitValue: number;
}

export interface OSLabor {
  id: string;
  technician: string;
  hours: number;
  hourRate: number;
  extraHours: number;
}

export interface OSComment {
  id: string;
  user: string;
  text: string;
  date: string;
}

export interface OSEvent {
  id: string;
  date: string;
  user: string;
  action: string;
  from?: OSStatus;
  to?: OSStatus;
}

export interface ServiceOrder {
  id: string;
  number: string;
  title: string;
  description: string;
  type: MaintenanceType;
  category: string;
  equipment: OSEquipment;
  costCenter: string;
  requester: string;
  technician: string;
  priority: OSPriority;
  slaHours: number;
  openedAt: string;
  dueDate: string;
  startedAt?: string;
  completedAt?: string;
  status: OSStatus;
  observations?: string;
  cancelReason?: string;
  cancelledBy?: string;
  materials: OSMaterial[];
  labor: OSLabor[];
  comments: OSComment[];
  history: OSEvent[];
  purchaseRequestId?: string;
}

const OS_KEY = 'compras-leao-service-orders';

export function loadServiceOrders(): ServiceOrder[] {
  try {
    const raw = localStorage.getItem(OS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch { /* dados corrompidos: recomeça vazio */ }
  return [];
}

export function saveServiceOrders(orders: ServiceOrder[]): void {
  localStorage.setItem(OS_KEY, JSON.stringify(orders));
}

export function generateOSNumber(openedAt: string, existing: string[]): string {
  const d = new Date(openedAt);
  const suffix = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
  const nums = existing
    .filter((n) => n.endsWith(`/${suffix}`))
    .map((n) => parseInt(n.replace('OS-', '').split('/')[0], 10))
    .filter((n) => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `OS-${String(next).padStart(3, '0')}/${suffix}`;
}

export function osCost(os: ServiceOrder): number {
  const mat = os.materials.reduce((s, m) => s + m.quantity * m.unitValue, 0);
  const lab = os.labor.reduce((s, l) => s + l.hours * l.hourRate + l.extraHours * l.hourRate * 1.5, 0);
  return mat + lab;
}

export function osIsOverdue(os: ServiceOrder): boolean {
  if (os.status === 'Concluída' || os.status === 'Cancelada') return false;
  return new Date(os.dueDate + 'T23:59:59') < new Date();
}

export function osSlaMet(os: ServiceOrder): boolean | null {
  if (os.status !== 'Concluída' || !os.completedAt) return null;
  const elapsed = (new Date(os.completedAt).getTime() - new Date(os.openedAt).getTime()) / 3600000;
  return elapsed <= os.slaHours;
}

export function osElapsedHours(os: ServiceOrder): number | null {
  const end = os.completedAt ?? (os.status === 'Cancelada' ? undefined : new Date().toISOString());
  if (!end) return null;
  return (new Date(end).getTime() - new Date(os.openedAt).getTime()) / 3600000;
}
