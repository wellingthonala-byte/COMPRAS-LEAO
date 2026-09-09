/** Exportação de tabelas para CSV/Excel — compartilhado entre Kanban de
 *  Compras e Ordens de Serviço para manter o mesmo botão/comportamento. */
function download(content: string, filename: string, mime: string) {
  const blob = new Blob(['﻿' + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function toCSV(headers: string[], rows: (string | number)[][], name: string) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  download([headers.map(esc).join(';'), ...rows.map((r) => r.map(esc).join(';'))].join('\n'), `${name}.csv`, 'text/csv;charset=utf-8');
}

export function toXLS(headers: string[], rows: (string | number)[][], name: string) {
  const esc = (v: string | number) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  download(`<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body><table border="1"><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table></body></html>`, `${name}.xls`, 'application/vnd.ms-excel');
}
