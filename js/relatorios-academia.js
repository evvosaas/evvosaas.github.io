/* ============================================================
   EVVO — MÓDULO RELATÓRIOS (painel da academia)
   Começa pelo Financeiro. Reaproveita a mesma régua de "valor
   efetivamente recebido" já usada no Financeiro e nas Despesas.
   Os demais relatórios (Repasses, Participação, Inadimplentes,
   Extrato) chegam nas próximas entregas.
   ============================================================ */
let relAtual = 'financeiro';

function selecionarRelatorio(tipo, el) {
  relAtual = tipo;
  document.querySelectorAll('#v-ac-relatorios .fchip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  if (tipo === 'financeiro') gerarRelatorioFinanceiro();
}

function relPeriodoPadrao() {
  const h = new Date();
  const ini = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-01`;
  const fim = new Date(h.getFullYear(), h.getMonth() + 1, 0).toISOString().slice(0, 10);
  const elIni = document.getElementById('rel-ini');
  const elFim = document.getElementById('rel-fim');
  if (!elIni.value) elIni.value = ini;
  if (!elFim.value) elFim.value = fim;
}

async function carregarRelatoriosAc() {
  relPeriodoPadrao();
  await gerarRelatorioFinanceiro();
}

/* ---------------- RELATÓRIO FINANCEIRO ---------------- */
async function gerarRelatorioFinanceiro() {
  relPeriodoPadrao();
  const pIni = document.getElementById('rel-ini').value;
  const pFim = document.getElementById('rel-fim').value;
  const alvo = document.getElementById('rel-conteudo');
  alvo.innerHTML = '<div class="carregando">Gerando relatório…</div>';

  const [{ data: nomeAcademia }, { data: faturas, error }, { data: despesas }] = await Promise.all([
    db.from('academias').select('nome').eq('id', MEU_ACADEMIA_ID).single(),
    db.from('vw_financeiro').select('*').gte('vencimento', pIni).lte('vencimento', pFim).order('vencimento'),
    db.from('despesas').select('*').gte('vencimento', pIni).lte('vencimento', pFim),
  ]);

  if (error) { alvo.innerHTML = `<div class="vazio">Erro: ${esc(error.message)}</div>`; return; }

  const lista = faturas || [];

  // valor efetivamente recebido nas faturas pagas do período
  const idsPagos = lista.filter(m => m.status === 'pago').map(m => m.id);
  let recebidoPorId = {};
  if (idsPagos.length) {
    const { data: pagos } = await db.from('pagamentos').select('mensalidade_id, valor').in('mensalidade_id', idsPagos);
    (pagos || []).forEach(p => { recebidoPorId[p.mensalidade_id] = (recebidoPorId[p.mensalidade_id] || 0) + Number(p.valor); });
  }

  const somaReal = st => lista.filter(m => m.status === st).reduce((s, m) => {
    if (st === 'pago') return s + Number(recebidoPorId[m.id] ?? m.valor_total);
    return s + Number(m.valor_total);
  }, 0);

  const recebido = somaReal('pago');
  const aReceber = somaReal('pendente');
  const emAtraso = somaReal('atrasado');
  const cancelado = somaReal('cancelado');
  const totalDespesas = (despesas || []).reduce((s, d) => s + Number(d.valor), 0);
  const resultado = recebido - totalDespesas;

  const linhasFaturas = lista.filter(m => m.status !== 'cancelado').map(m => {
    const valorMostrar = m.status === 'pago' ? (recebidoPorId[m.id] ?? m.valor_total) : m.valor_total;
    return `<tr>
      <td>${esc(m.aluno)}</td>
      <td>${fmt(m.vencimento)}</td>
      <td>${brl(valorMostrar)}</td>
      <td style="text-transform:capitalize">${esc(m.status)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--muted)">Nenhuma fatura no período.</td></tr>';

  const linhasDespesas = (despesas || []).map(d => `
    <tr><td>${esc(d.descricao)}</td><td>${esc(d.categoria)}</td><td>${fmt(d.vencimento)}</td><td>${brl(d.valor)}</td></tr>
  `).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--muted)">Nenhuma despesa no período.</td></tr>';

  alvo.innerHTML = `
    <div class="rel-header">
      <div class="marca"><div class="m">V</div><b>EVVO</b></div>
      <h2>${esc(nomeAcademia?.nome || 'Academia')} — Relatório Financeiro</h2>
      <div class="periodo">Período: ${fmt(pIni)} a ${fmt(pFim)}</div>
      <div class="gerado">Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR').slice(0,5)}</div>
    </div>

    <div class="rel-kpis">
      <div class="rel-kpi"><div class="l">Recebido</div><div class="v" style="color:var(--ok)">${brl(recebido)}</div></div>
      <div class="rel-kpi"><div class="l">A receber</div><div class="v" style="color:var(--warn)">${brl(aReceber)}</div></div>
      <div class="rel-kpi"><div class="l">Em atraso</div><div class="v" style="color:var(--late)">${brl(emAtraso)}</div></div>
      <div class="rel-kpi"><div class="l">Cancelado</div><div class="v">${brl(cancelado)}</div></div>
    </div>

    <div class="rel-section-title">Faturas do período</div>
    <table class="rel-table">
      <thead><tr><th>Aluno</th><th>Vencimento</th><th>Valor</th><th>Status</th></tr></thead>
      <tbody>${linhasFaturas}</tbody>
    </table>

    <div class="rel-section-title">Despesas do período</div>
    <table class="rel-table">
      <thead><tr><th>Descrição</th><th>Categoria</th><th>Vencimento</th><th>Valor</th></tr></thead>
      <tbody>${linhasDespesas}</tbody>
      <tfoot><tr class="rel-total-row"><td colspan="3">Total de despesas</td><td>${brl(totalDespesas)}</td></tr></tfoot>
    </table>

    <div class="rel-resultado">
      <span>Resultado do período (recebido − despesas)</span>
      <span class="num" style="color:${resultado >= 0 ? 'var(--ok)' : 'var(--late)'}">${brl(resultado)}</span>
    </div>
    <div class="rel-nota">Relatório informativo. "Recebido" reflete o valor efetivamente pago, não o valor de face das faturas.</div>
  `;
}

/* ---------------- IMPRIMIR / PDF ---------------- */
function imprimirRelatorio() {
  const conteudo = document.getElementById('rel-conteudo').innerHTML;
  document.getElementById('print-area').innerHTML = conteudo;
  window.print();
}

function baixarRelatorioPdf() {
  const el = document.getElementById('rel-conteudo');
  const nomeArquivo = `relatorio-${relAtual}-${document.getElementById('rel-ini').value}-a-${document.getElementById('rel-fim').value}.pdf`;
  toast('Gerando PDF…');
  html2pdf().set({
    margin: 12,
    filename: nomeArquivo,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
  }).from(el).save();
}
