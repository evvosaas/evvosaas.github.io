/* ============================================================
   EVVO MASTER — MINHAS RECEITAS
   Registro manual do que cada academia paga pelo Evvo. Quando a
   cobrança automática via Asaas (fase futura) existir, ela vai
   gravar aqui sozinha — esta tela não muda.
   ============================================================ */
let REC_LIST = [];
let rpAcademiaPreSelecionada = null;

async function carregarReceitas() {
  const tb = document.getElementById('rec-rows');
  tb.innerHTML = '<tr><td colspan="5" class="carregando">Carregando…</td></tr>';

  const [{ data: pagamentos, error }, { data: academiasAtivas }] = await Promise.all([
    db.from('pagamentos_academias').select('*, academias(nome)').order('pago_em', { ascending: false }),
    db.from('academias').select('valor_mensalidade').eq('status', 'ativa'),
  ]);

  if (error) { tb.innerHTML = `<tr><td colspan="5" class="vazio">Erro: ${esc(error.message)}</td></tr>`; return; }
  REC_LIST = pagamentos || [];

  const hoje = new Date();
  const iniMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
  const recebidoMes = REC_LIST.filter(p => p.pago_em >= iniMes).reduce((s, p) => s + Number(p.valor), 0);
  const recebidoTotal = REC_LIST.reduce((s, p) => s + Number(p.valor), 0);
  const mrr = (academiasAtivas || []).reduce((s, a) => s + Number(a.valor_mensalidade || 0), 0);

  document.getElementById('rec-mes').textContent = brl(recebidoMes);
  document.getElementById('rec-total').textContent = brl(recebidoTotal);
  document.getElementById('rec-mrr').textContent = brl(mrr);

  if (!REC_LIST.length) {
    tb.innerHTML = '<tr><td colspan="5" class="vazio">Nenhum pagamento registrado ainda.</td></tr>';
    return;
  }

  tb.innerHTML = REC_LIST.map(p => `
    <tr>
      <td><b>${esc(p.academias?.nome || '—')}</b></td>
      <td><b>${brl(p.valor)}</b></td>
      <td>${fmt(p.pago_em)}</td>
      <td>${esc(p.observacao || '—')}</td>
      <td><div class="acts"><button class="icon-btn del" title="Remover registro" onclick="excluirPagamentoAc(${p.id})">🗑</button></div></td>
    </tr>`).join('');
}

/* ---------------- REGISTRAR PAGAMENTO ---------------- */
async function abrirRegistrarPagamentoAc(academiaIdPre) {
  rpAcademiaPreSelecionada = academiaIdPre;
  const { data: todasAcademias } = await db.from('academias').select('id, nome').order('nome');
  const sel = document.getElementById('rp-academia');
  sel.innerHTML = (todasAcademias || []).map(a => `<option value="${a.id}">${esc(a.nome)}</option>`).join('');
  if (academiaIdPre) sel.value = academiaIdPre;

  document.getElementById('rp-valor').value = '';
  document.getElementById('rp-data').value = new Date().toISOString().slice(0, 10);
  document.getElementById('rp-obs').value = '';
  openModal('m-registrar-pag');
}

async function salvarPagamentoAc() {
  const academia_id = Number(document.getElementById('rp-academia').value);
  const valor = parseFloat(document.getElementById('rp-valor').value) || 0;
  const pago_em = document.getElementById('rp-data').value;
  const observacao = document.getElementById('rp-obs').value.trim() || null;

  if (!academia_id) { toast('Selecione a academia.'); return; }
  if (valor <= 0) { toast('Informe um valor válido.'); return; }
  if (!pago_em) { toast('Informe a data do pagamento.'); return; }

  const { error } = await db.from('pagamentos_academias').insert({ academia_id, valor, pago_em, observacao });
  if (error) { toast('Erro: ' + error.message); return; }

  closeModal('m-registrar-pag');
  toast('Pagamento registrado ✓');
  if (document.getElementById('v-receitas').classList.contains('active')) carregarReceitas();
}

async function excluirPagamentoAc(id) {
  if (!confirm('Remover este registro de pagamento?')) return;
  const { error } = await db.from('pagamentos_academias').delete().eq('id', id);
  toast(error ? 'Erro: ' + error.message : 'Registro removido ✓');
  carregarReceitas();
}
