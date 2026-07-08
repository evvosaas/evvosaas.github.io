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

  const ehExtrato = tipo === 'extrato';
  document.getElementById('rel-filtros-periodo').style.display = ehExtrato ? 'none' : 'flex';
  document.getElementById('rel-filtros-aluno').style.display = ehExtrato ? 'flex' : 'none';

  if (ehExtrato) { popularSelectAlunos(); }
  else { gerarRelatorioAtual(); }
}

function gerarRelatorioAtual() {
  if (relAtual === 'financeiro') gerarRelatorioFinanceiro();
  if (relAtual === 'repasses') gerarRelatorioRepasses();
  if (relAtual === 'participacao') gerarRelatorioParticipacao();
  if (relAtual === 'inadimplentes') gerarRelatorioInadimplentes();
  if (relAtual === 'extrato') gerarRelatorioExtrato();
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

/* ---------------- RELATÓRIO DE INADIMPLENTES ---------------- */
async function gerarRelatorioInadimplentes() {
  relPeriodoPadrao();
  const pIni = document.getElementById('rel-ini').value;
  const pFim = document.getElementById('rel-fim').value;
  const alvo = document.getElementById('rel-conteudo');
  alvo.innerHTML = '<div class="carregando">Gerando relatório…</div>';

  const [{ data: nomeAcademia }, { data: atrasados, error }] = await Promise.all([
    db.from('academias').select('nome').eq('id', MEU_ACADEMIA_ID).single(),
    db.from('mensalidades')
      .select('vencimento, valor_total, aluno_id, alunos(nome, whatsapp)')
      .eq('status', 'atrasado')
      .gte('vencimento', pIni).lte('vencimento', pFim)
      .order('vencimento'),
  ]);

  if (error) { alvo.innerHTML = `<div class="vazio">Erro: ${esc(error.message)}</div>`; return; }

  const hoje = new Date();
  const lista = (atrasados || []).map(m => {
    const venc = new Date(m.vencimento + 'T00:00:00');
    const diasAtraso = Math.max(Math.floor((hoje - venc) / 86400000), 0);
    return { ...m, diasAtraso };
  }).sort((a, b) => b.diasAtraso - a.diasAtraso);

  const totalValor = lista.reduce((s, m) => s + Number(m.valor_total), 0);
  const alunosUnicos = new Set(lista.map(m => m.aluno_id)).size;

  const linhas = lista.map(m => `
    <tr>
      <td>${esc(m.alunos?.nome || '—')}</td>
      <td>${esc(m.alunos?.whatsapp || '—')}</td>
      <td>${fmt(m.vencimento)}</td>
      <td style="font-weight:700;color:${m.diasAtraso > 15 ? 'var(--late)' : 'var(--warn)'}">${m.diasAtraso} dia(s)</td>
      <td>${brl(m.valor_total)}</td>
    </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--muted)">Nenhum inadimplente no período. 🎉</td></tr>';

  alvo.innerHTML = `
    <div class="rel-header">
      <div class="marca"><div class="m">V</div><b>EVVO</b></div>
      <h2>${esc(nomeAcademia?.nome || 'Academia')} — Inadimplentes</h2>
      <div class="periodo">Vencimentos entre ${fmt(pIni)} e ${fmt(pFim)}</div>
      <div class="gerado">Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR').slice(0,5)}</div>
    </div>

    <div class="rel-kpis" style="grid-template-columns:repeat(3,1fr)">
      <div class="rel-kpi"><div class="l">Total em atraso</div><div class="v" style="color:var(--late)">${brl(totalValor)}</div></div>
      <div class="rel-kpi"><div class="l">Faturas atrasadas</div><div class="v">${lista.length}</div></div>
      <div class="rel-kpi"><div class="l">Alunos únicos</div><div class="v">${alunosUnicos}</div></div>
    </div>

    <div class="rel-section-title">Lista de inadimplentes (mais atrasado primeiro)</div>
    <table class="rel-table">
      <thead><tr><th>Aluno</th><th>WhatsApp</th><th>Vencimento</th><th>Atraso</th><th>Valor</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>

    <div class="rel-nota">Dias de atraso calculados a partir da data de hoje. Use o WhatsApp para entrar em contato pela cobrança.</div>
  `;
}

/* ---------------- EXTRATO DE ALUNO ---------------- */
async function popularSelectAlunos() {
  const sel = document.getElementById('rel-aluno-sel');
  sel.innerHTML = '<option>Carregando…</option>';
  const { data: alunos } = await db.from('alunos').select('id, nome, ativo').order('nome');
  if (!alunos || !alunos.length) {
    sel.innerHTML = '<option value="">Nenhum aluno cadastrado</option>';
    document.getElementById('rel-conteudo').innerHTML = '<div class="vazio">Nenhum aluno cadastrado ainda.</div>';
    return;
  }
  sel.innerHTML = alunos.map(a => `<option value="${a.id}">${esc(a.nome)}${a.ativo === false ? ' (inativo)' : ''}</option>`).join('');
  gerarRelatorioExtrato();
}

async function gerarRelatorioExtrato() {
  const alunoId = Number(document.getElementById('rel-aluno-sel').value);
  const alvo = document.getElementById('rel-conteudo');
  if (!alunoId) { alvo.innerHTML = '<div class="vazio">Selecione um aluno.</div>'; return; }
  alvo.innerHTML = '<div class="carregando">Gerando extrato…</div>';

  const [{ data: nomeAcademia }, { data: aluno }, { data: mensalidades, error }] = await Promise.all([
    db.from('academias').select('nome').eq('id', MEU_ACADEMIA_ID).single(),
    db.from('vw_alunos_completo').select('*').eq('id', alunoId).single(),
    db.from('mensalidades').select('*').eq('aluno_id', alunoId).order('vencimento', { ascending: false }),
  ]);

  if (error || !aluno) { alvo.innerHTML = `<div class="vazio">Erro: ${esc(error?.message || 'aluno não encontrado')}</div>`; return; }

  const lista = mensalidades || [];
  const totalPago = lista.filter(m => m.status === 'pago').reduce((s, m) => s + Number(m.valor_total), 0);
  const totalPendente = lista.filter(m => m.status === 'pendente' || m.status === 'atrasado').reduce((s, m) => s + Number(m.valor_total), 0);

  const linhas = lista.map(m => `
    <tr>
      <td>${String(m.competencia).slice(0,7).split('-').reverse().join('/')}</td>
      <td>${fmt(m.vencimento)}</td>
      <td>${brl(m.valor_total)}</td>
      <td style="text-transform:capitalize">${esc(m.status)}</td>
      <td>${m.pago_em ? fmt(String(m.pago_em).slice(0,10)) : '—'}</td>
    </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--muted)">Nenhuma fatura registrada.</td></tr>';

  alvo.innerHTML = `
    <div class="rel-header">
      <div class="marca"><div class="m">V</div><b>EVVO</b></div>
      <h2>${esc(nomeAcademia?.nome || 'Academia')} — Extrato do Aluno</h2>
      <div class="periodo">${esc(aluno.nome)}${aluno.ativo === false ? ' (inativo)' : ''}</div>
      <div class="gerado">Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR').slice(0,5)}</div>
    </div>

    <div class="rel-section-title">Dados do aluno</div>
    <table class="rel-table">
      <tbody>
        <tr><td>CPF</td><td style="text-align:right">${esc(aluno.cpf || '—')}</td></tr>
        <tr><td>WhatsApp</td><td style="text-align:right">${esc(aluno.whatsapp || '—')}</td></tr>
        <tr><td>Plano</td><td style="text-align:right">${esc(aluno.plano)} (${brl(aluno.valor_plano)})</td></tr>
        ${aluno.personal ? `<tr><td>Personal</td><td style="text-align:right">${esc(aluno.personal)} (${brl(aluno.valor_personal)})</td></tr>` : ''}
        <tr><td>Cadastrado em</td><td style="text-align:right">${fmt(String(aluno.created_at).slice(0,10))}</td></tr>
      </tbody>
    </table>

    <div class="rel-kpis" style="grid-template-columns:repeat(3,1fr);margin-top:20px">
      <div class="rel-kpi"><div class="l">Total pago (histórico)</div><div class="v" style="color:var(--ok)">${brl(totalPago)}</div></div>
      <div class="rel-kpi"><div class="l">Pendente/atrasado</div><div class="v" style="color:var(--warn)">${brl(totalPendente)}</div></div>
      <div class="rel-kpi"><div class="l">Total de faturas</div><div class="v">${lista.length}</div></div>
    </div>

    <div class="rel-section-title">Histórico de mensalidades</div>
    <table class="rel-table">
      <thead><tr><th>Competência</th><th>Vencimento</th><th>Valor</th><th>Status</th><th>Pago em</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>

    <div class="rel-nota">Extrato completo desde o cadastro do aluno na academia.</div>
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
  let nomeArquivo;
  if (relAtual === 'extrato') {
    const nomeAluno = document.getElementById('rel-aluno-sel').selectedOptions[0]?.textContent.trim().replace(/\s+/g, '-') || 'aluno';
    nomeArquivo = `extrato-${nomeAluno}.pdf`;
  } else {
    nomeArquivo = `relatorio-${relAtual}-${document.getElementById('rel-ini').value}-a-${document.getElementById('rel-fim').value}.pdf`;
  }
  toast('Gerando PDF…');
  html2pdf().set({
    margin: 12,
    filename: nomeArquivo,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
  }).from(el).save();
}
