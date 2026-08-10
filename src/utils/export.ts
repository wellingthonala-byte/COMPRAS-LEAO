/* ====================================================================
   Exportação CSV / Excel sem dependência externa.

   Mesma implementação que já existia duplicada em DashboardPage e
   ReportsPage, extraída para não virar uma terceira cópia com a chegada do
   painel financeiro. Comportamento idêntico ao que essas telas já faziam:
   CSV separado por ponto e vírgula com BOM (para o Excel pt-BR abrir sem
   bagunçar acentos) e "Excel" como tabela HTML salva em .xls.
   ==================================================================== */

export function downloadBlob(content: string, filename: string, mime: string): void {
  const blob = new Blob(['﻿' + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportCSV(headers: string[], rows: (string | number)[][], name: string): void {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [headers.map(esc).join(';'), ...rows.map((r) => r.map(esc).join(';'))].join('\n');
  downloadBlob(csv, `${name}.csv`, 'text/csv;charset=utf-8');
}

export function exportExcel(headers: string[], rows: (string | number)[][], name: string): void {
  const esc = (v: string | number) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body><table border="1"><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table></body></html>`;
  downloadBlob(html, `${name}.xls`, 'application/vnd.ms-excel');
}

/** Nome de arquivo com a data, no padrão já usado pelas outras telas. */
export function exportName(prefix: string): string {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}`;
}
