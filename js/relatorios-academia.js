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
  gerarRelatorioAtual();
}

function gerarRelatorioAtual() {
  if (relAtual === 'financeiro') gerarRelatorioFinanceiro();
  if (relAtual === 'repasses') gerarRelatorioRepasses();
  if (relAtual === 'participacao') gerarRelatorioParticipacao();
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
  await gerarRelatorioAtual();
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

/* ---------------- RELATÓRIO DE REPASSES AOS PERSONAIS ---------------- */
async function gerarRelatorioRepasses() {
  relPeriodoPadrao();
  const pIni = document.getElementById('rel-ini').value;
  const pFim = document.getElementById('rel-fim').value;
  const alvo = document.getElementById('rel-conteudo');
  alvo.innerHTML = '<div class="carregando">Gerando relatório…</div>';

  const [{ data: nomeAcademia }, { data: devidos, error }, { data: repassesPagos }] = await Promise.all([
    db.from('academias').select('nome').eq('id', MEU_ACADEMIA_ID).single(),
    db.rpc('fn_repasses_devidos', { p_academia_id: MEU_ACADEMIA_ID, p_ini: pIni, p_fim: pFim }),
    db.from('repasses').select('*, personais(nome)').eq('status', 'pago')
      .gte('periodo_ini', pIni).lte('periodo_fim', pFim).order('pago_em'),
  ]);

  if (error) { alvo.innerHTML = `<div class="vazio">Erro: ${esc(error.message)}</div>`; return; }

  const listaDevidos = devidos || [];
  const jaPagoPorPersonal = {};
  (repassesPagos || []).forEach(r => {
    jaPagoPorPersonal[r.personal_id] = (jaPagoPorPersonal[r.personal_id] || 0) + Number(r.valor);
  });

  let totalDevido = 0, totalPago = 0;
  const linhasPersonais = listaDevidos.map(p => {
    const pago = jaPagoPorPersonal[p.personal_id] || 0;
    const saldo = Math.max(Number(p.valor_total) - pago, 0);
    totalDevido += Number(p.valor_total);
    totalPago += pago;
    return `<tr>
      <td>${esc(p.personal)}</td>
      <td>${p.qtd_alunos}</td>
      <td>${brl(p.valor_total)}</td>
      <td>${brl(pago)}</td>
      <td style="font-weight:700;color:${saldo > 0 ? 'var(--warn)' : 'var(--ok)'}">${brl(saldo)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--muted)">Nenhum repasse devido no período.</td></tr>';

  const linhasHistorico = (repassesPagos || []).map(r => `
    <tr><td>${esc(r.personais?.nome || '—')}</td><td>${brl(r.valor)}</td><td>${fmt(String(r.pago_em).slice(0,10))}</td><td>${esc(r.observacao || '—')}</td></tr>
  `).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--muted)">Nenhum repasse registrado como pago no período.</td></tr>';

  const saldoTotal = Math.max(totalDevido - totalPago, 0);

  alvo.innerHTML = `
    <div class="rel-header">
      <div class="marca"><div class="m">V</div><b>EVVO</b></div>
      <h2>${esc(nomeAcademia?.nome || 'Academia')} — Relatório de Repasses</h2>
      <div class="periodo">Período: ${fmt(pIni)} a ${fmt(pFim)}</div>
      <div class="gerado">Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR').slice(0,5)}</div>
    </div>

    <div class="rel-kpis" style="grid-template-columns:repeat(3,1fr)">
      <div class="rel-kpi"><div class="l">Devido no período</div><div class="v">${brl(totalDevido)}</div></div>
      <div class="rel-kpi"><div class="l">Já repassado</div><div class="v" style="color:var(--ok)">${brl(totalPago)}</div></div>
      <div class="rel-kpi"><div class="l">Saldo pendente</div><div class="v" style="color:var(--warn)">${brl(saldoTotal)}</div></div>
    </div>

    <div class="rel-section-title">Repasses por personal</div>
    <table class="rel-table">
      <thead><tr><th>Personal</th><th>Alunos</th><th>Devido</th><th>Repassado</th><th>Saldo</th></tr></thead>
      <tbody>${linhasPersonais}</tbody>
    </table>

    <div class="rel-section-title">Histórico de repasses pagos no período</div>
    <table class="rel-table">
      <thead><tr><th>Personal</th><th>Valor</th><th>Pago em</th><th>Observação</th></tr></thead>
      <tbody>${linhasHistorico}</tbody>
    </table>

    <div class="rel-nota">Devido = valor liberado sobre faturas já pagas dos alunos no período. Repasse ainda não pago fica como saldo.</div>
  `;
}

/* ---------------- RELATÓRIO DE PARTICIPAÇÃO DOS SÓCIOS ---------------- */
async function gerarRelatorioParticipacao() {
  relPeriodoPadrao();
  const pIni = document.getElementById('rel-ini').value;
  const pFim = document.getElementById('rel-fim').value;
  const alvo = document.getElementById('rel-conteudo');
  alvo.innerHTML = '<div class="carregando">Gerando relatório…</div>';

  const [{ data: nomeAcademia }, { data: fechamento }, { data: partLive, error }] = await Promise.all([
    db.from('academias').select('nome').eq('id', MEU_ACADEMIA_ID).single(),
    db.from('fechamentos').select('*').eq('periodo_ini', pIni).eq('periodo_fim', pFim).maybeSingle(),
    db.rpc('fn_participacao', { p_academia_id: MEU_ACADEMIA_ID, p_ini: pIni, p_fim: pFim }),
  ]);

  if (error) { alvo.innerHTML = `<div class="vazio">Erro: ${esc(error.message)}</div>`; return; }

  // Se o período já foi fechado oficialmente, usa o snapshot imutável.
  // Senão, mostra o cálculo ao vivo (pode mudar até ser fechado).
  const p = fechamento || (partLive && partLive[0]);
  if (!p) { alvo.innerHTML = '<div class="vazio">Sem dados para este período.</div>'; return; }

  const statusBadge = fechamento
    ? `<span class="badge b-ok" style="margin-top:8px">🔒 Período fechado em ${fmt(String(fechamento.created_at).slice(0,10))}</span>`
    : `<span class="badge b-warn" style="margin-top:8px">Período em aberto — valores ainda podem mudar</span>`;

  const distribuicao = p.distribuicao || [];
  const linhasSocios = distribuicao.map(d => `
    <tr><td>${esc(d.socio)}</td><td>${Number(d.percentual)}%</td><td style="font-weight:700">${brl(d.valor)}</td></tr>
  `).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--muted)">Nenhum sócio cadastrado.</td></tr>';

  alvo.innerHTML = `
    <div class="rel-header">
      <div class="marca"><div class="m">V</div><b>EVVO</b></div>
      <h2>${esc(nomeAcademia?.nome || 'Academia')} — Participação dos Sócios</h2>
      <div class="periodo">Período: ${fmt(pIni)} a ${fmt(pFim)}</div>
      <div class="gerado">Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR').slice(0,5)}</div>
      <div>${statusBadge}</div>
    </div>

    <div class="rel-section-title">Base de cálculo</div>
    <table class="rel-table">
      <tbody>
        <tr><td>(+) Recebido dos alunos no período</td><td style="text-align:right">${brl(p.bruto_recebido)}</td></tr>
        <tr><td>(−) Parte dos personais (repasse)</td><td style="text-align:right;color:var(--late)">− ${brl(p.total_personais)}</td></tr>
        <tr class="rel-total-row"><td>Base para distribuição</td><td style="text-align:right">${brl(p.base_distribuicao)}</td></tr>
      </tbody>
    </table>
    <div class="rel-nota" style="margin-top:8px">Despesas do período: ${brl(p.despesas_periodo)} — apenas informativo, não é descontado da base dos sócios.</div>

    <div class="rel-section-title">Distribuição por sócio</div>
    <table class="rel-table">
      <thead><tr><th>Sócio</th><th>Percentual</th><th>Valor</th></tr></thead>
      <tbody>${linhasSocios}</tbody>
    </table>

    <div class="rel-nota">${fechamento ? 'Valores extraídos do fechamento oficial deste período — não mudam mesmo que dados posteriores sejam alterados.' : 'Período ainda não fechado — feche em "Participação" para gravar um registro permanente.'}</div>
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
