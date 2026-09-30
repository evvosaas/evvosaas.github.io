/* ============================================================
   EVVO — MÓDULO DESPESAS (painel da academia)
   Migrado fielmente do HealFit Gestão: CRUD, categorias,
   recorrência mensal, baixa, filtro de período, KPIs com
   Resultado usando o valor EFETIVAMENTE recebido (pagamentos).
   ============================================================ */
let AC_DESP_LIST = [];
let acDespFiltro = 'todas';
let acDespEditId = null;

/* ---------------- CARREGAR ---------------- */
function acDespPeriodoPadrao() {
  const h = new Date();
  const ini = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-01`;
  const fim = new Date(h.getFullYear(), h.getMonth() + 1, 0).toISOString().slice(0, 10);
  const elIni = document.getElementById('ac-desp-ini');
  const elFim = document.getElementById('ac-desp-fim');
  if (!elIni.value) elIni.value = ini;
  if (!elFim.value) elFim.value = fim;
}

async function carregarDespesasAc() {
  acDespPeriodoPadrao();
  const pIni = document.getElementById('ac-desp-ini').value;
  const pFim = document.getElementById('ac-desp-fim').value;

  const tb = document.getElementById('ac-desp-rows');
  tb.innerHTML = '<tr><td colspan="6" class="carregando">Carregando…</td></tr>';

  // despesas do período + receita EFETIVAMENTE recebida no mesmo período
  const [{ data: despesas, error }, { data: pagos }] = await Promise.all([
    db.from('despesas').select('*')
      .gte('vencimento', pIni).lte('vencimento', pFim)
      .order('vencimento', { ascending: true }),
    db.from('pagamentos').select('valor, mensalidades(valor_personal)')
      .gte('pago_em', pIni + 'T00:00:00')
      .lte('pago_em', pFim + 'T23:59:59'),
  ]);

  if (error) { tb.innerHTML = `<tr><td colspan="6" class="vazio">Erro: ${esc(error.message)}</td></tr>`; return; }
  AC_DESP_LIST = despesas || [];

  const receitaAcademia = (pagos || []).reduce(
    (s, p) => s + Number(p.valor) - Number(p.mensalidades?.valor_personal || 0), 0);
  renderDespesasAc(receitaAcademia);
}

function filtraDespAc(f, el) {
  acDespFiltro = f;
  document.querySelectorAll('#v-ac-despesas .fchip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderDespesasAc();
}

let acDespReceitaCache = 0;
function renderDespesasAc(receitaAcademia) {
  if (receitaAcademia !== undefined) acDespReceitaCache = receitaAcademia;

  const lista = AC_DESP_LIST.filter(d =>
    acDespFiltro === 'todas' ? true :
    acDespFiltro === 'pagas' ? d.status === 'pago' :
    acDespFiltro === 'apagar' ? d.status === 'a_pagar' :
    acDespFiltro === 'recorrentes' ? d.recorrente === true : true);

  const total = AC_DESP_LIST.reduce((s, d) => s + Number(d.valor), 0);
  const aPagar = AC_DESP_LIST.filter(d => d.status === 'a_pagar').reduce((s, d) => s + Number(d.valor), 0);
  document.getElementById('acdk-total').textContent = brl(total);
  document.getElementById('acdk-qtd').textContent = `${AC_DESP_LIST.length} lançamento(s)`;
  document.getElementById('acdk-apagar').textContent = brl(aPagar);
  document.getElementById('acdk-resultado').textContent = brl(acDespReceitaCache - total);

  const tb = document.getElementById('ac-desp-rows');
  if (!lista.length) {
    tb.innerHTML = '<tr><td colspan="6" class="vazio">Nenhuma despesa no período/filtro.</td></tr>';
    return;
  }

  tb.innerHTML = lista.map(d => `
    <tr>
      <td><b>${esc(d.descricao)}</b>${d.recorrente ? ' <span class="badge b-info" title="Gerada em lote junto com os outros meses dessa despesa">↻ recorrente</span>' : ''}</td>
      <td><span class="badge b-off">${esc(d.categoria)}</span></td>
      <td>${fmt(d.vencimento)}</td>
      <td><b>${brl(d.valor)}</b></td>
      <td>${d.status === 'pago'
        ? `<span class="badge b-ok">Pago</span>${d.pago_em ? `<div class="loc">${fmt(String(d.pago_em).slice(0,10))}</div>` : ''}`
        : '<span class="badge b-warn">A pagar</span>'}</td>
      <td><div class="acts">
        ${d.status !== 'pago' ? `<button class="icon-btn" title="Dar baixa (pago)" onclick="baixaDespesaAc(${d.id})">✔</button>` : ''}
        <button class="icon-btn" title="Editar" onclick="abrirDespesaAc(${d.id})">✎</button>
        <button class="icon-btn del" title="Excluir" onclick="excluirDespesaAc(${d.id})">🗑</button>
      </div></td>
    </tr>`).join('');
}

/* ---------------- NOVA / EDITAR ---------------- */
function abrirDespesaAc(id) {
  acDespEditId = id;
  const d = id ? AC_DESP_LIST.find(x => x.id === id) : null;
  document.getElementById('ac-md-title').textContent = d ? 'Editar despesa' : 'Nova despesa';
  document.getElementById('ac-md-desc').value = d?.descricao || '';
  document.getElementById('ac-md-cat').value = d?.categoria || 'Fixa';
  document.getElementById('ac-md-valor').value = d ? Number(d.valor).toFixed(2) : '';
  document.getElementById('ac-md-venc').value = d?.vencimento || new Date().toISOString().slice(0, 10);
  document.getElementById('ac-md-rec').checked = d?.recorrente === true;
  document.getElementById('ac-md-qtd-meses').value = 12;
  acDespToggleRecorrente();
  openModal('m-despesa-ac');
}

function acDespToggleRecorrente() {
  const rec = document.getElementById('ac-md-rec').checked;
  // Só mostra "quantos meses gerar" pra despesa NOVA — editar uma despesa
  // recorrente já existente não deve disparar geração em lote de novo.
  document.getElementById('ac-md-qtd-wrap').style.display = (rec && !acDespEditId) ? '' : 'none';
  document.getElementById('ac-md-nota-rec').textContent = acDespEditId
    ? 'Editando um lançamento já existente — isso não regenera nem afeta os outros meses já criados.'
    : 'Marcando recorrente, o sistema já cria os lançamentos dos próximos meses de uma vez (mesmo dia, mesmo valor) — não precisa relançar mês a mês.';
}

async function salvarDespesaAc() {
  const descricao = document.getElementById('ac-md-desc').value.trim();
  const valor = parseFloat(document.getElementById('ac-md-valor').value) || 0;
  const vencimento = document.getElementById('ac-md-venc').value;
  if (!descricao) { toast('Informe a descrição.'); return; }
  if (valor <= 0)  { toast('Informe um valor válido.'); return; }
  if (!vencimento) { toast('Informe o vencimento.'); return; }

  const recorrente = document.getElementById('ac-md-rec').checked;
  const categoria = document.getElementById('ac-md-cat').value;

  const registro = { descricao, categoria, valor, vencimento, recorrente };

  let error;
  if (acDespEditId) {
    ({ error } = await db.from('despesas').update(registro).eq('id', acDespEditId));
    if (error) { toast('Erro ao salvar: ' + error.message); return; }
    closeModal('m-despesa-ac');
    toast('Despesa atualizada ✓');
    carregarDespesasAc();
    return;
  }

  // Despesa nova: grava a primeira, e se for recorrente, já gera as
  // próximas N de uma vez (mesmo dia, mesmo valor) — em vez de só marcar
  // uma etiqueta que nunca vira lançamento de verdade nos meses seguintes.
  registro.academia_id = MEU_ACADEMIA_ID;
  ({ error } = await db.from('despesas').insert(registro));
  if (error) { toast('Erro ao salvar: ' + error.message); return; }

  let qtdGeradas = 0;
  if (recorrente) {
    const qtdMeses = parseInt(document.getElementById('ac-md-qtd-meses').value) || 12;
    const futuras = [];
    for (let i = 1; i < qtdMeses; i++) {
      futuras.push({
        academia_id: MEU_ACADEMIA_ID,
        descricao, categoria, valor, recorrente: true,
        vencimento: calcVencimentoPlano(vencimento, i),
      });
    }
    if (futuras.length) {
      const { error: eFut } = await db.from('despesas').insert(futuras);
      if (eFut) { toast('Despesa lançada, mas houve erro ao gerar os próximos meses: ' + eFut.message); carregarDespesasAc(); return; }
      qtdGeradas = futuras.length;
    }
  }

  closeModal('m-despesa-ac');
  toast(recorrente ? `Despesa lançada ✓ — mais ${qtdGeradas} mês(es) seguinte(s) já gerado(s).` : 'Despesa lançada ✓');
  carregarDespesasAc();
}

/* ---------------- BAIXA ---------------- */
async function baixaDespesaAc(id) {
  const d = AC_DESP_LIST.find(x => x.id === id);
  if (!d) return;
  if (!confirm(`Marcar "${d.descricao}" (${brl(d.valor)}) como paga?`)) return;
  const { error } = await db.from('despesas')
    .update({ status: 'pago', pago_em: new Date().toISOString() }).eq('id', id);
  toast(error ? 'Erro: ' + error.message : 'Despesa baixada ✓');
  carregarDespesasAc();
}

/* ---------------- EXCLUIR ---------------- */
async function excluirDespesaAc(id) {
  const d = AC_DESP_LIST.find(x => x.id === id);
  if (!d) return;
  const extra = d.recorrente
    ? '\n\nEsta despesa é recorrente — mas excluir esse lançamento afeta só ESSE mês. Os outros meses já gerados continuam intactos (exclua um por um, se quiser remover vários).'
    : '';
  if (!confirm(`Excluir a despesa "${d.descricao}" (${brl(d.valor)})?${extra}`)) return;
  const { error } = await db.from('despesas').delete().eq('id', id);
  toast(error ? 'Erro: ' + error.message : 'Despesa excluída ✓');
  carregarDespesasAc();
}
