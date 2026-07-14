import { useState } from 'react';
import { Info } from 'lucide-react';

/* Kit de gráficos SVG compartilhado (Dashboard, Relatórios, O.S.).
   Paleta categórica validada para daltonismo — ordem fixa. */
export const CAT_COLORS = ['#7c3aed', '#059669', '#d97706', '#2563eb', '#dc2626', '#0891b2'];

export function ChartEmpty({ note }: { note?: string }) {
  return (
    <div className="h-28 flex flex-col items-center justify-center text-slate-300 gap-1.5">
      <Info size={16} />
      <p className="text-xs text-slate-400">{note ?? 'Sem dados para o período'}</p>
    </div>
  );
}

export function Donut({ slices, centerLabel = 'Total', size = 120 }: {
  slices: { label: string; value: number; color: string }[]; centerLabel?: string; size?: number;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total === 0) return <ChartEmpty />;
  const r = size * 0.4, c = size / 2, C = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Distribuição: ${slices.filter((s) => s.value).map((s) => `${s.label} ${s.value}`).join(', ')}`}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="#f1f5f9" strokeWidth={size * 0.14} />
      {slices.map((s, i) => {
        if (!s.value) return null;
        const rot = (acc / total) * 360 - 90;
        acc += s.value;
        return (
          <circle key={i} cx={c} cy={c} r={r} fill="none" stroke={s.color} strokeWidth={size * 0.14}
            strokeDasharray={`${Math.max((s.value / total) * C - 2, 0.5)} ${C}`} transform={`rotate(${rot} ${c} ${c})`}
            className="transition-opacity hover:opacity-80">
            <title>{`${s.label}: ${s.value} (${Math.round((s.value / total) * 100)}%)`}</title>
          </circle>
        );
      })}
      <text x={c} y={c - 2} textAnchor="middle" fontSize={size * 0.16} fontWeight="700" fill="#1e293b">{total}</text>
      <text x={c} y={c + size * 0.12} textAnchor="middle" fontSize={size * 0.075} fill="#94a3b8">{centerLabel}</text>
    </svg>
  );
}

export function LineChart({ data, format, height = 130 }: {
  data: { label: string; value: number }[]; format?: (v: number) => string; height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length === 0 || data.every((d) => d.value === 0)) return <ChartEmpty />;
  const w = 320, h = height, padX = 10, padY = 14;
  const max = Math.max(...data.map((d) => d.value), 1);
  const step = data.length > 1 ? (w - padX * 2) / (data.length - 1) : 0;
  const pts = data.map((d, i) => ({ x: padX + i * step, y: padY + (1 - d.value / max) * (h - padY * 2) }));
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const area = `${path} L${pts[pts.length - 1].x},${h - 4} L${pts[0].x},${h - 4} Z`;
  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="overflow-visible" role="img" aria-label="Gráfico de linha">
        <defs>
          <linearGradient id="ckLineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={padX} x2={w - padX} y1={padY + f * (h - padY * 2)} y2={padY + f * (h - padY * 2)} stroke="#f1f5f9" strokeWidth="1" />
        ))}
        <path d={area} fill="url(#ckLineGrad)" />
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

export function Bars({ data, color = '#7c3aed', format }: {
  data: { label: string; value: number }[]; color?: string; format?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length === 0 || data.every((d) => d.value === 0)) return <ChartEmpty />;
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
              <path d={`M${x},${y + bh} L${x},${y + 4} Q${x},${y} ${x + 4},${y} L${x + bw - 4},${y} Q${x + bw},${y} ${x + bw},${y + 4} L${x + bw},${y + bh} Z`}
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

export function HBars({ data, format }: {
  data: { label: string; value: number; color?: string }[]; format?: (v: number) => string;
}) {
  if (!data.length || data.every((d) => !d.value)) return <ChartEmpty />;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-2.5">
      {data.map((d, i) => (
        <div key={d.label} className="group" title={`${d.label}: ${format ? format(d.value) : d.value}`}>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-600 truncate pr-2">{d.label}</span>
            <span className="font-semibold text-slate-800 whitespace-nowrap">{format ? format(d.value) : d.value}</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500 group-hover:opacity-80"
              style={{ width: `${(d.value / max) * 100}%`, backgroundColor: d.color ?? CAT_COLORS[i % CAT_COLORS.length] }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Sparkline({ data, color, width = 64, height = 28 }: {
  data: number[]; color: string; width?: number; height?: number;
}) {
  if (data.length < 2 || data.every((v) => v === 0)) {
    return <svg width={width} height={height}><line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="#e2e8f0" strokeWidth="2" strokeDasharray="3 3" /></svg>;
  }
  const max = Math.max(...data, 1);
  const step = width / (data.length - 1);
  const pts = data.map((v, i) => `${i * step},${height - 3 - (v / max) * (height - 6)}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline points={pts} stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
