/* ============================================================
   EVVO — MÓDULO FINANCEIRO (painel da academia)
   Migrado fielmente do HealFit Gestão: período + status + busca,
   reabrir fatura, editar vencimento, baixa manual (cancela no
   Asaas), cancelamento, recibo com valor efetivamente pago.
   ============================================================ */
let AC_FIN_LIST = [];
let acFinFiltro = 'todos';
let acFinFatSel = null;

/* ---------------- CARREGAR ---------------- */
function acFinPeriodoPadrao() {
  const h = new Date();
  const ini = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-01`;
  const fim = new Date(h.getFullYear(), h.getMonth() + 1, 0).toISOString().slice(0, 10);
  const elIni = document.getElementById('ac-fin-ini');
  const elFim = document.getElementById('ac-fin-fim');
  if (!elIni.value) elIni.value = ini;
  if (!elFim.value) elFim.value = fim;
}

async function carregarFinanceiroAc() {
  acFinPeriodoPadrao();
  const pIni = document.getElementById('ac-fin-ini').value;
  const pFim = document.getElementById('ac-fin-fim').value;

  const tb = document.getElementById('ac-fin-rows');
  tb.innerHTML = '<tr><td colspan="8" class="carregando">Carregando…</td></tr>';

  const { data, error } = await db.from('vw_financeiro')
    .select('*')
    .gte('vencimento', pIni)
    .lte('vencimento', pFim)
    .order('vencimento', { ascending: true });

  if (error) { tb.innerHTML = `<tr><td colspan="8" class="vazio">Erro: ${esc(error.message)}</td></tr>`; return; }
  AC_FIN_LIST = data || [];
  renderFinanceiroAc();
}

function filtraFinAc(f, el) {
  acFinFiltro = f;
  document.querySelectorAll('#v-ac-financeiro .fchip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderFinanceiroAc();
}

function renderFinanceiroAc() {
  const q = (document.getElementById('ac-fin-q').value || '').toLowerCase();
  const lista = AC_FIN_LIST
    .filter(m => (m.aluno || '').toLowerCase().includes(q))
    .filter(m => acFinFiltro === 'todos' ? m.status !== 'cancelado' : m.status === acFinFiltro);

  const soma = st => AC_FIN_LIST.filter(m => m.status === st).reduce((s, m) => s + Number(m.valor_total), 0);
  document.getElementById('acfk-recebido').textContent = brl(soma('pago'));
  document.getElementById('acfk-areceber').textContent = brl(soma('pendente'));
  document.getElementById('acfk-atrasado').textContent = brl(soma('atrasado'));
  document.getElementById('acfk-cancelado').textContent = brl(soma('cancelado'));

  const tb = document.getElementById('ac-fin-rows');
  if (!lista.length) {
    tb.innerHTML = '<tr><td colspan="8" class="vazio">Nenhuma fatura no período/filtro selecionado.</td></tr>';
    return;
  }

  tb.innerHTML = lista.map((m, i) => {
    const acoes = [];
    if (m.status === 'pendente' || m.status === 'atrasado') {
      acoes.push(`<button class="icon-btn" title="Ver fatura / enviar" onclick="finAbrirFaturaAc(${m.id})">📄</button>`);
      acoes.push(`<button class="icon-btn" title="Alterar vencimento" onclick="finEditarVencAc(${m.id})">✎</button>`);
      acoes.push(`<button class="icon-btn" title="Baixa manual" onclick="finBaixaManualAc(${m.id})">✔</button>`);
      acoes.push(`<button class="icon-btn del" title="Cancelar fatura" onclick="finCancelarAc(${m.id})">🗑</button>`);
    } else if (m.status === 'pago') {
      if (m.token_publico) acoes.push(`<a class="icon-btn" title="Abrir comprovante" href="${EVVO_CONFIG.PAGINA_FATURA || '#'}?t=${m.token_publico}" target="_blank" style="text-decoration:none">🔗</a>`);
      acoes.push(`<button class="icon-btn" title="Enviar recibo no WhatsApp" onclick="finReciboAc(${m.id})">🧾</button>`);
    }
    return `
    <tr>
      <td><div class="acad-cell"><div class="av" style="background:${corDe(i)}">${ini(m.aluno)}</div>
        <div><div class="nm">${esc(m.aluno)}</div><div class="loc">#MEN-${String(m.competencia).slice(0,7).replace('-','')}-${String(m.id).padStart(4,'0')}</div></div></div></td>
      <td>${fmt(m.vencimento)}</td>
      <td>${brl(m.valor_academia)}</td>
      <td>${Number(m.valor_personal) > 0 ? brl(m.valor_personal) + `<div class="loc">${esc(m.personal || '')}</div>` : '—'}</td>
      <td><b>${brl(m.valor_total)}</b></td>
      <td>${m.forma_pagamento ? esc(m.forma_pagamento).toUpperCase() : '—'}</td>
      <td>${stBadgeAc(m.status)}${m.pago_em ? `<div class="loc">${fmt(String(m.pago_em).slice(0,10))}</div>` : ''}</td>
      <td><div class="acts">${acoes.join('')}</div></td>
    </tr>`;
  }).join('');
}

/* ---------------- REABRIR FATURA ---------------- */
async function finAbrirFaturaAc(id) {
  const m = AC_FIN_LIST.find(x => x.id === id);
  if (!m) return;
  const { data: aluno } = await db.from('alunos').select('nome, whatsapp').eq('id', m.aluno_id).single();
  mostrarFaturaAc(aluno || { nome: m.aluno, whatsapp: null }, m);
}

/* ---------------- ALTERAR VENCIMENTO ---------------- */
function finEditarVencAc(id) {
  acFinFatSel = AC_FIN_LIST.find(x => x.id === id);
  if (!acFinFatSel) return;
  document.getElementById('ac-mv-aluno').value = `${acFinFatSel.aluno} — ${brl(acFinFatSel.valor_total)}`;
  document.getElementById('ac-mv-venc').value = acFinFatSel.vencimento;
  openModal('m-venc-ac');
}

async function finSalvarVencAc() {
  const novo = document.getElementById('ac-mv-venc').value;
  if (!novo) { toast('Escolha a nova data.'); return; }
  const btn = document.getElementById('ac-mv-salvar');
  btn.disabled = true; toast('Reemitindo boleto com a nova data…');

  const { data, error } = await db.functions.invoke('gerenciar-fatura', {
    body: { acao: 'vencimento', mensalidade_id: acFinFatSel.id, novo_vencimento: novo },
  });
  btn.disabled = false;
  if (error || data?.erro) {
    let msg = data?.erro || error.message;
    try { const b = await error?.context?.json?.(); if (b?.erro) msg = b.erro; } catch (_) {}
    toast('Não alterou: ' + msg); return;
  }
  closeModal('m-venc-ac');
  toast(data.msg || 'Vencimento alterado ✓');
  carregarFinanceiroAc();
}

/* ---------------- BAIXA MANUAL ---------------- */
function finBaixaManualAc(id) {
  acFinFatSel = AC_FIN_LIST.find(x => x.id === id);
  if (!acFinFatSel) return;
  document.getElementById('ac-mb-aluno').value = `${acFinFatSel.aluno} — fatura de ${brl(acFinFatSel.valor_total)}`;
  document.getElementById('ac-mb-valor').value = Number(acFinFatSel.valor_total).toFixed(2);
  document.getElementById('ac-mb-obs').value = '';
  document.getElementById('ac-mb-aviso').style.display = 'none';
  openModal('m-baixa-ac');
}

function finBaixaConferirAc() {
  const v = parseFloat(document.getElementById('ac-mb-valor').value) || 0;
  const aviso = document.getElementById('ac-mb-aviso');
  const vp = Number(acFinFatSel?.valor_personal || 0);
  if (vp > 0 && v < vp) {
    aviso.textContent = `⚠ Atenção: o valor pago (${brl(v)}) é MENOR que a parte do personal (${brl(vp)}). O repasse ao personal continua sendo ${brl(vp)} — o desconto sai da parte da academia.`;
    aviso.style.display = 'block';
  } else if (v !== Number(acFinFatSel?.valor_total)) {
    aviso.textContent = `Valor diferente da fatura (${brl(acFinFatSel.valor_total)}). Informe o motivo na observação.`;
    aviso.style.display = 'block';
  } else {
    aviso.style.display = 'none';
  }
}

async function finSalvarBaixaAc() {
  const valor = parseFloat(document.getElementById('ac-mb-valor').value) || 0;
  const obs = document.getElementById('ac-mb-obs').value.trim();
  if (valor <= 0) { toast('Informe o valor recebido.'); return; }
  if (valor !== Number(acFinFatSel.valor_total) && !obs) {
    toast('Valor diferente da fatura: a observação é obrigatória.'); return;
  }
  if (!confirm(`Confirmar baixa manual de ${brl(valor)} para ${acFinFatSel.aluno}?\n\nO boleto/PIX será CANCELADO no Asaas.`)) return;

  const btn = document.getElementById('ac-mb-salvar');
  btn.disabled = true; toast('Registrando baixa…');

  const { data, error } = await db.functions.invoke('gerenciar-fatura', {
    body: { acao: 'baixa', mensalidade_id: acFinFatSel.id, valor_pago: valor, observacao: obs },
  });
  btn.disabled = false;
  if (error || data?.erro) {
    let msg = data?.erro || error.message;
    try { const b = await error?.context?.json?.(); if (b?.erro) msg = b.erro; } catch (_) {}
    toast('Não baixou: ' + msg); return;
  }
  closeModal('m-baixa-ac');
  toast(data.msg || 'Baixa registrada ✓');
  carregarFinanceiroAc();
}

/* ---------------- CANCELAR ---------------- */
async function finCancelarAc(id) {
  const m = AC_FIN_LIST.find(x => x.id === id);
  if (!m) return;
  if (!confirm(`Cancelar a fatura de ${m.aluno} (${brl(m.valor_total)})?`)) return;

  toast('Cancelando no Asaas…');
  const { data, error } = await db.functions.invoke('gerenciar-fatura', {
    body: { acao: 'cancelar', mensalidade_id: id },
  });
  if (error || data?.erro) {
    let msg = data?.erro || error.message;
    try { const b = await error?.context?.json?.(); if (b?.erro) msg = b.erro; } catch (_) {}
    toast('Não cancelou: ' + msg); return;
  }
  toast(data.msg || 'Fatura cancelada ✓');
  carregarFinanceiroAc();
}

/* ---------------- RECIBO ---------------- */
async function finReciboAc(id) {
  const m = AC_FIN_LIST.find(x => x.id === id);
  if (!m) return;
  const { data: aluno } = await db.from('alunos').select('nome, whatsapp').eq('id', m.aluno_id).single();
  const zap = (aluno?.whatsapp || '').replace(/\D/g, '');
  if (!zap) { toast('Aluno sem WhatsApp cadastrado.'); return; }

  const { data: pg } = await db.from('pagamentos')
    .select('valor, pago_em').eq('mensalidade_id', m.id)
    .order('pago_em', { ascending: false }).limit(1).maybeSingle();
  const valorRecebido = Number(pg?.valor ?? m.valor_total);
  const dataPagto = pg?.pago_em ?? m.pago_em;

  const nomeAcademia = (document.getElementById('ac-nome-academia').textContent || 'EVVO').toUpperCase();
  const comp = String(m.competencia).slice(0, 7).split('-').reverse().join('/');
  const msg = encodeURIComponent(
    `*${nomeAcademia} - RECIBO*\n\n` +
    `Olá, ${m.aluno.split(' ')[0]}!\n` +
    `Confirmamos o recebimento de *${brl(valorRecebido)}* referente à mensalidade ${comp}.\n` +
    `Data do pagamento: ${fmt(String(dataPagto).slice(0, 10))}\n\n` +
    `Obrigado e bons treinos!`
  );
  window.open(`https://wa.me/55${zap}?text=${msg}`, '_blank');
}
