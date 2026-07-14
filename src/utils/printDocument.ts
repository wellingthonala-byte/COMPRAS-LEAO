import { PurchaseRequest } from '../types';
import { ServiceOrder, osCost, osElapsedHours } from '../types/serviceOrders';

/* ================================================================== */
/* Módulo reutilizável de impressão — documento corporativo A4         */
/* Usado por Solicitações/Pedidos de Compra e Ordens de Serviço.       */
/* ================================================================== */

interface PrintItem {
  code: string;
  description: string;
  detail?: string;
  quantity: number | string;
  unit: string;
  unitValue?: number;
  discount?: number;
  total?: number;
}

interface PrintSection {
  title: string;
  rows?: [string, string][];
  text?: string;
}

interface PrintDoc {
  docTitle: string;
  accent: string;
  number: string;
  issueDate: string;
  status: string;
  metaRight?: [string, string][];
  party?: { title: string; lines: string[] };
  responsible?: { title: string; lines: string[] };
  showValues: boolean;
  items: PrintItem[];
  totals?: [string, string][];
  sections?: PrintSection[];
  observations?: string;
  paymentTerms?: string;
  signatures: [string, string];
  generatedBy: string;
}

interface CompanyInfo {
  nome: string; razaoSocial: string; cnpj: string; ie: string;
  endereco: string; cidade: string; estado: string; cep: string;
  telefone: string; whatsapp: string; email: string; website: string;
}

/** Dados da empresa vêm de Configurações › Geral; defaults do documento de referência. */
function loadCompany(): CompanyInfo {
  const defaults: CompanyInfo = {
    nome: 'Compras Leão',
    razaoSocial: 'LEAO NORDESTE INDUSTRIA E COMERCIO DE PLASTICOS LTDA',
    cnpj: '10.918.657/0001-96', ie: '242183107',
    endereco: 'Rua João José Pereira Filho, 700 - LETRA C — Tabuleiro do Martins',
    cidade: 'Maceió', estado: 'AL', cep: '57081-000',
    telefone: '(82) 3378-9202', whatsapp: '', email: '',
    website: 'https://tubosleaonordeste.com.br/',
  };
  try {
    const raw = localStorage.getItem('compras-leao-settings');
    if (raw) {
      const c = JSON.parse(raw)?.company ?? {};
      return {
        nome: c.nome || defaults.nome,
        razaoSocial: c.razaoSocial || defaults.razaoSocial,
        cnpj: c.cnpj || defaults.cnpj,
        ie: c.ie || defaults.ie,
        endereco: c.endereco || defaults.endereco,
        cidade: c.cidade || defaults.cidade,
        estado: c.estado || defaults.estado,
        cep: c.cep || defaults.cep,
        telefone: c.telefone || defaults.telefone,
        whatsapp: c.whatsapp || '',
        email: c.email || '',
        website: c.website || defaults.website,
      };
    }
  } catch { /* usa defaults */ }
  return defaults;
}

const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function renderHTML(doc: PrintDoc): string {
  const co = loadCompany();
  const now = new Date();
  const generated = `Gerado em ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR')} por ${esc(doc.generatedBy)}`;

  const valueCols = doc.showValues;
  const itemRows = doc.items.map((it, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td class="c">${esc(it.code || '—')}</td>
      <td>
        <strong>${esc(it.description)}</strong>
        ${it.detail ? `<div class="detail">${esc(it.detail)}</div>` : ''}
      </td>
      <td class="c">${esc(String(it.quantity))} ${esc(it.unit)}</td>
      ${valueCols ? `
        <td class="r">${it.unitValue !== undefined ? brl(it.unitValue) : '—'}</td>
        <td class="r">${it.discount ? brl(it.discount) : '0,00'}</td>
        <td class="r"><strong>${it.total !== undefined ? brl(it.total) : '—'}</strong></td>` : ''}
    </tr>`).join('');

  const totalsHTML = valueCols && doc.totals?.length ? `
    <table class="totals">
      ${doc.totals.map(([k, v], i) => `
        <tr class="${i === doc.totals!.length - 1 ? 'grand' : ''}">
          <td>${esc(k)}</td><td class="r">${esc(v)}</td>
        </tr>`).join('')}
    </table>` : '';

  const sectionsHTML = (doc.sections ?? []).map((s) => `
    <div class="section avoid-break">
      <h3>${esc(s.title)}</h3>
      ${s.rows ? `<table class="kv">${s.rows.map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>` : ''}
      ${s.text ? `<p class="text">${esc(s.text)}</p>` : ''}
    </div>`).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${esc(doc.docTitle)} ${esc(doc.number)}</title>
<style>
  :root { --accent: ${doc.accent}; --ink: #1e293b; --muted: #64748b; --line: #cbd5e1; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: #f1f5f9; }
  body { font-family: 'Segoe UI', Arial, Helvetica, sans-serif; color: var(--ink); font-size: 11px; line-height: 1.45; }
  .sheet { background: white; max-width: 210mm; margin: 16px auto; padding: 14mm 12mm 22mm; box-shadow: 0 2px 12px rgba(0,0,0,.12); position: relative; }

  /* Cabeçalho da empresa */
  .header { display: flex; gap: 12px; align-items: flex-start; border-bottom: 3px solid var(--accent); padding-bottom: 10px; }
  .logo { width: 52px; height: 52px; border-radius: 12px; background: var(--accent); color: white; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 800; flex-shrink: 0; }
  .co h1 { font-size: 13px; letter-spacing: .2px; }
  .co p { color: var(--muted); font-size: 10px; }
  .docid { margin-left: auto; text-align: right; }
  .docid .t { font-size: 15px; font-weight: 800; color: var(--accent); text-transform: uppercase; letter-spacing: .4px; }
  .docid .n { font-size: 13px; font-weight: 700; }
  .docid .badge { display: inline-block; margin-top: 4px; border: 1px solid var(--accent); color: var(--accent); border-radius: 20px; padding: 1px 10px; font-size: 9.5px; font-weight: 700; text-transform: uppercase; }
  .docid p { color: var(--muted); font-size: 10px; margin-top: 2px; }

  /* Blocos de partes */
  .parties { display: flex; gap: 10px; margin-top: 10px; }
  .box { flex: 1; border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; }
  .box h3, .section h3 { font-size: 9.5px; text-transform: uppercase; letter-spacing: .8px; color: var(--accent); margin-bottom: 4px; }
  .box p { font-size: 10.5px; }
  .box p:first-of-type { font-weight: 700; font-size: 11px; }

  /* Tabela de itens */
  table.items { width: 100%; border-collapse: collapse; margin-top: 12px; }
  table.items thead th { background: var(--accent); color: white; font-size: 9.5px; text-transform: uppercase; letter-spacing: .4px; padding: 6px 7px; text-align: left; }
  table.items thead th.c, table.items td.c { text-align: center; }
  table.items thead th.r, table.items td.r { text-align: right; }
  table.items td { border-bottom: 1px solid #e2e8f0; padding: 6px 7px; vertical-align: top; }
  table.items tbody tr:nth-child(even) { background: #f8fafc; }
  table.items tbody tr { page-break-inside: avoid; }
  table.items thead { display: table-header-group; }
  .detail { color: var(--muted); font-size: 9.5px; margin-top: 1px; }

  /* Totais */
  table.totals { border-collapse: collapse; margin: 10px 0 0 auto; width: 62mm; page-break-inside: avoid; }
  table.totals td { padding: 4px 8px; font-size: 10.5px; border-bottom: 1px solid #e2e8f0; }
  table.totals td.r { text-align: right; font-weight: 600; }
  table.totals tr.grand td { background: var(--accent); color: white; font-weight: 800; font-size: 11.5px; border: none; }

  /* Seções complementares */
  .section { margin-top: 12px; border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; }
  table.kv { border-collapse: collapse; width: 100%; }
  table.kv td { padding: 2px 0; font-size: 10.5px; }
  table.kv td.k { color: var(--muted); width: 42mm; }
  .text { font-size: 10.5px; white-space: pre-wrap; }
  .avoid-break { page-break-inside: avoid; }

  /* Assinaturas */
  .signatures { display: flex; gap: 24px; margin-top: 34px; page-break-inside: avoid; }
  .sig { flex: 1; text-align: center; }
  .sig .line { border-top: 1px solid var(--ink); margin-bottom: 4px; }
  .sig p { font-size: 10px; color: var(--muted); }
  .sig .who { font-weight: 700; color: var(--ink); font-size: 10.5px; }

  /* Rodapé */
  .foot { position: fixed; bottom: 6mm; left: 12mm; right: 12mm; display: none; justify-content: space-between; font-size: 9px; color: var(--muted); border-top: 1px solid var(--line); padding-top: 3px; }
  .foot-screen { margin-top: 20px; display: flex; justify-content: space-between; font-size: 9px; color: var(--muted); border-top: 1px solid var(--line); padding-top: 4px; }

  /* Barra de ações (só na tela) */
  .actions { max-width: 210mm; margin: 12px auto 0; display: flex; gap: 8px; justify-content: flex-end; }
  .actions button { font-family: inherit; font-size: 13px; font-weight: 600; padding: 8px 18px; border-radius: 8px; border: 1px solid var(--line); background: white; cursor: pointer; }
  .actions button.primary { background: var(--accent); color: white; border-color: var(--accent); }

  @media print {
    html, body { background: white; }
    .sheet { box-shadow: none; margin: 0; max-width: none; padding: 0 0 16mm; }
    .actions, .foot-screen { display: none; }
    .foot { display: flex; }
    @page { size: A4; margin: 12mm 12mm 18mm; }
  }
</style>
</head>
<body>
  <div class="actions">
    <button onclick="window.close()">Fechar</button>
    <button class="primary" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
  </div>

  <div class="sheet">
    <div class="header">
      <div class="logo">${esc(co.nome.trim().charAt(0).toUpperCase() || 'C')}</div>
      <div class="co">
        <h1>${esc(co.razaoSocial || co.nome)}</h1>
        ${co.website ? `<p>${esc(co.website)}</p>` : ''}
        <p>CNPJ: ${esc(co.cnpj)}${co.ie ? ` &nbsp;·&nbsp; Inscrição Estadual: ${esc(co.ie)}` : ''}</p>
        <p>${esc(co.endereco)}</p>
        <p>${esc(co.cidade)} - ${esc(co.estado)}${co.cep ? ` — CEP: ${esc(co.cep)}` : ''}</p>
        <p>${[co.telefone && `Telefone: ${co.telefone}`, co.whatsapp && `WhatsApp: ${co.whatsapp}`, co.email && `E-mail: ${co.email}`].filter(Boolean).map((x) => esc(x as string)).join(' &nbsp;·&nbsp; ')}</p>
      </div>
      <div class="docid">
        <div class="t">${esc(doc.docTitle)}</div>
        <div class="n">Nº ${esc(doc.number)}</div>
        <span class="badge">${esc(doc.status)}</span>
        <p>Emissão: ${esc(doc.issueDate)}</p>
        ${(doc.metaRight ?? []).map(([k, v]) => `<p>${esc(k)}: <strong>${esc(v)}</strong></p>`).join('')}
      </div>
    </div>

    <div class="parties">
      ${doc.party ? `
        <div class="box">
          <h3>${esc(doc.party.title)}</h3>
          ${doc.party.lines.map((l) => `<p>${esc(l)}</p>`).join('')}
        </div>` : ''}
      ${doc.responsible ? `
        <div class="box">
          <h3>${esc(doc.responsible.title)}</h3>
          ${doc.responsible.lines.map((l) => `<p>${esc(l)}</p>`).join('')}
        </div>` : ''}
    </div>

    <table class="items">
      <thead>
        <tr>
          <th class="c" style="width:8mm">Item</th>
          <th class="c" style="width:20mm">Código</th>
          <th>Descrição</th>
          <th class="c" style="width:20mm">Qtd</th>
          ${valueCols ? `
            <th class="r" style="width:24mm">V. Unit. (R$)</th>
            <th class="r" style="width:20mm">Desc. (R$)</th>
            <th class="r" style="width:26mm">Total (R$)</th>` : ''}
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    ${totalsHTML}
    ${sectionsHTML}

    ${doc.observations ? `
      <div class="section avoid-break">
        <h3>Observações</h3>
        <p class="text">${esc(doc.observations)}</p>
      </div>` : ''}

    ${doc.paymentTerms ? `
      <div class="section avoid-break">
        <h3>Condições de Pagamento</h3>
        <p class="text">${esc(doc.paymentTerms)}</p>
      </div>` : ''}

    <div class="signatures">
      <div class="sig"><div class="line"></div><p class="who">${esc(doc.signatures[0])}</p><p>Assinatura</p></div>
      <div class="sig"><div class="line"></div><p class="who">${esc(doc.signatures[1])}</p><p>Assinatura</p></div>
    </div>

    <div class="foot-screen"><span>${generated}</span><span>${esc(co.nome)}</span></div>
  </div>

  <div class="foot"><span>${generated}</span><span>${esc(co.nome)} — ${esc(doc.docTitle)} Nº ${esc(doc.number)}</span></div>
</body>
</html>`;
}

function openPrintWindow(doc: PrintDoc): void {
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return;
  w.document.write(renderHTML(doc));
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch { /* usuário imprime pelo botão */ } }, 400);
}

/* ------------------------------------------------------------------ */
/* Solicitação / Pedido de Compra                                      */
/* ------------------------------------------------------------------ */
export function printPurchaseRequest(r: PurchaseRequest, generatedBy: string): void {
  const hasValue = r.value !== undefined && r.value > 0;
  const totalQty = Math.max(r.items.reduce((s, i) => s + i.quantity, 0), 1);
  openPrintWindow({
    docTitle: r.supplier ? 'Pedido de Compra' : 'Solicitação de Compra',
    accent: '#7c3aed',
    number: r.number,
    issueDate: new Date(r.createdAt).toLocaleDateString('pt-BR'),
    status: r.status,
    metaRight: [
      ['Prioridade', r.priority],
      ['Previsão de entrega', new Date(r.deliveryForecast + 'T12:00:00').toLocaleDateString('pt-BR')],
    ],
    party: r.supplier ? {
      title: 'Informações do Fornecedor',
      lines: [
        r.supplier,
        ...(r.orderNumber ? [`Nº do Pedido: ${r.orderNumber}`] : []),
        ...(r.fiscalNote ? [`Nota Fiscal: ${r.fiscalNote}`] : []),
      ],
    } : undefined,
    responsible: {
      title: 'Dados do Solicitante',
      lines: [
        r.requester,
        `Setor: ${r.sector}`,
        ...(r.approvedBy ? [`Aprovado por: ${r.approvedBy} (ID ${r.approvalId ?? '—'})`] : []),
      ],
    },
    showValues: hasValue,
    items: r.items.map((it) => ({
      code: '—',
      description: it.description,
      detail: [it.technicalSpec, it.observations].filter(Boolean).join(' · ') || undefined,
      quantity: it.quantity,
      unit: 'UND',
      unitValue: hasValue ? (r.value! / totalQty) : undefined,
      discount: 0,
      total: hasValue ? (r.value! / totalQty) * it.quantity : undefined,
    })),
    totals: hasValue ? [
      ['Subtotal (R$)', brl(r.value!)],
      ['Descontos (R$)', '0,00'],
      ['Impostos (R$)', '0,00'],
      ['Total Geral (R$)', brl(r.value!)],
    ] : undefined,
    sections: [
      {
        title: 'Outras Informações',
        rows: [
          ...(r.objectLink ? [['Link do objeto', r.objectLink] as [string, string]] : []),
          ['Categoria', r.items[0]?.application || '—'],
          ['Incluído em', new Date(r.createdAt).toLocaleString('pt-BR')],
          ['Previsão de entrega', new Date(r.deliveryForecast + 'T12:00:00').toLocaleDateString('pt-BR')],
          ...(r.realDeliveryDate ? [['Entrega realizada', new Date(r.realDeliveryDate + 'T12:00:00').toLocaleDateString('pt-BR')] as [string, string]] : []),
        ],
      },
    ],
    observations: r.observations,
    signatures: [r.approvedBy ?? 'Responsável / Gestor', r.supplier ?? r.requester],
    generatedBy,
  });
}

/* ------------------------------------------------------------------ */
/* Ordem de Serviço                                                    */
/* ------------------------------------------------------------------ */
export function printServiceOrder(os: ServiceOrder, generatedBy: string): void {
  const materials = os.materials.map((m) => ({
    code: m.code || '—',
    description: m.product,
    quantity: m.quantity,
    unit: m.unit.toUpperCase(),
    unitValue: m.unitValue,
    discount: 0,
    total: m.quantity * m.unitValue,
  }));
  const labor = os.labor.map((l) => ({
    code: 'M.O.',
    description: `Mão de obra — ${l.technician}`,
    detail: l.extraHours > 0 ? `${l.hours}h normais + ${l.extraHours}h extras (1,5×)` : undefined,
    quantity: l.hours + l.extraHours,
    unit: 'H',
    unitValue: l.hourRate,
    discount: 0,
    total: l.hours * l.hourRate + l.extraHours * l.hourRate * 1.5,
  }));
  const items = [...materials, ...labor];
  const total = osCost(os);
  const matTotal = materials.reduce((s, m) => s + m.total, 0);
  const elapsed = osElapsedHours(os);

  openPrintWindow({
    docTitle: 'Ordem de Serviço',
    accent: '#7c3aed',
    number: os.number,
    issueDate: new Date(os.openedAt).toLocaleDateString('pt-BR'),
    status: os.status,
    metaRight: [
      ['Prioridade', os.priority],
      ['Prazo', new Date(os.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')],
      ['SLA', `${os.slaHours}h`],
    ],
    party: {
      title: os.customer ? 'Dados do Cliente' : 'Dados do Equipamento',
      lines: os.customer ? [
        os.customer,
        `Equipamento: ${os.equipment.name}`,
        ...(os.equipment.location ? [`Local: ${os.equipment.location}`] : []),
      ] : [
        os.equipment.name,
        ...(os.equipment.model ? [`Modelo: ${os.equipment.model}`] : []),
        ...(os.equipment.manufacturer ? [`Fabricante: ${os.equipment.manufacturer}`] : []),
        ...(os.equipment.serial ? [`Nº de série: ${os.equipment.serial}`] : []),
        ...(os.equipment.patrimony ? [`Patrimônio: ${os.equipment.patrimony}`] : []),
        ...(os.equipment.location ? [`Localização: ${os.equipment.location}`] : []),
      ],
    },
    responsible: {
      title: 'Dados do Responsável',
      lines: [
        os.technician || 'Técnico não atribuído',
        `Solicitante: ${os.requester}`,
        `Setor: ${os.costCenter}`,
        `Tipo: ${os.type} · Categoria: ${os.category}`,
      ],
    },
    showValues: items.length > 0,
    items: items.length > 0 ? items : [{
      code: '—', description: os.title, detail: os.description || undefined, quantity: 1, unit: 'SV',
    }],
    totals: items.length > 0 ? [
      ['Materiais (R$)', brl(matTotal)],
      ['Mão de obra (R$)', brl(total - matTotal)],
      ['Descontos (R$)', '0,00'],
      ['Total Geral (R$)', brl(total)],
    ] : undefined,
    sections: [
      {
        title: 'Detalhes do Serviço',
        rows: [
          ['Título', os.title],
          ...(os.objectLink ? [['Link do objeto', os.objectLink] as [string, string]] : []),
          ...(os.description ? [['Descrição', os.description] as [string, string]] : []),
          ['Abertura', new Date(os.openedAt).toLocaleString('pt-BR')],
          ...(os.startedAt ? [['Início da execução', new Date(os.startedAt).toLocaleString('pt-BR')] as [string, string]] : []),
          ...(os.completedAt ? [['Conclusão', new Date(os.completedAt).toLocaleString('pt-BR')] as [string, string]] : []),
          ...(elapsed !== null ? [['Tempo de atendimento', `${elapsed.toFixed(1).replace('.', ',')}h`] as [string, string]] : []),
          ...(os.estimatedValue ? [['Valor estimado', `R$ ${brl(os.estimatedValue)}`] as [string, string]] : []),
        ],
      },
      ...(os.checklist.length > 0 ? [{
        title: 'Checklist',
        text: os.checklist.map((c) => `${c.done ? '[x]' : '[ ]'} ${c.text}`).join('\n'),
      }] : []),
      ...(os.cancelReason ? [{
        title: 'Cancelamento',
        text: `Cancelada por ${os.cancelledBy ?? '—'} — Motivo: ${os.cancelReason}`,
      }] : []),
    ],
    observations: os.observations,
    signatures: [os.technician || 'Técnico Responsável', os.customer ?? os.requester],
    generatedBy,
  });
}
