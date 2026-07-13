import { Component, Fragment, ReactNode, useEffect, useMemo, useState } from 'react';
import {
  Package, Clock, CheckCircle, XCircle, DollarSign, PiggyBank, Timer, Truck,
  ArrowUpRight, ArrowDownRight, Minus, Search, Download, Printer, FileSpreadsheet,
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Columns3, Trophy, RefreshCw,
  FilterX, AlertTriangle, Info,
} from 'lucide-react';
import { Header } from '../components/Layout/Header';
import { colorFromInitials } from '../utils/colors';
import { PurchaseRequest, Status, Priority } from '../types';

/* ------------------------------------------------------------------ */
/* Paleta categórica validada (ordem fixa, CVD-safe)                    */
/* ------------------------------------------------------------------ */
const CAT = ['#7c3aed', '#059669', '#d97706', '#2563eb', '#dc2626', '#0891b2'];

const STATUS_ORDER: Status[] = [
  'Nova Solicitação', 'Em Aprovação', 'Em Cotação', 'Comprado',
  'Em Rota', 'Em Serviço', 'Disponível para Retirada', 'Finalizado',
];
const STATUS_COLORS: Record<string, string> = {
  'Nova Solicitação': '#7c3aed',
  'Em Aprovação': '#6366f1',
  'Em Cotação': '#2563eb',
  'Comprado': '#059669',
  'Em Rota': '#d97706',
  'Em Serviço': '#ea580c',
  'Disponível para Retirada': '#64748b',
  'Finalizado': '#8b5cf6',
};

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (s: string) => new Date(s).toLocaleDateString('pt-BR');

/* ------------------------------------------------------------------ */
/* Períodos                                                            */
/* ------------------------------------------------------------------ */
type PeriodKey = 'todos' | 'hoje' | 'ontem' | '7d' | '30d' | 'mes' | 'mes-anterior' | 'ano';
const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'todos', label: 'Todo o período' },
  { key: 'hoje', label: 'Hoje' },
  { key: 'ontem', label: 'Ontem' },
  { key: '7d', label: 'Últimos 7 dias' },
  { key: '30d', label: 'Últimos 30 dias' },
  { key: 'mes', label: 'Este mês' },
  { key: 'mes-anterior', label: 'Mês anterior' },
  { key: 'ano', label: 'Este ano' },
];

function periodRange(key: PeriodKey): { start: Date; end: Date } | null {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = startOfDay(now);
  switch (key) {
    case 'todos': return null;
    case 'hoje': return { start: today, end: new Date(today.getTime() + 86400000) };
    case 'ontem': return { start: new Date(today.getTime() - 86400000), end: today };
    case '7d': return { start: new Date(today.getTime() - 6 * 86400000), end: new Date(today.getTime() + 86400000) };
    case '30d': return { start: new Date(today.getTime() - 29 * 86400000), end: new Date(today.getTime() + 86400000) };
    case 'mes': return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
    case 'mes-anterior': return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 1) };
    case 'ano': return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear() + 1, 0, 1) };
  }
}

/* ------------------------------------------------------------------ */
/* Métricas derivadas dos dados reais                                  */
/* ------------------------------------------------------------------ */
function isApproved(r: PurchaseRequest): boolean {
  if (r.approvedBy) return true;
  if (r.history.some((h) => h.action.toLowerCase().includes('aprovad'))) return true;
  return STATUS_ORDER.indexOf(r.status) > 1;
}
function hasOpenObjection(r: PurchaseRequest): boolean {
  return r.items.some((i) => (i.objections ?? []).some((o) => !o.resolved));
}
function approvalHours(r: PurchaseRequest): number | null {
  const entry = r.history.find((h) => h.action.toLowerCase().includes('aprovad'))
    ?? r.history.find((h) => h.from === 'Em Aprovação' || (h.to && STATUS_ORDER.indexOf(h.to) > 1));
  const end = r.approvedAt ?? entry?.date;
  if (!end) return null;
  const ms = new Date(end).getTime() - new Date(r.createdAt).getTime();
  return ms > 0 ? ms / 3600000 : null;
}
function computeKpis(rs: PurchaseRequest[]) {
  const approved = rs.filter(isApproved).length;
  const rejected = rs.filter(hasOpenObjection).length;
  const pending = rs.filter((r) => r.status === 'Nova Solicitação' || r.status === 'Em Aprovação').length;
  const totalValue = rs.reduce((s, r) => s + (r.value ?? 0), 0);
  const times = rs.map(approvalHours).filter((t): t is number => t !== null);
  const avgApproval = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
  const suppliers = new Set(rs.map((r) => r.supplier).filter(Boolean)).size;
  return { total: rs.length, pending, approved, rejected, totalValue, avgApproval, suppliers };
}
function fmtHours(h: number | null): string {
  if (h === null) return '—';
  if (h < 1) return `${Math.round(h * 60)}min`;
  if (h < 48) return `${h.toFixed(1).replace('.', ',')}h`;
  return `${(h / 24).toFixed(1).replace('.', ',')}d`;
}

/* ------------------------------------------------------------------ */
/* Exportação (CSV / Excel / Impressão) — sem dependências             */
/* ------------------------------------------------------------------ */
function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob(['﻿' + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
function exportCSV(headers: string[], rows: (string | number)[][], name: string) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [headers.map(esc).join(';'), ...rows.map((r) => r.map(esc).join(';'))].join('\n');
  downloadBlob(csv, `${name}.csv`, 'text/csv;charset=utf-8');
}
function exportExcel(headers: string[], rows: (string | number)[][], name: string) {
  const esc = (v: string | number) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body><table border="1"><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table></body></html>`;
  downloadBlob(html, `${name}.xls`, 'application/vnd.ms-excel');
}

/* ------------------------------------------------------------------ */
/* Gráficos SVG                                                        */
/* ------------------------------------------------------------------ */
function Donut({ slices, centerLabel }: { slices: { label: string; value: number; color: string }[]; centerLabel: string }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total === 0) return <EmptyChart />;
  const r = 52, cx = 64, cy = 64, C = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width="128" height="128" viewBox="0 0 128 128" role="img" aria-label={`Distribuição: ${slices.map((s) => `${s.label} ${s.value}`).join(', ')}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth="18" />
      {slices.map((s, i) => {
        if (s.value === 0) return null;
        const frac = s.value / total;
        const rot = (acc / total) * 360 - 90;
        acc += s.value;
        return (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth="18"
            strokeDasharray={`${Math.max(frac * C - 2, 0.5)} ${C}`} transform={`rotate(${rot} ${cx} ${cy})`}
            className="transition-opacity hover:opacity-80">
            <title>{`${s.label}: ${s.value} (${Math.round(frac * 100)}%)`}</title>
          </circle>
        );
      })}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="20" fontWeight="700" fill="#1e293b">{total}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize="9" fill="#94a3b8">{centerLabel}</text>
    </svg>
  );
}

function LineChart({ data, format }: { data: { label: string; value: number }[]; format?: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length === 0 || data.every((d) => d.value === 0)) return <EmptyChart />;
  const w = 320, h = 130, padX = 10, padY = 14;
  const max = Math.max(...data.map((d) => d.value), 1);
  const step = data.length > 1 ? (w - padX * 2) / (data.length - 1) : 0;
  const pts = data.map((d, i) => ({
    x: padX + i * step,
    y: padY + (1 - d.value / max) * (h - padY * 2),
  }));
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const area = `${path} L${pts[pts.length - 1].x},${h - 4} L${pts[0].x},${h - 4} Z`;
  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="overflow-visible" role="img" aria-label="Gráfico de linha">
        <defs>
          <linearGradient id="repLineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={padX} x2={w - padX} y1={padY + f * (h - padY * 2)} y2={padY + f * (h - padY * 2)} stroke="#f1f5f9" strokeWidth="1" />
        ))}
        <path d={area} fill="url(#repLineGrad)" />
        <path d={path} stroke="#7c3aed" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <circle cx={p.x} cy={p.y} r="10" fill="transparent" />
            <circle cx={p.x} cy={p.y} r={hover === i ? 5 : 3.5} fill="white" stroke="#7c3aed" strokeWidth="2" className="transition-all" />
            {hover === i && (
              <text x={p.x} y={p.y - 9} textAnchor="middle" fontSize="10" fontWeight="700" fill="#7c3aed">
                {format ? format(data[i].value) : data[i].value}
              </text>
            )}
            <title>{`${data[i].label}: ${format ? format(data[i].value) : data[i].value}`}</title>
          </g>
        ))}
      </svg>
      <div className="flex justify-between px-1 mt-1">
        {data.map((d, i) => (
          <span key={i} className={`text-[9px] ${hover === i ? 'text-violet-600 font-semibold' : 'text-slate-400'}`}>{d.label}</span>
        ))}
      </div>
    </div>
  );
}

function BarChart({ data, color = '#7c3aed', format }: { data: { label: string; value: number }[]; color?: string; format?: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length === 0 || data.every((d) => d.value === 0)) return <EmptyChart />;
  const w = 320, h = 130, padY = 16;
  const max = Math.max(...data.map((d) => d.value), 1);
  const slot = w / data.length;
  const bw = Math.min(slot * 0.55, 34);
  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Gráfico de barras">
        {data.map((d, i) => {
          const bh = Math.max((d.value / max) * (h - padY * 2), d.value > 0 ? 3 : 0);
          const x = i * slot + (slot - bw) / 2;
          const y = h - 6 - bh;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={i * slot} y={0} width={slot} height={h} fill="transparent" />
              <path
                d={`M${x},${y + bh} L${x},${y + 4} Q${x},${y} ${x + 4},${y} L${x + bw - 4},${y} Q${x + bw},${y} ${x + bw},${y + 4} L${x + bw},${y + bh} Z`}
                fill={color} opacity={hover === null || hover === i ? 1 : 0.45} className="transition-opacity" />
              {hover === i && (
                <text x={x + bw / 2} y={y - 5} textAnchor="middle" fontSize="10" fontWeight="700" fill="#1e293b">
                  {format ? format(d.value) : d.value}
                </text>
              )}
              <title>{`${d.label}: ${format ? format(d.value) : d.value}`}</title>
            </g>
          );
        })}
      </svg>
      <div className="grid mt-1" style={{ gridTemplateColumns: `repeat(${data.length}, 1fr)` }}>
        {data.map((d, i) => (
          <span key={i} className={`text-[9px] text-center truncate ${hover === i ? 'text-slate-700 font-semibold' : 'text-slate-400'}`}>{d.label}</span>
        ))}
      </div>
    </div>
  );
}

function HBarChart({ data, format }: { data: { label: string; value: number; color?: string }[]; format?: (v: number) => string }) {
  if (data.length === 0 || data.every((d) => d.value === 0)) return <EmptyChart />;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-2.5" role="img" aria-label="Gráfico de barras horizontais">
      {data.map((d, i) => (
        <div key={i} className="group" title={`${d.label}: ${format ? format(d.value) : d.value}`}>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-600 truncate pr-2">{d.label}</span>
            <span className="font-semibold text-slate-800 whitespace-nowrap">{format ? format(d.value) : d.value}</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500 group-hover:opacity-80"
              style={{ width: `${(d.value / max) * 100}%`, backgroundColor: d.color ?? CAT[i % CAT.length] }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyChart({ note }: { note?: string }) {
  return (
    <div className="h-32 flex flex-col items-center justify-center text-slate-300 gap-1.5">
      <Info size={18} />
      <p className="text-xs text-slate-400">{note ?? 'Sem dados para o período selecionado'}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* KPI Card                                                            */
/* ------------------------------------------------------------------ */
interface KpiDef {
  label: string; value: string; icon: typeof Package;
  color: string; bg: string; delta: number | null; tooltip: string;
  invert?: boolean;
}
function KpiCard({ k }: { k: KpiDef }) {
  const Icon = k.icon;
  const positive = k.delta !== null && (k.invert ? k.delta < 0 : k.delta > 0);
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all group relative" tabIndex={0}>
      <div className="flex items-center justify-between mb-2">
        <div className={`w-9 h-9 rounded-xl ${k.bg} flex items-center justify-center`}>
          <Icon size={17} className={k.color} />
        </div>
        {k.delta !== null ? (
          <span className={`flex items-center gap-0.5 text-xs font-semibold ${positive ? 'text-emerald-600' : 'text-red-500'}`}>
            {k.delta > 0 ? <ArrowUpRight size={12} /> : k.delta < 0 ? <ArrowDownRight size={12} /> : <Minus size={12} />}
            {Math.abs(k.delta)}%
          </span>
        ) : (
          <span className="text-xs text-slate-300 font-medium">—</span>
        )}
      </div>
      <p className="text-xl font-bold text-slate-800 truncate">{k.value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{k.label}</p>
      <p className="text-[10px] text-slate-400 mt-0.5">{k.delta !== null ? 'vs. período anterior' : 'sem comparativo'}</p>
      {/* Tooltip */}
      <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-52 bg-slate-800 text-white text-[11px] leading-snug rounded-lg px-3 py-2 opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity z-20 shadow-lg">
        {k.tooltip}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tabela genérica: busca, ordenação, paginação, colunas, seleção,     */
/* agrupamento e exportação                                            */
/* ------------------------------------------------------------------ */
interface ColumnDef<T> {
  key: string; label: string;
  value: (row: T) => string | number;
  render?: (row: T) => ReactNode;
  align?: 'left' | 'right';
}
function DataTable<T>({ title, columns, rows, getId, groupOptions }: {
  title: string;
  columns: ColumnDef<T>[];
  rows: T[];
  getId: (row: T) => string;
  groupOptions?: { key: string; label: string; value: (row: T) => string }[];
}) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showCols, setShowCols] = useState(false);
  const [groupBy, setGroupBy] = useState('');
  const PAGE_SIZE = 8;

  const visibleCols = columns.filter((c) => !hidden.has(c.key));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = q
      ? rows.filter((r) => columns.some((c) => String(c.value(r)).toLowerCase().includes(q)))
      : [...rows];
    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      if (col) out.sort((a, b) => {
        const va = col.value(a), vb = col.value(b);
        const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR');
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    const grouper = groupOptions?.find((g) => g.key === groupBy);
    if (grouper) out.sort((a, b) => grouper.value(a).localeCompare(grouper.value(b), 'pt-BR'));
    return out;
  }, [rows, search, sortKey, sortDir, groupBy, columns, groupOptions]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const grouper = groupOptions?.find((g) => g.key === groupBy);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };
  const exportRows = () => {
    const source = selected.size > 0 ? filtered.filter((r) => selected.has(getId(r))) : filtered;
    return source.map((r) => visibleCols.map((c) => c.value(r)));
  };
  const allPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(getId(r)));
  const togglePageSelection = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageRows.forEach((r) => next.delete(getId(r)));
      else pageRows.forEach((r) => next.add(getId(r)));
      return next;
    });
  };

  let lastGroup: string | null = null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100">
        <h3 className="font-semibold text-slate-700 text-sm mr-auto">{title}</h3>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Pesquisar..." aria-label={`Pesquisar em ${title}`}
            className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg w-44 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        {groupOptions && (
          <select value={groupBy} onChange={(e) => { setGroupBy(e.target.value); setPage(1); }}
            aria-label="Agrupar por"
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500">
            <option value="">Sem agrupamento</option>
            {groupOptions.map((g) => <option key={g.key} value={g.key}>Agrupar: {g.label}</option>)}
          </select>
        )}
        <div className="relative">
          <button onClick={() => setShowCols((v) => !v)} aria-label="Ocultar/mostrar colunas"
            className="flex items-center gap-1 text-xs text-slate-500 border border-slate-200 rounded-lg px-2 py-1.5 hover:bg-slate-50">
            <Columns3 size={13} /> Colunas
          </button>
          {showCols && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setShowCols(false)} />
              <div className="absolute right-0 top-9 bg-white border border-slate-200 rounded-xl shadow-lg z-30 p-2 w-44">
                {columns.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 text-xs text-slate-600 px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer">
                    <input type="checkbox" checked={!hidden.has(c.key)}
                      onChange={() => setHidden((prev) => {
                        const next = new Set(prev);
                        if (next.has(c.key)) next.delete(c.key); else if (next.size < columns.length - 1) next.add(c.key);
                        return next;
                      })}
                      className="accent-violet-600" />
                    {c.label}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => exportCSV(visibleCols.map((c) => c.label), exportRows(), title.toLowerCase().replace(/\s+/g, '-'))}
            title="Exportar CSV" aria-label="Exportar CSV"
            className="flex items-center gap-1 text-xs text-slate-500 border border-slate-200 rounded-lg px-2 py-1.5 hover:bg-slate-50 hover:text-violet-700">
            <Download size={13} /> CSV
          </button>
          <button onClick={() => exportExcel(visibleCols.map((c) => c.label), exportRows(), title.toLowerCase().replace(/\s+/g, '-'))}
            title="Exportar Excel" aria-label="Exportar Excel"
            className="flex items-center gap-1 text-xs text-slate-500 border border-slate-200 rounded-lg px-2 py-1.5 hover:bg-slate-50 hover:text-emerald-700">
            <FileSpreadsheet size={13} /> Excel
          </button>
          <button onClick={() => window.print()} title="Imprimir / salvar em PDF" aria-label="Imprimir ou salvar em PDF"
            className="flex items-center gap-1 text-xs text-slate-500 border border-slate-200 rounded-lg px-2 py-1.5 hover:bg-slate-50 hover:text-slate-800">
            <Printer size={13} /> PDF
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th scope="col" className="px-4 py-2.5 w-8">
                <input type="checkbox" checked={allPageSelected} onChange={togglePageSelection}
                  aria-label="Selecionar página" className="accent-violet-600" />
              </th>
              {visibleCols.map((c) => (
                <th key={c.key} scope="col"
                  className={`px-3 py-2.5 text-xs font-semibold text-slate-500 whitespace-nowrap ${c.align === 'right' ? 'text-right' : ''}`}>
                  <button onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-slate-800">
                    {c.label}
                    {sortKey === c.key ? (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={visibleCols.length + 1} className="px-4 py-10 text-center text-xs text-slate-400">
                  Nenhum resultado encontrado{search ? ` para “${search}”` : ''}.
                </td>
              </tr>
            ) : (
              pageRows.map((row) => {
                const id = getId(row);
                const groupVal = grouper ? grouper.value(row) : null;
                const showGroupHeader = grouper && groupVal !== lastGroup;
                lastGroup = groupVal;
                return (
                  <Fragment key={id}>
                    {showGroupHeader && (
                      <tr className="bg-violet-50/60">
                        <td colSpan={visibleCols.length + 1} className="px-4 py-1.5 text-[11px] font-semibold text-violet-700">
                          {grouper!.label}: {groupVal}
                        </td>
                      </tr>
                    )}
                    <tr className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/70 transition-colors ${selected.has(id) ? 'bg-violet-50/40' : ''}`}>
                      <td className="px-4 py-2.5">
                        <input type="checkbox" checked={selected.has(id)}
                          onChange={() => setSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(id)) next.delete(id); else next.add(id);
                            return next;
                          })}
                          aria-label={`Selecionar linha ${id}`} className="accent-violet-600" />
                      </td>
                      {visibleCols.map((c) => (
                        <td key={c.key} className={`px-3 py-2.5 text-xs text-slate-600 ${c.align === 'right' ? 'text-right' : ''}`}>
                          {c.render ? c.render(row) : c.value(row)}
                        </td>
                      ))}
                    </tr>
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 text-xs text-slate-500">
        <span>
          {filtered.length} registro(s){selected.size > 0 ? ` · ${selected.size} selecionado(s)` : ''}
        </span>
        <div className="flex items-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}
            aria-label="Página anterior"
            className="p-1 rounded-lg border border-slate-200 disabled:opacity-30 hover:bg-slate-50">
            <ChevronLeft size={14} />
          </button>
          <span>Página {safePage} de {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}
            aria-label="Próxima página"
            className="p-1 rounded-lg border border-slate-200 disabled:opacity-30 hover:bg-slate-50">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ranking                                                             */
/* ------------------------------------------------------------------ */
function RankingCard({ title, entries, format }: { title: string; entries: { label: string; value: number; sub?: string }[]; format?: (v: number) => string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Trophy size={14} className="text-amber-500" />
        <h3 className="font-semibold text-slate-700 text-xs">{title}</h3>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-slate-400 py-4 text-center">Sem dados</p>
      ) : (
        <ol className="space-y-2">
          {entries.map((e, i) => (
            <li key={e.label} className="flex items-center gap-2.5">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-200 text-slate-600' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-400'
              }`}>{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-700 truncate font-medium">{e.label}</p>
                {e.sub && <p className="text-[10px] text-slate-400 truncate">{e.sub}</p>}
              </div>
              <span className="text-xs font-bold text-slate-800 whitespace-nowrap">{format ? format(e.value) : e.value}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Skeleton / Error boundary                                           */
/* ------------------------------------------------------------------ */
function Skeleton() {
  return (
    <div className="space-y-5 animate-pulse" aria-busy="true" aria-label="Carregando relatórios">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-28 bg-slate-200/60 rounded-2xl" />)}
      </div>
      <div className="h-12 bg-slate-200/60 rounded-2xl" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-56 bg-slate-200/60 rounded-2xl" />)}
      </div>
      <div className="h-72 bg-slate-200/60 rounded-2xl" />
    </div>
  );
}

class ReportErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-white rounded-2xl border border-red-200 p-10 text-center">
          <AlertTriangle size={28} className="text-red-500 mx-auto mb-3" />
          <h3 className="font-semibold text-slate-800 mb-1">Erro ao carregar os relatórios</h3>
          <p className="text-sm text-slate-500 mb-4">Ocorreu um problema ao processar os dados. Tente novamente.</p>
          <button onClick={() => this.setState({ hasError: false })}
            className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <RefreshCw size={14} /> Tentar novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ------------------------------------------------------------------ */
/* Página                                                              */
/* ------------------------------------------------------------------ */
interface ReportsPageProps { requests: PurchaseRequest[] }

export function ReportsPage({ requests }: ReportsPageProps) {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodKey>('todos');
  const [fSector, setFSector] = useState('');
  const [fRequester, setFRequester] = useState('');
  const [fSupplier, setFSupplier] = useState('');
  const [fCategory, setFCategory] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fPriority, setFPriority] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 450);
    return () => clearTimeout(t);
  }, []);

  const sectors = useMemo(() => [...new Set(requests.map((r) => r.sector))].sort(), [requests]);
  const requesters = useMemo(() => [...new Set(requests.map((r) => r.requester))].sort(), [requests]);
  const suppliers = useMemo(() => [...new Set(requests.map((r) => r.supplier).filter((s): s is string => !!s))].sort(), [requests]);
  const categories = useMemo(() => [...new Set(requests.flatMap((r) => r.items.map((i) => i.application)).filter(Boolean))].sort(), [requests]);

  const hasFilters = period !== 'todos' || !!fSector || !!fRequester || !!fSupplier || !!fCategory || !!fStatus || !!fPriority;
  const clearFilters = () => { setPeriod('todos'); setFSector(''); setFRequester(''); setFSupplier(''); setFCategory(''); setFStatus(''); setFPriority(''); };

  const filtered = useMemo(() => {
    const range = periodRange(period);
    return requests.filter((r) => {
      if (range) {
        const d = new Date(r.createdAt);
        if (d < range.start || d >= range.end) return false;
      }
      if (fSector && r.sector !== fSector) return false;
      if (fRequester && r.requester !== fRequester) return false;
      if (fSupplier && r.supplier !== fSupplier) return false;
      if (fCategory && !r.items.some((i) => i.application === fCategory)) return false;
      if (fStatus && r.status !== fStatus) return false;
      if (fPriority && r.priority !== fPriority) return false;
      return true;
    });
  }, [requests, period, fSector, fRequester, fSupplier, fCategory, fStatus, fPriority]);

  /* Período anterior para comparação */
  const previous = useMemo(() => {
    const range = periodRange(period);
    if (!range) return null;
    const len = range.end.getTime() - range.start.getTime();
    const prevStart = new Date(range.start.getTime() - len);
    return requests.filter((r) => {
      const d = new Date(r.createdAt);
      return d >= prevStart && d < range.start;
    });
  }, [requests, period]);

  const kpi = useMemo(() => computeKpis(filtered), [filtered]);
  const kpiPrev = useMemo(() => (previous ? computeKpis(previous) : null), [previous]);
  const delta = (cur: number, prev?: number | null): number | null => {
    if (kpiPrev === null || prev === undefined || prev === null) return null;
    if (prev === 0) return cur > 0 ? 100 : 0;
    return Math.round(((cur - prev) / prev) * 100);
  };

  const kpis: KpiDef[] = [
    { label: 'Total de Solicitações', value: String(kpi.total), icon: Package, color: 'text-violet-600', bg: 'bg-violet-50', delta: delta(kpi.total, kpiPrev?.total), tooltip: 'Quantidade total de solicitações criadas no período e filtros selecionados.' },
    { label: 'Solicitações Pendentes', value: String(kpi.pending), icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', delta: delta(kpi.pending, kpiPrev?.pending), invert: true, tooltip: 'Solicitações aguardando aprovação (Nova Solicitação ou Em Aprovação).' },
    { label: 'Solicitações Aprovadas', value: String(kpi.approved), icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50', delta: delta(kpi.approved, kpiPrev?.approved), tooltip: 'Solicitações aprovadas pelo gestor ou que já avançaram no fluxo de compra.' },
    { label: 'Solicitações Reprovadas', value: String(kpi.rejected), icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', delta: delta(kpi.rejected, kpiPrev?.rejected), invert: true, tooltip: 'Solicitações com objeções em aberto que exigem correção e reenvio.' },
    { label: 'Valor Total das Compras', value: fmtBRL(kpi.totalValue), icon: DollarSign, color: 'text-blue-600', bg: 'bg-blue-50', delta: delta(kpi.totalValue, kpiPrev?.totalValue), tooltip: 'Soma dos valores negociados nas solicitações com compra registrada.' },
    { label: 'Economia Obtida', value: '—', icon: PiggyBank, color: 'text-cyan-600', bg: 'bg-cyan-50', delta: null, tooltip: 'Estrutura pronta: requer os valores orçado × negociado no banco de dados para calcular a economia.' },
    { label: 'Tempo Médio de Aprovação', value: fmtHours(kpi.avgApproval), icon: Timer, color: 'text-indigo-600', bg: 'bg-indigo-50', delta: kpiPrev && kpi.avgApproval !== null && kpiPrev.avgApproval !== null ? delta(kpi.avgApproval, kpiPrev.avgApproval) : null, invert: true, tooltip: 'Tempo médio entre a criação da solicitação e a aprovação do gestor.' },
    { label: 'Fornecedores Ativos', value: String(kpi.suppliers), icon: Truck, color: 'text-emerald-700', bg: 'bg-emerald-50', delta: delta(kpi.suppliers, kpiPrev?.suppliers), tooltip: 'Fornecedores distintos com compras registradas no período.' },
  ];

  /* -------------------- Séries dos gráficos -------------------- */
  const evolution = useMemo(() => {
    const byDay = new Map<string, number>();
    filtered.forEach((r) => {
      const k = r.createdAt.slice(0, 10);
      byDay.set(k, (byDay.get(k) ?? 0) + 1);
    });
    return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-14)
      .map(([k, v]) => ({ label: `${k.slice(8, 10)}/${k.slice(5, 7)}`, value: v }));
  }, [filtered]);

  const purchasesByMonth = useMemo(() => {
    const byMonth = new Map<string, number>();
    filtered.forEach((r) => {
      if (!r.value) return;
      const k = r.createdAt.slice(0, 7);
      byMonth.set(k, (byMonth.get(k) ?? 0) + r.value);
    });
    return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-6)
      .map(([k, v]) => ({ label: `${k.slice(5, 7)}/${k.slice(2, 4)}`, value: v }));
  }, [filtered]);

  const statusSlices = useMemo(() =>
    STATUS_ORDER.map((s) => ({ label: s, value: filtered.filter((r) => r.status === s).length, color: STATUS_COLORS[s] })),
  [filtered]);

  const bySupplier = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((r) => { if (r.supplier && r.value) m.set(r.supplier, (m.get(r.supplier) ?? 0) + r.value); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value], i) => ({ label, value, color: CAT[i % CAT.length] }));
  }, [filtered]);

  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((r) => r.items.forEach((i) => { if (i.application) m.set(i.application, (m.get(i.application) ?? 0) + i.quantity); }));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value], i) => ({ label, value, color: CAT[i % CAT.length] }));
  }, [filtered]);

  const approvalByMonth = useMemo(() => {
    const m = new Map<string, number[]>();
    filtered.forEach((r) => {
      const t = approvalHours(r);
      if (t === null) return;
      const k = r.createdAt.slice(0, 7);
      m.set(k, [...(m.get(k) ?? []), t]);
    });
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-6)
      .map(([k, arr]) => ({ label: `${k.slice(5, 7)}/${k.slice(2, 4)}`, value: Math.round((arr.reduce((s, x) => s + x, 0) / arr.length) * 10) / 10 }));
  }, [filtered]);

  const prioritySlices = useMemo(() => {
    const order: Priority[] = ['Máquina Parada', 'Urgente', 'Não Urgente'];
    const colors = ['#dc2626', '#d97706', '#2563eb'];
    return order.map((p, i) => ({ label: p, value: filtered.filter((r) => r.priority === p).length, color: colors[i] }));
  }, [filtered]);

  /* -------------------- Rankings -------------------- */
  const topSuppliers = useMemo(() => {
    const m = new Map<string, { count: number; value: number }>();
    filtered.forEach((r) => {
      if (!r.supplier) return;
      const cur = m.get(r.supplier) ?? { count: 0, value: 0 };
      m.set(r.supplier, { count: cur.count + 1, value: cur.value + (r.value ?? 0) });
    });
    return [...m.entries()].sort((a, b) => b[1].value - a[1].value).slice(0, 10)
      .map(([label, v]) => ({ label, value: v.value, sub: `${v.count} compra(s)` }));
  }, [filtered]);

  const topProducts = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((r) => r.items.forEach((i) => m.set(i.description, (m.get(i.description) ?? 0) + i.quantity)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, value]) => ({ label, value }));
  }, [filtered]);

  const topCategories = useMemo(() =>
    byCategory.slice(0, 5).map((c) => ({ label: c.label, value: c.value })),
  [byCategory]);

  const topBuyers = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((r) => r.history.forEach((h) => {
      if (h.action.toLowerCase().includes('status')) m.set(h.user, (m.get(h.user) ?? 0) + 1);
    }));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, value]) => ({ label, value, sub: 'movimentações' }));
  }, [filtered]);

  const topRequesters = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((r) => m.set(r.requester, (m.get(r.requester) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, value]) => ({ label, value, sub: 'solicitações' }));
  }, [filtered]);

  /* -------------------- Linhas das tabelas -------------------- */
  const purchaseRows = useMemo(() =>
    filtered.filter((r) => r.supplier || r.value).flatMap((r) =>
      r.items.map((i) => ({
        id: `${r.id}-${i.id}`,
        supplier: r.supplier ?? '—',
        product: i.description,
        quantity: i.quantity,
        unit: r.value ? r.value / Math.max(r.items.reduce((s, x) => s + x.quantity, 0), 1) : 0,
        total: r.value ? (r.value / Math.max(r.items.reduce((s, x) => s + x.quantity, 0), 1)) * i.quantity : 0,
        date: r.createdAt,
      }))
    ),
  [filtered]);

  const supplierRows = useMemo(() => {
    const m = new Map<string, { count: number; value: number; last: string; deliveries: number[] }>();
    filtered.forEach((r) => {
      if (!r.supplier) return;
      const cur = m.get(r.supplier) ?? { count: 0, value: 0, last: r.createdAt, deliveries: [] };
      cur.count += 1;
      cur.value += r.value ?? 0;
      if (r.createdAt > cur.last) cur.last = r.createdAt;
      if (r.realDeliveryDate) {
        const days = (new Date(r.realDeliveryDate).getTime() - new Date(r.createdAt).getTime()) / 86400000;
        if (days > 0) cur.deliveries.push(days);
      }
      m.set(r.supplier, cur);
    });
    return [...m.entries()].map(([name, v]) => ({
      id: name, name, count: v.count, value: v.value, last: v.last,
      avgDelivery: v.deliveries.length ? v.deliveries.reduce((s, x) => s + x, 0) / v.deliveries.length : null,
    }));
  }, [filtered]);

  const selectCls = 'text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500 min-w-0';

  return (
    <div className="flex flex-col min-h-screen lg:pl-60 bg-slate-50">
      <Header title="Relatórios" subtitle="Business Intelligence — análise de compras e solicitações" requests={requests} />
      <div className="flex-1 pt-16 px-4 md:px-6 py-6">
        {loading ? <Skeleton /> : (
          <ReportErrorBoundary>
            <div className="space-y-5">

              {/* Filtros inteligentes */}
              <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm flex flex-wrap items-center gap-2">
                <select value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)} className={selectCls} aria-label="Período">
                  {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
                <select value={fSector} onChange={(e) => setFSector(e.target.value)} className={selectCls} aria-label="Centro de custo">
                  <option value="">Centro de custo</option>
                  {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={fRequester} onChange={(e) => setFRequester(e.target.value)} className={selectCls} aria-label="Solicitante">
                  <option value="">Solicitante</option>
                  {requesters.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={fSupplier} onChange={(e) => setFSupplier(e.target.value)} className={selectCls} aria-label="Fornecedor">
                  <option value="">Fornecedor</option>
                  {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={fCategory} onChange={(e) => setFCategory(e.target.value)} className={selectCls} aria-label="Categoria">
                  <option value="">Categoria</option>
                  {categories.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className={selectCls} aria-label="Status">
                  <option value="">Status</option>
                  {STATUS_ORDER.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={fPriority} onChange={(e) => setFPriority(e.target.value)} className={selectCls} aria-label="Prioridade">
                  <option value="">Prioridade</option>
                  {(['Máquina Parada', 'Urgente', 'Não Urgente'] as Priority[]).map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                {hasFilters && (
                  <button onClick={clearFilters}
                    className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-300 rounded-lg px-2.5 py-2 ml-auto">
                    <FilterX size={13} /> Limpar filtros
                  </button>
                )}
              </div>

              {/* Dashboard executivo */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {kpis.map((k) => <KpiCard key={k.label} k={k} />)}
              </div>

              {filtered.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                  <Search size={26} className="text-slate-300 mx-auto mb-3" />
                  <h3 className="font-semibold text-slate-700 mb-1">Nenhum resultado</h3>
                  <p className="text-sm text-slate-400 mb-4">Nenhuma solicitação corresponde aos filtros selecionados.</p>
                  <button onClick={clearFilters} className="text-sm text-violet-600 hover:text-violet-800 font-medium">Limpar filtros</button>
                </div>
              ) : (
                <>
                  {/* Gráficos */}
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                      <h3 className="font-semibold text-slate-700 text-sm mb-4">Evolução das Solicitações</h3>
                      <LineChart data={evolution} />
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                      <h3 className="font-semibold text-slate-700 text-sm mb-4">Compras por Mês (R$)</h3>
                      <BarChart data={purchasesByMonth} color="#2563eb" format={(v) => fmtBRL(v)} />
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                      <h3 className="font-semibold text-slate-700 text-sm mb-3">Status das Solicitações</h3>
                      <div className="flex items-center gap-4">
                        <Donut slices={statusSlices} centerLabel="Total" />
                        <div className="space-y-1 flex-1 min-w-0">
                          {statusSlices.filter((s) => s.value > 0).map((s) => (
                            <div key={s.label} className="flex items-center gap-1.5 text-[11px]">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                              <span className="text-slate-600 truncate">{s.label}</span>
                              <span className="text-slate-800 font-semibold ml-auto">{s.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                      <h3 className="font-semibold text-slate-700 text-sm mb-4">Compras por Fornecedor</h3>
                      <HBarChart data={bySupplier} format={(v) => fmtBRL(v)} />
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                      <h3 className="font-semibold text-slate-700 text-sm mb-4">Compras por Categoria (itens)</h3>
                      <HBarChart data={byCategory} />
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                      <h3 className="font-semibold text-slate-700 text-sm mb-3">Distribuição por Prioridade</h3>
                      <div className="flex items-center gap-4">
                        <Donut slices={prioritySlices} centerLabel="Total" />
                        <div className="space-y-1.5 flex-1 min-w-0">
                          {prioritySlices.map((s) => (
                            <div key={s.label} className="flex items-center gap-1.5 text-[11px]">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                              <span className="text-slate-600 truncate">{s.label}</span>
                              <span className="text-slate-800 font-semibold ml-auto">{s.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                      <h3 className="font-semibold text-slate-700 text-sm mb-4">Tempo Médio de Aprovação (horas)</h3>
                      <BarChart data={approvalByMonth} color="#059669" format={(v) => `${String(v).replace('.', ',')}h`} />
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm md:col-span-2 xl:col-span-2">
                      <h3 className="font-semibold text-slate-700 text-sm mb-4">Economia Mensal</h3>
                      <EmptyChart note="Estrutura pronta — aguardando os campos de valor orçado × negociado no banco de dados." />
                    </div>
                  </div>

                  {/* Rankings */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                    <RankingCard title="Top 10 Fornecedores" entries={topSuppliers} format={(v) => fmtBRL(v)} />
                    <RankingCard title="Produtos Mais Comprados" entries={topProducts} />
                    <RankingCard title="Categorias Mais Utilizadas" entries={topCategories} />
                    <RankingCard title="Compradores Mais Ativos" entries={topBuyers} />
                    <RankingCard title="Solicitantes — Maior Volume" entries={topRequesters} />
                  </div>

                  {/* Relatórios (tabelas) */}
                  <DataTable
                    title="Relatório de Solicitações"
                    rows={filtered}
                    getId={(r) => r.id}
                    groupOptions={[
                      { key: 'status', label: 'Status', value: (r) => r.status },
                      { key: 'sector', label: 'Centro de custo', value: (r) => r.sector },
                      { key: 'priority', label: 'Prioridade', value: (r) => r.priority },
                    ]}
                    columns={[
                      { key: 'number', label: 'Número', value: (r) => r.number, render: (r) => <span className="font-semibold text-slate-700">{r.number}</span> },
                      {
                        key: 'requester', label: 'Solicitante', value: (r) => r.requester,
                        render: (r) => (
                          <span className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                              style={{ backgroundColor: colorFromInitials(r.requesterInitials) }}>{r.requesterInitials}</span>
                            {r.requester}
                          </span>
                        ),
                      },
                      { key: 'sector', label: 'Centro de Custo', value: (r) => r.sector },
                      { key: 'date', label: 'Data', value: (r) => r.createdAt, render: (r) => fmtDate(r.createdAt) },
                      {
                        key: 'status', label: 'Status', value: (r) => r.status,
                        render: (r) => (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 whitespace-nowrap">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[r.status] }} />
                            {r.status}
                          </span>
                        ),
                      },
                      { key: 'value', label: 'Valor', value: (r) => r.value ?? 0, render: (r) => (r.value ? fmtBRL(r.value) : '—'), align: 'right' },
                      {
                        key: 'priority', label: 'Prioridade', value: (r) => r.priority,
                        render: (r) => (
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${
                            r.priority === 'Máquina Parada' ? 'bg-red-100 text-red-700' :
                            r.priority === 'Urgente' ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600'
                          }`}>{r.priority}</span>
                        ),
                      },
                    ]}
                  />

                  <DataTable
                    title="Relatório de Compras"
                    rows={purchaseRows}
                    getId={(r) => r.id}
                    groupOptions={[{ key: 'supplier', label: 'Fornecedor', value: (r) => r.supplier }]}
                    columns={[
                      { key: 'supplier', label: 'Fornecedor', value: (r) => r.supplier },
                      { key: 'product', label: 'Produto', value: (r) => r.product },
                      { key: 'quantity', label: 'Quantidade', value: (r) => r.quantity, align: 'right' },
                      { key: 'unit', label: 'Valor Unitário', value: (r) => Math.round(r.unit * 100) / 100, render: (r) => (r.unit ? fmtBRL(r.unit) : '—'), align: 'right' },
                      { key: 'total', label: 'Valor Total', value: (r) => Math.round(r.total * 100) / 100, render: (r) => (r.total ? <span className="font-semibold text-slate-800">{fmtBRL(r.total)}</span> : '—'), align: 'right' },
                      { key: 'date', label: 'Data', value: (r) => r.date, render: (r) => fmtDate(r.date) },
                    ]}
                  />

                  <DataTable
                    title="Relatório de Fornecedores"
                    rows={supplierRows}
                    getId={(r) => r.id}
                    columns={[
                      { key: 'name', label: 'Nome', value: (r) => r.name, render: (r) => <span className="font-semibold text-slate-700">{r.name}</span> },
                      { key: 'count', label: 'Qtd. de Compras', value: (r) => r.count, align: 'right' },
                      { key: 'value', label: 'Valor Comprado', value: (r) => r.value, render: (r) => fmtBRL(r.value), align: 'right' },
                      { key: 'last', label: 'Última Compra', value: (r) => r.last, render: (r) => fmtDate(r.last) },
                      {
                        key: 'avgDelivery', label: 'Tempo Médio de Entrega', value: (r) => r.avgDelivery ?? -1,
                        render: (r) => (r.avgDelivery !== null ? `${r.avgDelivery.toFixed(1).replace('.', ',')} dia(s)` : '—'), align: 'right',
                      },
                    ]}
                  />
                </>
              )}
            </div>
          </ReportErrorBoundary>
        )}
      </div>
    </div>
  );
}
