import { useState } from 'react';
import { PaymentTerms } from '../../types/finance';
import {
  PAYMENT_TERMS_PRESETS, findPresetId, formatPaymentTerms, normalizeDays, parseCustomDays,
} from '../../lib/paymentTerms';

const CUSTOM = '__custom__';

/**
 * Seletor de condição de pagamento para a cotação.
 *
 * A condição é estruturada (lista de dias), nunca texto livre — o cálculo das
 * parcelas depende dela. "Personalizado" aceita dias digitados à mão para
 * casos fora dos presets, e ainda assim grava a lista normalizada.
 */
export function PaymentTermsField({ value, onChange }: {
  value: PaymentTerms | undefined;
  onChange: (terms: PaymentTerms | undefined) => void;
}) {
  const presetId = findPresetId(value);
  const isCustom = !!value && presetId === null;
  const [mode, setMode] = useState<string>(isCustom ? CUSTOM : (presetId ?? ''));
  const [customText, setCustomText] = useState(isCustom ? normalizeDays(value.days).join('/') : '');

  const handleSelect = (id: string) => {
    setMode(id);
    if (id === '') { onChange(undefined); return; }
    if (id === CUSTOM) { onChange(parseCustomDays(customText) ?? undefined); return; }
    const preset = PAYMENT_TERMS_PRESETS.find((p) => p.id === id);
    onChange(preset ? { ...preset.terms, days: [...preset.terms.days] } : undefined);
  };

  const handleCustomText = (text: string) => {
    setCustomText(text);
    onChange(parseCustomDays(text) ?? undefined);
  };

  const parsedCustom = mode === CUSTOM ? parseCustomDays(customText) : null;

  return (
    <div>
      <label className="text-xs text-slate-400 block mb-1">
        Condição de Pagamento <span className="text-violet-600">*</span>
      </label>
      <select
        value={mode}
        onChange={(e) => handleSelect(e.target.value)}
        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
      >
        <option value="">Não definida</option>
        {PAYMENT_TERMS_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        <option value={CUSTOM}>Personalizado…</option>
      </select>

      {mode === CUSTOM && (
        <div className="mt-1.5">
          <input
            value={customText}
            onChange={(e) => handleCustomText(e.target.value)}
            placeholder="Dias separados por barra, ex.: 30/45/75"
            className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          {parsedCustom
            ? <p className="text-[11px] text-emerald-600 mt-1">{parsedCustom.days.length} parcela(s): {formatPaymentTerms(parsedCustom)}</p>
            : <p className="text-[11px] text-amber-600 mt-1">Informe ao menos um número de dias.</p>}
        </div>
      )}

      <p className="text-[11px] text-slate-400 mt-1">
        Necessária para o gestor aprovar o valor e para projetar as parcelas.
      </p>
    </div>
  );
}
