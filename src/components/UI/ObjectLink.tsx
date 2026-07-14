import { useState } from 'react';
import { ExternalLink, Link2, Pencil, Check, X } from 'lucide-react';

/** Completa https:// quando faltar e valida a URL. Retorna null se inválida. */
export function normalizeUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes('.')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Campo de formulário para o Link do Objeto, com validação e autocompletar de https:// */
export function ObjectLinkInput({ value, onChange, label = 'Link do Objeto' }: {
  value: string; onChange: (v: string) => void; label?: string;
}) {
  const invalid = value.trim() !== '' && normalizeUrl(value) === null;
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <div className="relative">
        <Link2 size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text" value={value} inputMode="url"
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => { const n = normalizeUrl(value); if (n && n !== value) onChange(n); }}
          placeholder="https://exemplo.com/produto (opcional)"
          className={`w-full border rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 bg-white ${
            invalid ? 'border-red-300 focus:ring-red-400' : 'border-slate-200 focus:ring-violet-500'
          }`}
        />
      </div>
      {invalid && <p className="text-[11px] text-red-600 mt-1">URL inválida — ex.: https://loja.com/produto</p>}
    </div>
  );
}

/** Exibição do link: clicável em nova aba, com edição inline opcional */
export function ObjectLinkView({ url, onSave }: { url?: string; onSave?: (url: string | undefined) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(url ?? '');

  if (editing && onSave) {
    const normalized = normalizeUrl(draft);
    const invalid = draft.trim() !== '' && normalized === null;
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <input
          value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus inputMode="url"
          onKeyDown={(e) => { if (e.key === 'Enter' && !invalid) { onSave(normalized ?? undefined); setEditing(false); } }}
          placeholder="https://..."
          className={`flex-1 min-w-[140px] border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 ${invalid ? 'border-red-300 focus:ring-red-400' : 'border-slate-200 focus:ring-violet-500'}`}
        />
        <button onClick={() => { if (!invalid) { onSave(normalized ?? undefined); setEditing(false); } }}
          disabled={invalid} aria-label="Salvar link"
          className="p-1 text-emerald-600 hover:bg-emerald-50 rounded disabled:opacity-30"><Check size={13} /></button>
        <button onClick={() => { setDraft(url ?? ''); setEditing(false); }} aria-label="Cancelar edição do link"
          className="p-1 text-slate-400 hover:bg-slate-100 rounded"><X size={13} /></button>
        {invalid && <span className="w-full text-[10px] text-red-600">URL inválida</span>}
      </div>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-violet-600 hover:text-violet-800 hover:underline font-medium truncate max-w-[220px]"
          title={url}>
          <ExternalLink size={11} className="flex-shrink-0" />
          <span className="truncate">{url.replace(/^https?:\/\//, '')}</span>
        </a>
      ) : (
        <span className="text-slate-400">Nenhum link cadastrado</span>
      )}
      {onSave && (
        <button onClick={() => { setDraft(url ?? ''); setEditing(true); }} aria-label="Editar link do objeto"
          className="p-0.5 text-slate-300 hover:text-violet-600 rounded flex-shrink-0"><Pencil size={11} /></button>
      )}
    </span>
  );
}
