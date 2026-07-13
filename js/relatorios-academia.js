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

  document.getElementById('rel-filtros-periodo').style.display = (tipo === 'extrato' || tipo === 'alunos' || tipo === 'vencplano') ? 'none' : 'flex';
  document.getElementById('rel-filtros-aluno').style.display = tipo === 'extrato' ? 'flex' : 'none';
  document.getElementById('rel-filtros-nenhum').style.display = tipo === 'alunos' ? 'flex' : 'none';
  document.getElementById('rel-filtros-vencplano').style.display = tipo === 'vencplano' ? 'flex' : 'none';
  document.getElementById('rel-alunos-colunas').style.display = tipo === 'alunos' ? 'flex' : 'none';

  if (tipo === 'extrato') { popularSelectAlunos(); }
  else { gerarRelatorioAtual(); }
}

function gerarRelatorioAtual() {
  if (relAtual === 'financeiro') gerarRelatorioFinanceiro();
  if (relAtual === 'repasses') gerarRelatorioRepasses();
  if (relAtual === 'participacao') gerarRelatorioParticipacao();
  if (relAtual === 'avulsos') gerarRelatorioAvulsos();
  if (relAtual === 'outras') gerarRelatorioOutrasReceitas();
  if (relAtual === 'vencplano') gerarRelatorioVencimentosPlano();
  if (relAtual === 'inadimplentes') gerarRelatorioInadimplentes();
  if (relAtual === 'extrato') gerarRelatorioExtrato();
  if (relAtual === 'alunos') gerarRelatorioAlunos();
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

  const [{ data: nomeAcademia }, { data: faturas, error }, { data: despesas }, { data: avulsas }, { data: outrasRec }] = await Promise.all([
    db.from('academias').select('nome').eq('id', MEU_ACADEMIA_ID).single(),
    db.from('vw_financeiro').select('*').gte('vencimento', pIni).lte('vencimento', pFim).order('vencimento'),
    db.from('despesas').select('*').gte('vencimento', pIni).lte('vencimento', pFim),
    db.from('cobrancas_avulsas').select('valor_total, valor_parceiro, descricao, alunos(nome), parceiros_externos(nome)').eq('status', 'pago')
      .gte('data_cobranca', pIni).lte('data_cobranca', pFim),
    db.from('outras_receitas').select('valor, descricao, categoria').eq('status', 'pago')
      .gte('data_lancamento', pIni).lte('data_lancamento', pFim),
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

  const recebidoMensalidade = somaReal('pago');
  const repasseMensalidade = lista.filter(m => m.status === 'pago').reduce((s, m) => s + Number(m.valor_personal || 0), 0);
  const aReceber = somaReal('pendente');
  const emAtraso = somaReal('atrasado');
  const cancelado = somaReal('cancelado');

  const avulsoBruto = (avulsas || []).reduce((s, a) => s + Number(a.valor_total), 0);
  const avulsoRepasse = (avulsas || []).reduce((s, a) => s + Number(a.valor_parceiro), 0);
  const outrasBruto = (outrasRec || []).reduce((s, o) => s + Number(o.valor), 0);

  const recebido = recebidoMensalidade + avulsoBruto + outrasBruto;
  const repasse = repasseMensalidade + avulsoRepasse;
  const totalDespesas = (despesas || []).reduce((s, d) => s + Number(d.valor), 0);
  const resultado = recebido - repasse - totalDespesas;

  const linhasFaturas = lista.filter(m => m.status !== 'cancelado').map(m => {
    const valorMostrar = m.status === 'pago' ? (recebidoPorId[m.id] ?? m.valor_total) : m.valor_total;
    return `<tr>
      <td>${esc(m.aluno)}</td>
      <td>${fmt(m.vencimento)}</td>
      <td>${brl(valorMostrar)}</td>
      <td style="text-transform:capitalize">${esc(m.status)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--muted)">Nenhuma fatura no período.</td></tr>';

  const linhasAvulsos = (avulsas || []).map(a => `
    <tr>
      <td>${esc(a.alunos?.nome || '—')}</td>
      <td>${esc(a.parceiros_externos?.nome || '—')}</td>
      <td>${esc(a.descricao)}</td>
      <td>${brl(a.valor_total)}</td>
    </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--muted)">Nenhuma cobrança avulsa paga no período.</td></tr>';

  const linhasOutras = (outrasRec || []).map(o => `
    <tr>
      <td>${esc(o.descricao)}</td>
      <td>${o.categoria ? esc(o.categoria) : '—'}</td>
      <td>${brl(o.valor)}</td>
    </tr>`).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--muted)">Nenhuma outra receita paga no período.</td></tr>';

  const linhasDespesas = (despesas || []).map(d => `
    <tr><td>${esc(d.descricao)}</td><td>${esc(d.categoria)}</td><td>${fmt(d.vencimento)}</td><td>${brl(d.valor)}</td></tr>
  `).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--muted)">Nenhuma despesa no período.</td></tr>';

  // Discriminação do repasse a terceiros: personal (sobre mensalidade) + parceiro externo (sobre avulso)
  const repassesPersonal = lista.filter(m => m.status === 'pago' && Number(m.valor_personal) > 0).map(m => `
    <tr><td>Personal</td><td>${esc(m.personal || '—')}</td><td>Mensalidade — ${esc(m.aluno)}</td><td>${brl(m.valor_personal)}</td></tr>
  `);
  const repassesParceiro = (avulsas || []).filter(a => Number(a.valor_parceiro) > 0).map(a => `
    <tr><td>Parceiro externo</td><td>${esc(a.parceiros_externos?.nome || '—')}</td><td>${esc(a.descricao)} — ${esc(a.alunos?.nome || '—')}</td><td>${brl(a.valor_parceiro)}</td></tr>
  `);
  const linhasRepasse = [...repassesPersonal, ...repassesParceiro].join('')
    || '<tr><td colspan="4" style="text-align:center;color:var(--muted)">Nenhum repasse no período.</td></tr>';

  alvo.innerHTML = `
    <div class="rel-header">
      <div class="marca"><div class="m">V</div><b>EVVO</b></div>
      <h2>${esc(nomeAcademia?.nome || 'Academia')} — Relatório Financeiro</h2>
      <div class="periodo">Período: ${fmt(pIni)} a ${fmt(pFim)}</div>
      <div class="gerado">Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR').slice(0,5)}</div>
    </div>

    <div class="rel-kpis" style="grid-template-columns:repeat(5,1fr)">
      <div class="rel-kpi"><div class="l">Recebido</div><div class="v" style="color:var(--ok)">${brl(recebido)}</div></div>
      <div class="rel-kpi"><div class="l">Repasse a terceiros</div><div class="v" style="color:var(--late)">− ${brl(repasse)}</div></div>
      <div class="rel-kpi"><div class="l">A receber</div><div class="v" style="color:var(--warn)">${brl(aReceber)}</div></div>
      <div class="rel-kpi"><div class="l">Em atraso</div><div class="v" style="color:var(--late)">${brl(emAtraso)}</div></div>
      <div class="rel-kpi"><div class="l">Cancelado</div><div class="v">${brl(cancelado)}</div></div>
    </div>

    <div class="rel-section-title">Faturas do período (mensalidades)</div>
    <table class="rel-table">
      <thead><tr><th>Aluno</th><th>Vencimento</th><th>Valor</th><th>Status</th></tr></thead>
      <tbody>${linhasFaturas}</tbody>
    </table>

    <div class="rel-section-title">Cobranças avulsas pagas no período (Parceiros Externos)</div>
    <table class="rel-table">
      <thead><tr><th>Aluno</th><th>Parceiro</th><th>Descrição</th><th>Valor</th></tr></thead>
      <tbody>${linhasAvulsos}</tbody>
    </table>

    <div class="rel-section-title">Outras Receitas pagas no período</div>
    <table class="rel-table">
      <thead><tr><th>Descrição</th><th>Categoria</th><th>Valor</th></tr></thead>
      <tbody>${linhasOutras}</tbody>
    </table>

    <div class="rel-section-title">Repasse a terceiros do período</div>
    <table class="rel-table">
      <thead><tr><th>Tipo</th><th>Nome</th><th>Referente a</th><th>Valor</th></tr></thead>
      <tbody>${linhasRepasse}</tbody>
      <tfoot><tr class="rel-total-row"><td colspan="3">Total repassado</td><td>${brl(repasse)}</td></tr></tfoot>
    </table>

    <div class="rel-section-title">Despesas do período</div>
    <table class="rel-table">
      <thead><tr><th>Descrição</th><th>Categoria</th><th>Vencimento</th><th>Valor</th></tr></thead>
      <tbody>${linhasDespesas}</tbody>
      <tfoot><tr class="rel-total-row"><td colspan="3">Total de despesas</td><td>${brl(totalDespesas)}</td></tr></tfoot>
    </table>

    <div class="rel-resultado">
      <span>Resultado do período (recebido − repasse a terceiros − despesas)</span>
      <span class="num" style="color:${resultado >= 0 ? 'var(--ok)' : 'var(--late)'}">${brl(resultado)}</span>
    </div>
    <div class="rel-nota">Relatório informativo. "Recebido" inclui mensalidades + cobranças avulsas de Parceiros Externos + Outras Receitas, pelo valor efetivamente pago. "A receber", "Em atraso" e "Cancelado" referem-se apenas às mensalidades — veja os relatórios dedicados para o detalhamento de pendências de avulsos e outras receitas.</div>
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
        <tr><td>(+) Líquido de Parceiros Externos (avulsos)</td><td style="text-align:right;color:var(--ok)">+ ${brl(p.avulsas_liquido || 0)}</td></tr>
        <tr><td>(+) Outras Receitas</td><td style="text-align:right;color:var(--ok)">+ ${brl(p.outras_liquido || 0)}</td></tr>
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

/* ---------------- RELATÓRIO DE ALUNOS ATIVOS/INATIVOS ---------------- */
async function gerarRelatorioAlunos() {
  const alvo = document.getElementById('rel-conteudo');
  alvo.innerHTML = '<div class="carregando">Gerando relatório…</div>';

  const situacao = document.getElementById('rel-alunos-situacao')?.value || 'ambos';
  const col = {
    cpf: document.getElementById('col-cpf')?.checked,
    whatsapp: document.getElementById('col-whatsapp')?.checked,
    email: document.getElementById('col-email')?.checked,
    plano: document.getElementById('col-plano')?.checked,
    personal: document.getElementById('col-personal')?.checked,
    valorPlano: document.getElementById('col-valor-plano')?.checked,
    valorPersonal: document.getElementById('col-valor-personal')?.checked,
    cadastro: document.getElementById('col-cadastro')?.checked,
    endereco: document.getElementById('col-endereco')?.checked,
    modalidadesExtras: document.getElementById('col-modalidades-extras')?.checked,
    totalMensal: document.getElementById('col-total-mensal')?.checked,
  };

  const [{ data: nomeAcademia }, { data: alunos, error }, { data: extras }] = await Promise.all([
    db.from('academias').select('nome').eq('id', MEU_ACADEMIA_ID).single(),
    db.from('vw_alunos_completo').select('*').order('nome'),
    db.from('matriculas_extras').select('aluno_id, valor_personalizado, modalidades(nome), planos(valor)').eq('ativo', true),
  ]);

  if (error) { alvo.innerHTML = `<div class="vazio">Erro: ${esc(error.message)}</div>`; return; }

  const extrasPorAluno = {};
  (extras || []).forEach(e => {
    if (!extrasPorAluno[e.aluno_id]) extrasPorAluno[e.aluno_id] = [];
    extrasPorAluno[e.aluno_id].push({ nome: e.modalidades?.nome || '?', valor: Number(e.valor_personalizado ?? e.planos?.valor ?? 0) });
  });

  const lista = alunos || [];
  const ativos = lista.filter(a => a.ativo !== false);
  const inativos = lista.filter(a => a.ativo === false);
  const comPersonal = ativos.filter(a => a.personal_id).length;

  // Monta cabeçalho e linhas dinamicamente, conforme as colunas marcadas
  const cabecalhos = ['Nome'];
  if (col.cpf) cabecalhos.push('CPF');
  if (col.whatsapp) cabecalhos.push('WhatsApp');
  if (col.email) cabecalhos.push('E-mail');
  if (col.plano) cabecalhos.push('Plano');
  if (col.personal) cabecalhos.push('Personal');
  if (col.valorPlano) cabecalhos.push('Valor plano');
  if (col.valorPersonal) cabecalhos.push('Valor personal');
  if (col.cadastro) cabecalhos.push('Cadastrado em');
  if (col.endereco) cabecalhos.push('Endereço completo');
  if (col.modalidadesExtras) cabecalhos.push('Modalidades extras');
  if (col.totalMensal) cabecalhos.push('Total mensal');

  const enderecoCompleto = a => {
    const partes = [
      a.endereco ? `${a.endereco}${a.numero ? ', ' + a.numero : ''}` : null,
      a.bairro || null,
      a.cidade ? `${a.cidade}${a.estado ? '/' + a.estado : ''}` : null,
      a.cep ? `CEP ${a.cep}` : null,
    ].filter(Boolean);
    return partes.length ? partes.join(' — ') : '—';
  };

  const linhaAluno = a => {
    const extrasDoAluno = extrasPorAluno[a.id] || [];
    const totalExtras = extrasDoAluno.reduce((s, e) => s + e.valor, 0);
    const valorBase = Number(a.valor_personalizado ?? a.valor_plano);
    const totalMensal = valorBase + Number(a.valor_personal || 0) + totalExtras;

    const celulas = [esc(a.nome)];
    if (col.cpf) celulas.push(esc(a.cpf || '—'));
    if (col.whatsapp) celulas.push(esc(a.whatsapp || '—'));
    if (col.email) celulas.push(esc(a.email || '—'));
    if (col.plano) celulas.push(esc(a.plano || '—'));
    if (col.personal) celulas.push(a.personal ? esc(a.personal) : '—');
    if (col.valorPlano) celulas.push(brl(a.valor_plano));
    if (col.valorPersonal) celulas.push(Number(a.valor_personal) > 0 ? brl(a.valor_personal) : '—');
    if (col.cadastro) celulas.push(fmt(String(a.created_at).slice(0,10)));
    if (col.endereco) celulas.push(esc(enderecoCompleto(a)));
    if (col.modalidadesExtras) celulas.push(extrasDoAluno.length ? extrasDoAluno.map(e => `${esc(e.nome)} (${brl(e.valor)})`).join(', ') : '—');
    if (col.totalMensal) celulas.push(`<b>${brl(totalMensal)}</b>`);
    return `<tr>${celulas.map(c => `<td>${c}</td>`).join('')}</tr>`;
  };

  const colspan = cabecalhos.length;
  const linhasAtivos = ativos.map(linhaAluno).join('') || `<tr><td colspan="${colspan}" style="text-align:center;color:var(--muted)">Nenhum aluno ativo.</td></tr>`;
  const linhasInativos = inativos.map(linhaAluno).join('') || `<tr><td colspan="${colspan}" style="text-align:center;color:var(--muted)">Nenhum aluno inativo.</td></tr>`;
  const theadHtml = `<thead><tr>${cabecalhos.map(h => `<th>${h}</th>`).join('')}</tr></thead>`;

  const secaoAtivos = `
    <div class="rel-section-title">Alunos ativos (${ativos.length})</div>
    <table class="rel-table">${theadHtml}<tbody>${linhasAtivos}</tbody></table>`;

  const secaoInativos = `
    <div class="rel-section-title">Alunos inativos (${inativos.length})</div>
    <table class="rel-table">${theadHtml}<tbody>${linhasInativos}</tbody></table>`;

  const tituloSituacao = situacao === 'ativos' ? 'Alunos Ativos' : situacao === 'inativos' ? 'Alunos Inativos' : 'Alunos Ativos/Inativos';

  alvo.innerHTML = `
    <div class="rel-header">
      <div class="marca"><div class="m">V</div><b>EVVO</b></div>
      <h2>${esc(nomeAcademia?.nome || 'Academia')} — ${tituloSituacao}</h2>
      <div class="periodo">Situação atual da base de alunos</div>
      <div class="gerado">Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR').slice(0,5)}</div>
    </div>

    <div class="rel-kpis">
      <div class="rel-kpi"><div class="l">Ativos</div><div class="v" style="color:var(--ok)">${ativos.length}</div></div>
      <div class="rel-kpi"><div class="l">Inativos</div><div class="v" style="color:var(--muted)">${inativos.length}</div></div>
      <div class="rel-kpi"><div class="l">Com personal</div><div class="v">${comPersonal}</div></div>
      <div class="rel-kpi"><div class="l">Total já cadastrado</div><div class="v">${lista.length}</div></div>
    </div>

    ${situacao !== 'inativos' ? secaoAtivos : ''}
    ${situacao !== 'ativos' ? secaoInativos : ''}

    <div class="rel-nota">Inclui todos os alunos já cadastrados na academia, independentemente de período.</div>
  `;
}

/* ---------------- RELATÓRIO DE PARCEIROS EXTERNOS (AVULSOS) ---------------- */
async function gerarRelatorioAvulsos() {
  relPeriodoPadrao();
  const pIni = document.getElementById('rel-ini').value;
  const pFim = document.getElementById('rel-fim').value;
  const alvo = document.getElementById('rel-conteudo');
  alvo.innerHTML = '<div class="carregando">Gerando relatório…</div>';

  const [{ data: nomeAcademia }, { data: cobrancas, error }] = await Promise.all([
    db.from('academias').select('nome').eq('id', MEU_ACADEMIA_ID).single(),
    db.from('cobrancas_avulsas')
      .select('*, alunos(nome), parceiros_externos(nome)')
      .eq('status', 'pago')
      .gte('pago_em', `${pIni}T00:00:00`)
      .lte('pago_em', `${pFim}T23:59:59`)
      .order('pago_em'),
  ]);

  if (error) { alvo.innerHTML = `<div class="vazio">Erro: ${esc(error.message)}</div>`; return; }

  const lista = cobrancas || [];
  const totalRecebido = lista.reduce((s, c) => s + Number(c.valor_total), 0);
  const totalParceiros = lista.reduce((s, c) => s + Number(c.valor_parceiro), 0);
  const totalLiquido = lista.reduce((s, c) => s + Number(c.valor_liquido_academia), 0);
  const pendenteRepasse = lista.filter(c => c.status_repasse !== 'pago').reduce((s, c) => s + Number(c.valor_parceiro), 0);

  // Agrupado por parceiro
  const porParceiro = {};
  lista.forEach(c => {
    const nome = c.parceiros_externos?.nome || '—';
    if (!porParceiro[nome]) porParceiro[nome] = { total: 0, parceiro: 0, liquido: 0, pendente: 0, qtd: 0 };
    porParceiro[nome].total += Number(c.valor_total);
    porParceiro[nome].parceiro += Number(c.valor_parceiro);
    porParceiro[nome].liquido += Number(c.valor_liquido_academia);
    porParceiro[nome].qtd += 1;
    if (c.status_repasse !== 'pago') porParceiro[nome].pendente += Number(c.valor_parceiro);
  });

  const linhasParceiros = Object.entries(porParceiro).map(([nome, v]) => `
    <tr>
      <td>${esc(nome)}</td><td>${v.qtd}</td><td>${brl(v.total)}</td><td>${brl(v.parceiro)}</td>
      <td style="font-weight:700">${brl(v.liquido)}</td>
      <td style="color:${v.pendente > 0 ? 'var(--warn)' : 'var(--ok)'}">${brl(v.pendente)}</td>
    </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--muted)">Nenhuma cobrança avulsa paga no período.</td></tr>';

  const linhasHistorico = lista.map(c => `
    <tr>
      <td>${fmt(String(c.pago_em).slice(0, 10))}</td>
      <td>${esc(c.alunos?.nome || '—')}</td>
      <td>${esc(c.parceiros_externos?.nome || '—')}</td>
      <td>${esc(c.descricao)}</td>
      <td>${brl(c.valor_total)}</td>
      <td>${brl(c.valor_liquido_academia)}</td>
      <td>${c.status_repasse === 'pago' ? '<span class="badge b-ok">Repassado</span>' : '<span class="badge b-off">Pendente</span>'}</td>
    </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--muted)">Nenhuma cobrança avulsa paga no período.</td></tr>';

  alvo.innerHTML = `
    <div class="rel-header">
      <div class="marca"><div class="m">V</div><b>EVVO</b></div>
      <h2>${esc(nomeAcademia?.nome || 'Academia')} — Parceiros Externos (Avulsos)</h2>
      <div class="periodo">Período: ${fmt(pIni)} a ${fmt(pFim)}</div>
      <div class="gerado">Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR').slice(0,5)}</div>
    </div>

    <div class="rel-kpis" style="grid-template-columns:repeat(4,1fr)">
      <div class="rel-kpi"><div class="l">Recebido (total)</div><div class="v">${brl(totalRecebido)}</div></div>
      <div class="rel-kpi"><div class="l">Parte dos parceiros</div><div class="v" style="color:var(--late)">${brl(totalParceiros)}</div></div>
      <div class="rel-kpi"><div class="l">Líquido da academia</div><div class="v" style="color:var(--ok)">${brl(totalLiquido)}</div></div>
      <div class="rel-kpi"><div class="l">Pendente de repasse</div><div class="v" style="color:var(--warn)">${brl(pendenteRepasse)}</div></div>
    </div>

    <div class="rel-section-title">Por parceiro externo</div>
    <table class="rel-table">
      <thead><tr><th>Parceiro</th><th>Qtd.</th><th>Total</th><th>Parte do parceiro</th><th>Líquido academia</th><th>Pendente de repasse</th></tr></thead>
      <tbody>${linhasParceiros}</tbody>
    </table>

    <div class="rel-section-title">Histórico de cobranças pagas no período</div>
    <table class="rel-table">
      <thead><tr><th>Pago em</th><th>Aluno</th><th>Parceiro</th><th>Descrição</th><th>Total</th><th>Líquido academia</th><th>Repasse</th></tr></thead>
      <tbody>${linhasHistorico}</tbody>
    </table>

    <div class="rel-nota">O valor líquido da academia (após descontar a parte do parceiro) já entra na base de distribuição dos sócios — veja o relatório de Participação. Este relatório usa a data de PAGAMENTO da cobrança, não a data de lançamento.</div>
  `;
}

/* ---------------- RELATÓRIO DE OUTRAS RECEITAS ---------------- */
async function gerarRelatorioOutrasReceitas() {
  relPeriodoPadrao();
  const pIni = document.getElementById('rel-ini').value;
  const pFim = document.getElementById('rel-fim').value;
  const alvo = document.getElementById('rel-conteudo');
  alvo.innerHTML = '<div class="carregando">Gerando relatório…</div>';

  const [{ data: nomeAcademia }, { data: lanc, error }] = await Promise.all([
    db.from('academias').select('nome').eq('id', MEU_ACADEMIA_ID).single(),
    db.from('outras_receitas')
      .select('*, outras_receitas_recorrentes(descricao, personal_id, personais(nome))')
      .gte('data_lancamento', pIni).lte('data_lancamento', pFim)
      .order('data_lancamento'),
  ]);

  if (error) { alvo.innerHTML = `<div class="vazio">Erro: ${esc(error.message)}</div>`; return; }

  const lista = lanc || [];
  const pagos = lista.filter(l => l.status === 'pago');
  const totalPago = pagos.reduce((s, l) => s + Number(l.valor), 0);
  const totalPendente = lista.filter(l => l.status === 'pendente' || l.status === 'atrasado').reduce((s, l) => s + Number(l.valor), 0);
  const totalCancelado = lista.filter(l => l.status === 'cancelado').reduce((s, l) => s + Number(l.valor), 0);
  const qtdRecorrente = pagos.filter(l => l.recorrente_id).length;
  const qtdAvulsa = pagos.filter(l => !l.recorrente_id).length;

  const linhas = lista.map(l => {
    const statusBadge = l.status === 'pago' ? '<span class="badge b-ok">Pago</span>'
      : l.status === 'atrasado' ? '<span class="badge b-late">Atrasado</span>'
      : l.status === 'cancelado' ? '<span class="badge b-off">Cancelado</span>'
      : '<span class="badge b-warn">Pendente</span>';
    const tipo = l.recorrente_id ? 'Recorrente' : 'Avulsa';
    const personal = l.outras_receitas_recorrentes?.personais?.nome || '—';
    const dataRef = l.competencia ? fmt(l.competencia).slice(3) : fmt(l.data_lancamento);
    return `<tr>
      <td>${dataRef}</td><td>${tipo}</td><td>${esc(l.descricao)}</td><td>${esc(personal)}</td>
      <td>${brl(l.valor)}</td><td>${statusBadge}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--muted)">Nenhum lançamento no período.</td></tr>';

  alvo.innerHTML = `
    <div class="rel-header">
      <div class="marca"><div class="m">V</div><b>EVVO</b></div>
      <h2>${esc(nomeAcademia?.nome || 'Academia')} — Outras Receitas</h2>
      <div class="periodo">Período: ${fmt(pIni)} a ${fmt(pFim)}</div>
      <div class="gerado">Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR').slice(0,5)}</div>
    </div>

    <div class="rel-kpis" style="grid-template-columns:repeat(4,1fr)">
      <div class="rel-kpi"><div class="l">Recebido</div><div class="v" style="color:var(--ok)">${brl(totalPago)}</div></div>
      <div class="rel-kpi"><div class="l">Pendente</div><div class="v" style="color:var(--warn)">${brl(totalPendente)}</div></div>
      <div class="rel-kpi"><div class="l">Cancelado</div><div class="v">${brl(totalCancelado)}</div></div>
      <div class="rel-kpi"><div class="l">Recorrentes × Avulsas (pagas)</div><div class="v" style="font-size:15px">${qtdRecorrente} × ${qtdAvulsa}</div></div>
    </div>

    <div class="rel-section-title">Lançamentos do período</div>
    <table class="rel-table">
      <thead><tr><th>Data/Competência</th><th>Tipo</th><th>Descrição</th><th>Personal</th><th>Valor</th><th>Status</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>

    <div class="rel-nota">100% do valor pago já entra na base de distribuição dos sócios — não há repasse nessa fonte de receita. Veja o relatório de Participação para o total consolidado.</div>
  `;
}

/* ---------------- RELATÓRIO DE VENCIMENTOS DE PLANO ---------------- */
async function gerarRelatorioVencimentosPlano() {
  const alvo = document.getElementById('rel-conteudo');
  alvo.innerHTML = '<div class="carregando">Gerando relatório…</div>';

  const [{ data: nomeAcademia }, { data: cfgPlano }, { data: alunos, error }] = await Promise.all([
    db.from('academias').select('nome').eq('id', MEU_ACADEMIA_ID).single(),
    db.from('config').select('valor').eq('chave', 'alerta_vencimento_plano_dias').maybeSingle(),
    db.from('vw_alunos_completo').select('id, nome, cpf, plano, whatsapp, data_vencimento_plano')
      .eq('ativo', true).not('data_vencimento_plano', 'is', null)
      .order('data_vencimento_plano', { ascending: true }),
  ]);

  if (error) { alvo.innerHTML = `<div class="vazio">Erro: ${esc(error.message)}</div>`; return; }

  const diasAlerta = parseInt(cfgPlano?.valor) || 30;
  const hojeStr = new Date().toISOString().slice(0, 10);
  const lista = alunos || [];

  const calcSituacao = venc => {
    const diff = Math.round((new Date(venc) - new Date(hojeStr)) / 86400000);
    if (diff < 0) return { texto: `Vencido há ${Math.abs(diff)} dia(s)`, classe: 'b-late', urgente: true, diff };
    if (diff === 0) return { texto: 'Vence hoje', classe: 'b-late', urgente: true, diff };
    if (diff <= diasAlerta) return { texto: `Vence em ${diff} dia(s)`, classe: 'b-warn', urgente: true, diff };
    return { texto: `Vence em ${diff} dia(s)`, classe: 'b-ok', urgente: false, diff };
  };

  const comSituacao = lista.map(a => ({ ...a, sit: calcSituacao(a.data_vencimento_plano) }));
  const vencidos = comSituacao.filter(a => a.sit.diff < 0).length;
  const vencendoLogo = comSituacao.filter(a => a.sit.diff >= 0 && a.sit.diff <= diasAlerta).length;
  const emDia = comSituacao.filter(a => a.sit.diff > diasAlerta).length;

  const linhas = comSituacao.map((a, i) => `
    <tr data-busca="${esc((a.nome + ' ' + (a.cpf || '') + ' ' + (a.whatsapp || '')).toLowerCase())}">
      <td><div class="acad-cell"><div class="av" style="background:${corDe(i)}">${ini(a.nome)}</div><div class="nm">${esc(a.nome)}</div></div></td>
      <td>${esc(a.plano || '—')}</td>
      <td>${esc(a.whatsapp || '—')}</td>
      <td>${fmt(a.data_vencimento_plano)}</td>
      <td><span class="badge ${a.sit.classe}">${a.sit.texto}</span></td>
      <td><button class="btn btn-ghost btn-sm" onclick="abrirRenovarPlanoAc(${a.id})">🔄 Renovar</button></td>
    </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--muted)">Nenhum aluno com data de vencimento de plano cadastrada.</td></tr>';

  const buscaEl = document.getElementById('rel-vencplano-busca');
  if (buscaEl) buscaEl.value = '';

  alvo.innerHTML = `
    <div class="rel-header">
      <div class="marca"><div class="m">V</div><b>EVVO</b></div>
      <h2>${esc(nomeAcademia?.nome || 'Academia')} — Vencimentos de Plano</h2>
      <div class="periodo">Alerta configurado: ${diasAlerta} dia(s) de antecedência</div>
      <div class="gerado">Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR').slice(0,5)}</div>
    </div>

    <div class="rel-kpis" style="grid-template-columns:repeat(3,1fr)">
      <div class="rel-kpi"><div class="l">Vencidos</div><div class="v" style="color:var(--late)">${vencidos}</div></div>
      <div class="rel-kpi"><div class="l">Vencendo em até ${diasAlerta} dias</div><div class="v" style="color:var(--warn)">${vencendoLogo}</div></div>
      <div class="rel-kpi"><div class="l">Em dia</div><div class="v" style="color:var(--ok)">${emDia}</div></div>
    </div>

    <div class="rel-section-title">Alunos com data de vencimento de plano cadastrada</div>
    <table class="rel-table">
      <thead><tr><th>Aluno</th><th>Plano</th><th>WhatsApp</th><th>Vencimento</th><th>Situação</th><th></th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>

    <div class="rel-nota">Alunos sem data de início/vencimento de plano cadastrada não aparecem aqui — preencha no cadastro do aluno para incluí-los neste controle.</div>
  `;
}

/* ---------------- IMPRIMIR ---------------- */
function filtrarRelatorioVencplano() {
  const termo = document.getElementById('rel-vencplano-busca').value.trim().toLowerCase();
  document.querySelectorAll('#rel-conteudo table tbody tr[data-busca]').forEach(tr => {
    tr.style.display = tr.dataset.busca.includes(termo) ? '' : 'none';
  });
}

function imprimirRelatorio() {
  const conteudo = document.getElementById('rel-conteudo').innerHTML;
  document.getElementById('print-area').innerHTML = conteudo;

  // Detecta se algum quadro do relatório tem muitas colunas — só nesse caso
  // a impressão vira paisagem com fonte menor, pra não afetar os relatórios
  // que já ficam perfeitos em retrato (Financeiro, Participação, etc.)
  const maiorNumColunas = Math.max(0, ...Array.from(document.querySelectorAll('#print-area table thead tr'))
    .map(tr => tr.children.length));

  const antigo = document.getElementById('print-orientation-style');
  if (antigo) antigo.remove();

  if (maiorNumColunas > 8) {
    const styleTag = document.createElement('style');
    styleTag.id = 'print-orientation-style';
    styleTag.textContent = `@media print {
      @page { size: landscape; margin: 10mm; }
      .rel-table { font-size: 10px !important; }
      .rel-table td, .rel-table th { padding: 4px 5px !important; }
    }`;
    document.head.appendChild(styleTag);
  }

  window.print();
}

/* ---------------- EXPORTAR EXCEL (genérico — funciona em qualquer relatório) ---------------- */
function exportarRelatorioExcel() {
  const tabelas = document.querySelectorAll('#rel-conteudo table');
  if (!tabelas.length) { toast('Nada para exportar ainda — gere o relatório primeiro.'); return; }

  const wb = XLSX.utils.book_new();
  const nomesUsados = new Set();

  tabelas.forEach((tabela, i) => {
    // Tenta achar o título da seção logo acima da tabela (ex: "Repasse a terceiros do período")
    let tituloEl = tabela.closest('table')?.previousElementSibling;
    let nome = (tituloEl && tituloEl.classList?.contains('rel-section-title'))
      ? tituloEl.textContent.trim() : `Tabela ${i + 1}`;
    nome = nome.replace(/[\\\/\?\*\[\]:]/g, '').slice(0, 28) || `Tabela ${i + 1}`;
    let nomeFinal = nome, n = 2;
    while (nomesUsados.has(nomeFinal)) { nomeFinal = `${nome} (${n++})`; }
    nomesUsados.add(nomeFinal);

    const ws = XLSX.utils.table_to_sheet(tabela, { raw: false });
    XLSX.utils.book_append_sheet(wb, ws, nomeFinal);
  });

  const tituloRel = document.querySelector('#rel-conteudo h2')?.textContent?.trim() || 'relatorio';
  const nomeArquivo = tituloRel.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'relatorio';
  const dataStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${nomeArquivo}_${dataStr}.xlsx`);
}
