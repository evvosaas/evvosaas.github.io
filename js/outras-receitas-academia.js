/* ============================================================
   EVVO — MÓDULO OUTRAS RECEITAS (painel da academia)
   Duas peças: cadastro de itens RECORRENTES (ex: personal pagando
   uso do espaço, mensal) e os LANÇAMENTOS em si (gerados a partir
   de um recorrente, mês a mês, ou avulsos digitados na hora).
   Sem repasse — 100% do valor é receita líquida da academia.
   ============================================================ */
let AC_OREC_LIST = [];
let acOrecEditId = null;
let AC_OREC_LANC = [];
let AC_OREC_PERSONAIS = [];

/* ---------------- CARREGAR ---------------- */
async function carregarOutrasReceitasAc() {
  const grid = document.getElementById('ac-orec-grid');
  grid.innerHTML = '<div class="carregando" style="grid-column:1/-1">Carregando…</div>';

  const [{ data: recorrentes, error }, { data: lanc }, { data: personais }] = await Promise.all([
    db.from('outras_receitas_recorrentes').select('*, personais(nome)').order('descricao'),
    db.from('outras_receitas').select('*').order('created_at', { ascending: false }).limit(50),
    db.from('personais').select('id, nome').eq('ativo', true).order('nome'),
  ]);
  if (error) { grid.innerHTML = `<div class="vazio" style="grid-column:1/-1">Erro: ${esc(error.message)}</div>`; return; }
  AC_OREC_LIST = recorrentes || [];
  AC_OREC_LANC = lanc || [];
  AC_OREC_PERSONAIS = personais || [];

  const competenciaAtual = new Date().toISOString().slice(0, 7) + '-01';
  const jaGeradoEsseMes = new Set(
    AC_OREC_LANC.filter(l => l.recorrente_id && l.competencia === competenciaAtual && l.status !== 'cancelado').map(l => l.recorrente_id)
  );

  if (!AC_OREC_LIST.length) {
    grid.innerHTML = '<div class="vazio" style="grid-column:1/-1">Nenhum item recorrente cadastrado. Use "+ Novo item recorrente".</div>';
  } else {
    grid.innerHTML = AC_OREC_LIST.map((r, i) => `
      <div class="pers-card">
        <div class="pers-acts">
          <button class="icon-btn" title="Editar" onclick="abrirRecorrenteAc(${r.id})">✎</button>
          <button class="icon-btn del" title="Excluir" onclick="excluirRecorrenteAc(${r.id})">🗑</button>
        </div>
        <div class="pers-top">
          <div class="av" style="background:${corDe(i)}">${ini(r.descricao)}</div>
          <div><div class="nm">${esc(r.descricao)}</div>
            <div class="cref">${r.categoria ? esc(r.categoria) : ''}${r.personais?.nome ? ' · ' + esc(r.personais.nome) : ''}</div></div>
        </div>
        <div class="loc" style="margin-top:8px;font-size:13px"><b>${brl(r.valor_mensal)}</b>/mês · vencimento dia ${r.dia_vencimento}</div>
        ${r.ativo === false ? '<div style="margin-top:10px"><span class="badge b-off">Inativo</span></div>' : `
          <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
            ${jaGeradoEsseMes.has(r.id)
              ? '<span class="badge b-ok">Já gerado este mês</span>'
              : `<button class="btn btn-ghost" style="width:100%" onclick="gerarCobrancaRecorrenteAc(${r.id})">📅 Gerar cobrança do mês (manual)</button>
                 ${r.personal_id ? `<button class="btn btn-primary" style="width:100%" onclick="gerarCobrancaRecorrenteAsaasAc(${r.id})">🔗 Gerar via Asaas (boleto/PIX)</button>` : ''}`}
          </div>`}
      </div>`).join('');
  }

  /* ---------- Lançamentos ---------- */
  const tb = document.getElementById('ac-orec-rows');
  if (!AC_OREC_LANC.length) {
    tb.innerHTML = '<tr><td colspan="6" class="vazio">Nenhum lançamento ainda.</td></tr>';
  } else {
    tb.innerHTML = AC_OREC_LANC.map(l => {
      const statusBadge = l.status === 'pago' ? '<span class="badge b-ok">Pago</span>'
        : l.status === 'atrasado' ? '<span class="badge b-late">Atrasado</span>'
        : l.status === 'cancelado' ? '<span class="badge b-off">Cancelado</span>'
        : '<span class="badge b-warn">Pendente</span>';
      const acoes = (l.status === 'pendente' || l.status === 'atrasado')
        ? `<button class="icon-btn" title="Dar baixa manual" onclick="abrirBaixaOrecAc(${l.id})">💰</button>
           <button class="icon-btn del" title="Cancelar" onclick="cancelarOrecAc(${l.id})">✕</button>`
        : '';
      const dataRef = l.competencia ? fmt(l.competencia).slice(3) : fmt(l.data_lancamento);
      const link = l.origem === 'asaas' && (l.url_fatura || l.url_boleto)
        ? ` <a href="${l.url_fatura || l.url_boleto}" target="_blank" title="Abrir fatura no Asaas">🔗</a>` : '';
      return `<tr>
        <td>${dataRef}</td>
        <td>${esc(l.descricao)}${link}</td>
        <td>${l.categoria ? esc(l.categoria) : '—'}</td>
        <td><b>${brl(l.valor)}</b></td>
        <td>${statusBadge}</td>
        <td style="white-space:nowrap">${acoes}</td>
      </tr>`;
    }).join('');
  }
}

/* ---------------- CADASTRO DE ITEM RECORRENTE ---------------- */
function abrirRecorrenteAc(id) {
  acOrecEditId = id;
  const r = id ? AC_OREC_LIST.find(x => x.id === id) : null;
  document.getElementById('ac-mor-title').textContent = r ? 'Editar item recorrente' : 'Novo item recorrente';
  document.getElementById('ac-mor-desc').value = r?.descricao || '';
  document.getElementById('ac-mor-cat').value = r?.categoria || '';
  document.getElementById('ac-mor-valor').value = r?.valor_mensal ?? '';
  document.getElementById('ac-mor-dia').value = r?.dia_vencimento ?? 5;
  document.getElementById('ac-mor-ativo').checked = r ? r.ativo !== false : true;

  document.getElementById('ac-mor-personal').innerHTML = '<option value="">— nenhum —</option>' +
    AC_OREC_PERSONAIS.map(p => `<option value="${p.id}" ${r?.personal_id === p.id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('');

  const cats = [...new Set(AC_OREC_LIST.map(x => x.categoria).filter(Boolean))];
  document.getElementById('ac-mor-cat-sugestoes').innerHTML = cats.map(c => `<option value="${esc(c)}">`).join('');

  openModal('m-recorrente-ac');
}

async function salvarRecorrenteAc() {
  const descricao = document.getElementById('ac-mor-desc').value.trim();
  const valor_mensal = parseFloat(document.getElementById('ac-mor-valor').value) || 0;
  if (!descricao) { toast('Informe a descrição.'); return; }
  if (valor_mensal <= 0) { toast('Informe um valor mensal válido.'); return; }

  const registro = {
    descricao,
    categoria: document.getElementById('ac-mor-cat').value.trim() || null,
    personal_id: document.getElementById('ac-mor-personal').value || null,
    valor_mensal,
    dia_vencimento: parseInt(document.getElementById('ac-mor-dia').value) || 5,
    ativo: document.getElementById('ac-mor-ativo').checked,
  };
  let error;
  if (acOrecEditId) {
    ({ error } = await db.from('outras_receitas_recorrentes').update(registro).eq('id', acOrecEditId));
  } else {
    registro.academia_id = MEU_ACADEMIA_ID;
    ({ error } = await db.from('outras_receitas_recorrentes').insert(registro));
  }
  if (error) { toast('Erro ao salvar: ' + error.message); return; }
  closeModal('m-recorrente-ac');
  toast(acOrecEditId ? 'Item atualizado ✓' : 'Item recorrente cadastrado ✓');
  carregarOutrasReceitasAc();
}

async function excluirRecorrenteAc(id) {
  const r = AC_OREC_LIST.find(x => x.id === id);
  if (!r) return;

  const { count: temLancamentos } = await db.from('outras_receitas')
    .select('id', { count: 'exact', head: true }).eq('recorrente_id', id);

  if (temLancamentos > 0) {
    if (confirm(`"${r.descricao}" já tem ${temLancamentos} lançamento(s) no histórico.\n\nPor segurança, o sistema INATIVA em vez de excluir (histórico preservado).\n\nOK = Inativar | Cancelar = não fazer nada`)) {
      const { error } = await db.from('outras_receitas_recorrentes').update({ ativo: false }).eq('id', id);
      toast(error ? 'Erro: ' + error.message : 'Item inativado ✓ — histórico preservado.');
      carregarOutrasReceitasAc();
    }
    return;
  }

  if (!confirm(`Excluir "${r.descricao}"?`)) return;
  const { error } = await db.from('outras_receitas_recorrentes').delete().eq('id', id);
  toast(error ? 'Erro: ' + error.message : 'Item excluído ✓');
  carregarOutrasReceitasAc();
}

/* ---------------- GERAR COBRANÇA DO MÊS (a partir de um recorrente) ---------------- */
async function gerarCobrancaRecorrenteAc(id) {
  const r = AC_OREC_LIST.find(x => x.id === id);
  if (!r) return;
  const competencia = new Date().toISOString().slice(0, 7) + '-01';
  if (!confirm(`Gerar a cobrança de ${competencia.slice(5,7)}/${competencia.slice(0,4)} para "${r.descricao}" no valor de ${brl(r.valor_mensal)}?`)) return;

  const { error } = await db.from('outras_receitas').insert({
    academia_id: MEU_ACADEMIA_ID,
    recorrente_id: r.id,
    descricao: r.descricao,
    categoria: r.categoria,
    competencia,
    valor: r.valor_mensal,
    origem: 'manual',
    status: 'pendente',
  });
  if (error) {
    toast(error.code === '23505' ? 'Essa competência já foi gerada para este item.' : 'Erro: ' + error.message);
    return;
  }
  toast('Cobrança do mês gerada ✓ (pendente — dê baixa quando o personal pagar)');
  carregarOutrasReceitasAc();
}

async function gerarCobrancaRecorrenteAsaasAc(id) {
  const r = AC_OREC_LIST.find(x => x.id === id);
  if (!r) return;
  if (!confirm(`Gerar boleto/PIX no Asaas para "${r.descricao}" no valor de ${brl(r.valor_mensal)}?`)) return;

  toast('Gerando cobrança no Asaas…');
  const { data, error } = await db.functions.invoke('criar-cobranca-outras-receitas', {
    body: { recorrente_id: id },
  });
  if (error || data?.erro) {
    let msg = data?.erro || error.message;
    try { const b = await error?.context?.json?.(); if (b?.erro) msg = b.erro; } catch (_) {}
    toast('Não gerou: ' + msg);
    return;
  }
  mostrarLancamentoOrecGerado(data.personal, data.lancamento);
  carregarOutrasReceitasAc();
}

/* ---------------- RESULTADO: link/PIX/boleto gerado via Asaas ---------------- */
function mostrarLancamentoOrecGerado(personal, l) {
  document.getElementById('ac-mf-aluno').textContent = personal?.nome || l.descricao;
  document.getElementById('ac-mf-info').textContent = `${brl(l.valor)} · vencimento ${fmt(l.data_lancamento)}`;

  const zap = (personal?.whatsapp || '').replace(/\D/g, '');
  const msg = encodeURIComponent(
    `Olá! Segue a cobrança referente a: ${l.descricao}\n\n` +
    `Valor: *${brl(l.valor)}*\n` +
    `Vencimento: ${fmt(l.data_lancamento)}\n\n` +
    `Pague por boleto ou PIX no link:\n${l.url_fatura || l.url_boleto || ''}`
  );

  const links = document.getElementById('ac-mf-links');
  links.innerHTML = `
    ${l.url_fatura ? `<a class="btn btn-primary" href="${l.url_fatura}" target="_blank">🔗 Abrir fatura no Asaas</a>` : ''}
    ${zap ? `<a class="btn btn-primary" style="background:var(--ok)" href="https://wa.me/55${zap}?text=${msg}" target="_blank">💬 Enviar no WhatsApp</a>`
          : '<div class="hint">Sem WhatsApp cadastrado.</div>'}
    ${l.url_boleto ? `<a class="btn btn-ghost" href="${l.url_boleto}" target="_blank">📄 PDF do boleto</a>` : ''}
    ${l.pix_copia_cola ? `<div class="hint" style="max-width:none">PIX copia-e-cola (clique para copiar):</div>
      <div class="linha-copiavel" style="font-family:'JetBrains Mono',monospace;font-size:11.5px;background:var(--card2);border:1px dashed var(--line);border-radius:10px;padding:11px 13px;word-break:break-all;cursor:pointer" onclick="navigator.clipboard.writeText(this.textContent).then(()=>toast('PIX copiado ✓'))">${esc(l.pix_copia_cola)}</div>` : ''}
  `;
  openModal('m-fatura-ac');
}

/* ---------------- RECEITA AVULSA (sem vínculo recorrente) ---------------- */
function abrirReceitaAvulsaAc() {
  document.getElementById('ac-rav-desc').value = '';
  document.getElementById('ac-rav-cat').value = '';
  document.getElementById('ac-rav-data').value = new Date().toISOString().slice(0, 10);
  document.getElementById('ac-rav-valor').value = '';
  document.getElementById('ac-rav-forma').value = 'dinheiro';
  openModal('m-receita-avulsa-ac');
}

async function salvarReceitaAvulsaAc() {
  const descricao = document.getElementById('ac-rav-desc').value.trim();
  const data_lancamento = document.getElementById('ac-rav-data').value;
  const valor = parseFloat(document.getElementById('ac-rav-valor').value) || 0;
  if (!descricao) { toast('Informe a descrição.'); return; }
  if (valor <= 0) { toast('Informe um valor válido.'); return; }

  const { error } = await db.from('outras_receitas').insert({
    academia_id: MEU_ACADEMIA_ID,
    recorrente_id: null,
    descricao,
    categoria: document.getElementById('ac-rav-cat').value.trim() || null,
    data_lancamento,
    valor,
    origem: 'manual',
    status: 'pago',
    pago_em: new Date().toISOString(),
    forma_pagamento: document.getElementById('ac-rav-forma').value,
  });
  if (error) { toast('Erro ao salvar: ' + error.message); return; }
  closeModal('m-receita-avulsa-ac');
  toast('Receita avulsa registrada ✓');
  carregarOutrasReceitasAc();
}

/* ---------------- BAIXA MANUAL (lançamento pendente vira pago) ---------------- */
async function abrirBaixaOrecAc(id) {
  const l = AC_OREC_LANC.find(x => x.id === id);
  if (!l) return;
  const avisoAsaas = l.origem === 'asaas' ? '\n\nO boleto/PIX será CANCELADO no Asaas.' : '';
  if (!confirm(`Confirmar recebimento de ${brl(l.valor)} — "${l.descricao}"?${avisoAsaas}`)) return;

  if (l.origem === 'asaas') {
    toast('Registrando baixa…');
    const { data, error } = await db.functions.invoke('gerenciar-outras-receitas', {
      body: { acao: 'baixa', lancamento_id: id, forma_detalhe: 'outro', observacao: 'Baixa manual pelo painel' },
    });
    if (error || data?.erro) {
      let msg = data?.erro || error.message;
      try { const b = await error?.context?.json?.(); if (b?.erro) msg = b.erro; } catch (_) {}
      toast('Não baixou: ' + msg);
      return;
    }
    toast(data.msg || 'Baixa registrada ✓');
    carregarOutrasReceitasAc();
    return;
  }

  const { error } = await db.from('outras_receitas').update({
    status: 'pago',
    pago_em: new Date().toISOString(),
    forma_pagamento: 'dinheiro',
  }).eq('id', l.id);
  if (error) { toast('Erro: ' + error.message); return; }
  toast('Baixa registrada ✓');
  carregarOutrasReceitasAc();
}

async function cancelarOrecAc(id) {
  const l = AC_OREC_LANC.find(x => x.id === id);
  if (!l) return;
  const avisoAsaas = l.origem === 'asaas' ? ' O boleto/PIX será cancelado no Asaas.' : '';
  if (!confirm(`Cancelar o lançamento "${l.descricao}" (${brl(l.valor)})?${avisoAsaas}`)) return;

  if (l.origem === 'asaas') {
    toast('Cancelando…');
    const { data, error } = await db.functions.invoke('gerenciar-outras-receitas', {
      body: { acao: 'cancelar', lancamento_id: id },
    });
    if (error || data?.erro) {
      let msg = data?.erro || error.message;
      try { const b = await error?.context?.json?.(); if (b?.erro) msg = b.erro; } catch (_) {}
      toast('Não cancelou: ' + msg);
      return;
    }
    toast(data.msg || 'Lançamento cancelado ✓');
    carregarOutrasReceitasAc();
    return;
  }

  const { error } = await db.from('outras_receitas').update({ status: 'cancelado' }).eq('id', id);
  if (error) { toast('Erro: ' + error.message); return; }
  toast('Lançamento cancelado ✓');
  carregarOutrasReceitasAc();
}
